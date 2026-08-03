import BigNumber from 'bignumber.js';
import mongoose from 'mongoose';
import Account from '../models/account.model.js';
import Transaction from '../models/transaction.model.js';
import Transfer from '../models/transfer.model.js';
import Loan from '../models/loan.model.js';

const MAX_RETRIES = 15;

function isRetryableError(error) {
    return (
        error.message === 'VERSION_CONFLICT' ||
        error.errorLabels?.includes('TransientTransactionError') ||
        error.codeName === 'WriteConflict'
    );
};

function parsePositiveAmount(amount, label = 'Amount') {
    const value = new BigNumber(amount);
    if (!value.isFinite() || value.isLessThanOrEqualTo(0)) {
        const error = new Error(`${label} must be a positive number`);
        error.statusCode = 400;
        throw error;
    }
    // Reject sub-cent precision instead of silently rounding it away, since it would previously be stored verbatim on the transaction but rounded to 0.00 on the balance, leaving the two out of sync.
    if (value.decimalPlaces() > 2) {
        const error = new Error(`${label} cannot have more than 2 decimal places`);
        error.statusCode = 400;
        throw error;
    }
    return value;
}

function toDecimal128(bigNumberValue) {
    return mongoose.Types.Decimal128.fromString(bigNumberValue.toFixed(2));
}

function randomJitter() {
    return new Promise((resolve) => setTimeout(resolve, Math.random() * 30));
}

// ============================================================================
// CHANGE: extracted the retry-with-transaction pattern that was previously
// copy-pasted (with identical shape) inside deposit(), withdraw(), transfer(),
// and repayLoan(). Any function that needs "run this in a Mongo transaction,
// retry on transient write conflicts, jitter between attempts" now calls this
// instead of hand-rolling its own for-loop. This also closes the gap where
// deposit()'s sessionOption branch (used by loan disbursement) had NO retry
// coverage at all — see the comment on withTransactionRetry below and the
// updated loan.controller.js.
//
// fn receives the active session and must return the result to hand back to
// the caller. fn should throw errors with a .statusCode where applicable, the
// same convention already used throughout this file.
// ============================================================================
export async function withTransactionRetry(fn) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const session = await mongoose.startSession();
        try {
            session.startTransaction();
            const result = await fn(session);
            await session.commitTransaction();
            return result;
        } catch (error) {
            await session.abortTransaction();
            if (!isRetryableError(error) || attempt === MAX_RETRIES - 1) {
                throw error;
            }
            await randomJitter();
        } finally {
            session.endSession();
        }
    }
}

export async function deposit({ accountNumber, amount, initiatedBy, idempotencyKey, description }, sessionOption = null) {
    const depositAmount = parsePositiveAmount(amount, 'Deposit amount');
    const incValue = toDecimal128(depositAmount);

    async function runDeposit(session) {
        const updatedAccount = await Account.findOneAndUpdate(
            { accountNumber, status: 'active' },
            { $inc: { balance: incValue, version: 1 } },
            { returnDocument: 'after', session }
        );

        if (!updatedAccount) {
            const existing = await Account.findOne({ accountNumber }).session(session);
            if (!existing) {
                const error = new Error('Account not found');
                error.statusCode = 404;
                throw error;
            }
            const error = new Error(`Cannot deposit into a ${existing.status} account`);
            error.statusCode = 400;
            throw error;
        }

        const transaction = await Transaction.create([{
            transactionId: idempotencyKey,
            account: updatedAccount._id,
            type: 'deposit',
            amount: depositAmount.toFixed(2),
            balanceAfter: updatedAccount.balance,
            status: 'completed',
            description,
            initiatedBy,
            idempotencyKey,
        }], { session });

        return { account: updatedAccount, transaction: transaction[0] };
    }

    if (sessionOption) {
        // ------------------------------------------------------------------
        // CHANGE: previously this branch ran once with no retry coverage at
        // all — if the caller's outer transaction hit a transient write
        // conflict (e.g. two managers confirming different loans that touch
        // the same account concurrently), the whole caller transaction just
        // failed. Callers that need retry coverage should now use
        // withTransactionRetry() themselves and pass the session it gives
        // them in here (see approveLoan in loan.controller.js). This branch
        // itself stays a single attempt, since it does not own the
        // transaction/session lifecycle — it participates in whatever
        // transaction the caller is already retrying.
        // ------------------------------------------------------------------
        return runDeposit(sessionOption);
    }

    return withTransactionRetry(runDeposit);
}

export async function withdraw({ accountNumber, amount, initiatedBy, idempotencyKey, description }) {
    const withdrawalAmount = parsePositiveAmount(amount, 'Withdrawal amount');

    return withTransactionRetry(async (session) => {
        // overdraftLimit changes far less often than balance and isn't itself part of
        // the race we're closing, so a plain read for it here is fine — the balance
        // check below is what must be atomic, and it is.
        const preCheck = await Account.findOne({ accountNumber }).session(session);
        if (!preCheck) {
            const error = new Error('Account not found');
            error.statusCode = 404;
            throw error;
        }
        if (preCheck.status !== 'active') {
            const error = new Error(`Cannot withdraw from a ${preCheck.status} account`);
            error.statusCode = 400;
            throw error;
        }

        const overdraftLimit = new BigNumber(preCheck.overdraftLimit.toString());
        // Balance must stay >= -overdraftLimit after the withdrawal, i.e. the
        // CURRENT balance must be >= withdrawalAmount - overdraftLimit. This
        // threshold is evaluated as part of the same atomic operation that performs
        // the debit, so a concurrent withdrawal cannot slip through a window between
        // "check balance" and "apply debit" — there is no such window anymore.
        const minRequiredBalance = toDecimal128(withdrawalAmount.minus(overdraftLimit));
        const decValue = toDecimal128(withdrawalAmount.negated());

        const updatedAccount = await Account.findOneAndUpdate(
            { _id: preCheck._id, status: 'active', balance: { $gte: minRequiredBalance } },
            { $inc: { balance: decValue, version: 1 } },
            { returnDocument: 'after', session });

        if (!updatedAccount) {
            // Re-check with fresh eyes: the account may have gone inactive, or —
            // most likely — another request already spent the funds since our read
            // above. Either way, this is a real, current rejection, not a stale one.
            const fresh = await Account.findById(preCheck._id).session(session);
            if (!fresh || fresh.status !== 'active') {
                const error = new Error(`Cannot withdraw from a ${fresh ? fresh.status : 'missing'} account`);
                error.statusCode = 400;
                throw error;
            }
            const error = new Error('Insufficient funds');
            error.statusCode = 400;
            throw error;
        }

        const transaction = await Transaction.create([{
            transactionId: idempotencyKey,
            account: updatedAccount._id,
            type: 'withdrawal',
            amount: withdrawalAmount.toFixed(2),
            balanceAfter: updatedAccount.balance,
            status: 'completed',
            description: description || 'Withdrawal',
            initiatedBy,
            idempotencyKey,
        }], { session });

        return { account: updatedAccount, transaction: transaction[0] };
    });
}

export async function transfer({ fromAccountNumber, toAccountNumber, amount, initiatedBy, idempotencyKey, note }) {
    if (fromAccountNumber === toAccountNumber) {
        const error = new Error('Cannot transfer to the same account');
        error.statusCode = 400;
        throw error;
    };

    try {
        return await withTransactionRetry(async (session) => {
            const transferAmount = parsePositiveAmount(amount, 'Transfer amount');

            async function applyBalanceChange(accountNumber) {
                const isDebit = accountNumber === fromAccountNumber;

                const acc = await Account.findOne({ accountNumber }).session(session);
                if (!acc) {
                    const error = new Error(`${isDebit ? 'Source' : 'Destination'} account not found`);
                    error.statusCode = 404;
                    throw error;
                }
                if (acc.status !== 'active') {
                    const error = new Error(`Cannot transfer ${isDebit ? 'from' : 'into'} a ${acc.status} account`);
                    error.statusCode = 400;
                    throw error;
                }

                let filter = { _id: acc._id, status: 'active' };
                let incValue;

                if (isDebit) {
                    const overdraftLimit = new BigNumber(acc.overdraftLimit.toString());
                    // Same atomic check-and-mutate pattern as withdraw(): the minimum
                    // acceptable current balance is evaluated as part of the same
                    // operation that performs the debit, closing the race window.
                    filter.balance = { $gte: toDecimal128(transferAmount.minus(overdraftLimit)) };
                    incValue = toDecimal128(transferAmount.negated());
                } else {
                    incValue = toDecimal128(transferAmount);
                }

                const updated = await Account.findOneAndUpdate(
                    filter,
                    { $inc: { balance: incValue, version: 1 } },
                    { returnDocument: 'after', session });

                if (!updated) {
                    if (isDebit) {
                        const fresh = await Account.findById(acc._id).session(session);
                        if (!fresh || fresh.status !== 'active') {
                            const error = new Error(`Cannot transfer from a ${fresh ? fresh.status : 'missing'} account`);
                            error.statusCode = 400;
                            throw error;
                        }
                        const error = new Error('Insufficient funds');
                        error.statusCode = 400;
                        throw error;
                    }
                    throw new Error('VERSION_CONFLICT');
                }

                return updated;
            }

            const [firstAccountNumber, secondAccountNumber] = [fromAccountNumber, toAccountNumber].sort();

            const firstResult = await applyBalanceChange(firstAccountNumber);
            const secondResult = await applyBalanceChange(secondAccountNumber);

            const updatedFromAccount = firstAccountNumber === fromAccountNumber ? firstResult : secondResult;
            const updatedToAccount = firstAccountNumber === fromAccountNumber ? secondResult : firstResult;

            const newTransfer = await Transfer.create([{
                transferId: idempotencyKey,
                fromAccount: updatedFromAccount._id,
                toAccount: updatedToAccount._id,
                amount: transferAmount.toFixed(2),
                status: 'completed',
                initiatedBy,
                note,
            }], { session, ordered: true });

            const transactions = await Transaction.create([
                {
                    transactionId: `${idempotencyKey}-out`,
                    account: updatedFromAccount._id,
                    type: 'transfer_out',
                    amount: transferAmount.toFixed(2),
                    balanceAfter: updatedFromAccount.balance,
                    relatedTransfer: newTransfer[0]._id,
                    status: 'completed',
                    description: note || 'Transfer out',
                    initiatedBy,
                    idempotencyKey: `${idempotencyKey}-out`,
                },
                {
                    transactionId: `${idempotencyKey}-in`,
                    account: updatedToAccount._id,
                    type: 'transfer_in',
                    amount: transferAmount.toFixed(2),
                    balanceAfter: updatedToAccount.balance,
                    relatedTransfer: newTransfer[0]._id,
                    status: 'completed',
                    description: note || 'Transfer in',
                    initiatedBy,
                    idempotencyKey: `${idempotencyKey}-in`,
                },
            ], { session, ordered: true });

            return {
                transfer: newTransfer[0],
                fromAccount: updatedFromAccount,
                toAccount: updatedToAccount,
                transactions,
            };
        });
    } catch (error) {
        // CHANGE: this VERSION_CONFLICT -> friendlier-message translation used to live
        // in transfer()'s own catch block, right next to its own retry loop. Now that
        // the retry loop lives in withTransactionRetry, this translation happens on
        // the way back out to the original caller instead.
        if (error.message === 'VERSION_CONFLICT') {
            throw new Error('Could not complete transfer after multiple attempts — please retry');
        }
        throw error;
    }
}

export async function repayLoan({ loanId, amount, initiatedBy, idempotencyKey }) {
    try {
        return await withTransactionRetry(async (session) => {
            const loan = await Loan.findById(loanId).populate('disbursementAccountId').session(session);
            if (!loan) {
                const error = new Error('Loan not found');
                error.statusCode = 404;
                throw error;
            }
            if (loan.status !== 'active') {
                const error = new Error(`Cannot repay a loan with status '${loan.status}'`);
                error.statusCode = 400;
                throw error;
            }

            const unpaidEntries = loan.repaymentSchedule.filter((e) => e.status === 'pending' || e.status === 'partially_paid');
            if (unpaidEntries.length === 0) {
                const error = new Error('No pending or partially paid repayments remain on this loan');
                error.statusCode = 400;
                throw error;
            }

            const outstanding = new BigNumber(loan.outstandingBalance.toString());
            const paymentAmount = parsePositiveAmount(amount, 'Repayment amount');

            if (paymentAmount.isGreaterThan(outstanding)) {
                const error = new Error(`Repayment amount $${paymentAmount.toFixed(2)} exceeds outstanding loan balance $${outstanding.toFixed(2)}`);
                error.statusCode = 400;
                throw error;
            }

            const account = await Account.findOne({ accountNumber: loan.disbursementAccountId.accountNumber }).session(session);
            if (account.status !== 'active') {
                const error = new Error(`Cannot withdraw from a ${account.status} account`);
                error.statusCode = 400;
                throw error;
            }

            const currentBalance = new BigNumber(account.balance.toString());
            const newBalance = currentBalance.minus(paymentAmount);

            const overdraftLimit = new BigNumber(account.overdraftLimit.toString());
            if (newBalance.isLessThan(overdraftLimit.negated())) {
                const error = new Error('Insufficient funds');
                error.statusCode = 400;
                throw error;
            }
            const updatedAccount = await Account.findOneAndUpdate(
                { _id: account._id, version: account.version },
                { $set: { balance: newBalance.toFixed(2) }, $inc: { version: 1 } },
                { returnDocument: 'after', session }
            );
            if (!updatedAccount) throw new Error('VERSION_CONFLICT');

            const transaction = await Transaction.create([{
                transactionId: idempotencyKey,
                account: updatedAccount._id,
                type: 'loan_repayment',
                // CHANGE (from earlier review): this used to store the raw, unvalidated
                // `amount` from the request instead of the parsed/normalized
                // `paymentAmount` that the rest of this function actually operates on.
                // That meant the transaction record could disagree with the ledger math
                // that ran (different precision, no positive/decimal-place validation
                // applied). Now stores the same value used everywhere else below.
                amount: paymentAmount.toFixed(2),
                balanceAfter: updatedAccount.balance,
                status: 'completed',
                description: `Loan repayment for loan ${loan._id}`,
                initiatedBy,
                idempotencyKey,
            }], { session });

            // Apply repayment sequentially to schedule
            let remainingPayment = new BigNumber(paymentAmount);
            for (const entry of unpaidEntries) {
                if (remainingPayment.isLessThanOrEqualTo(0)) break;

                const scheduled = new BigNumber(entry.amount.toString());
                const alreadyPaid = new BigNumber(entry.paidAmount ? entry.paidAmount.toString() : '0.00');
                const needed = scheduled.minus(alreadyPaid);

                if (remainingPayment.isGreaterThanOrEqualTo(needed)) {
                    entry.paidAmount = mongoose.Types.Decimal128.fromString(scheduled.toFixed(2));
                    entry.status = 'paid';
                    entry.paidTransactionId = transaction[0]._id;
                    remainingPayment = remainingPayment.minus(needed);
                } else {
                    const newPaid = alreadyPaid.plus(remainingPayment);
                    entry.paidAmount = mongoose.Types.Decimal128.fromString(newPaid.toFixed(2));
                    entry.status = 'partially_paid';
                    entry.paidTransactionId = transaction[0]._id;
                    remainingPayment = new BigNumber(0);
                }
            }

            loan.outstandingBalance = mongoose.Types.Decimal128.fromString(outstanding.minus(paymentAmount).toFixed(2));
            if (outstanding.minus(paymentAmount).isLessThanOrEqualTo(0)) {
                loan.status = 'closed';
            }
            await loan.save({ session });

            return { loan, account: updatedAccount, transaction: transaction[0] };
        });
    } catch (error) {
        if (error.message === 'VERSION_CONFLICT') {
            const conflictError = new Error('Could not complete repayment — please retry');
            conflictError.statusCode = 409;
            throw conflictError;
        }
        throw error;
    }
}