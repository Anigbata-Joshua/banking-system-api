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
    return value;
}

function randomJitter() {
    return new Promise((resolve) => setTimeout(resolve, Math.random() * 30));
}

export async function deposit({ accountNumber, amount, initiatedBy, idempotencyKey, description }) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const session = await mongoose.startSession();
        try {
            session.startTransaction();

            const account = await Account.findOne({ accountNumber }).session(session);
            if (!account) {
                throw new Error('Account not found');
            }
            if (account.status !== 'active') {
                throw new Error(`Cannot deposit into a ${account.status} account`);
            }

            const currentBalance = new BigNumber(account.balance.toString());
            const depositAmount = parsePositiveAmount(amount, 'Deposit amount');
            const newBalance = currentBalance.plus(depositAmount);

            const updatedAccount = await Account.findOneAndUpdate(
                { _id: account._id, version: account.version },
                { $set: { balance: newBalance.toFixed(2) }, $inc: { version: 1 } },
                { returnDocument: 'after', session }
            );

            if (!updatedAccount) {
                throw new Error('VERSION_CONFLICT');
            }

            const transaction = await Transaction.create([{
                transactionId: idempotencyKey,
                account: updatedAccount._id,
                type: 'deposit',
                amount,
                balanceAfter: updatedAccount.balance,
                status: 'completed',
                description,
                initiatedBy,
                idempotencyKey,
            }], { session });

            await session.commitTransaction();
            return { account: updatedAccount, transaction: transaction[0] };

        } catch (error) {
            await session.abortTransaction();

            if (!isRetryableError(error) || attempt === MAX_RETRIES - 1) {
                if (error.message === 'VERSION_CONFLICT') {
                    throw new Error('Could not complete deposit after multiple attempts — please retry');
                }
                throw error;
            }

            await randomJitter();

        } finally {
            session.endSession();
        }
    }
}

export async function withdraw({ accountNumber, amount, initiatedBy, idempotencyKey, description }) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const session = await mongoose.startSession();
        try {
            session.startTransaction();

            const account = await Account.findOne({ accountNumber }).session(session);
            if (!account) {
                throw new Error('Account not found');
            }
            if (account.status !== 'active') {
                throw new Error(`Cannot withdraw from a ${account.status} account`);
            }

            const currentBalance = new BigNumber(account.balance.toString());
            const withdrawalAmount = parsePositiveAmount(amount, 'Withdrawal amount');
            const newBalance = currentBalance.minus(withdrawalAmount);

            const overdraftLimit = new BigNumber(account.overdraftLimit.toString());
            if (newBalance.isLessThan(overdraftLimit.negated())) {
                throw new Error('Insufficient funds');
            }

            const updatedAccount = await Account.findOneAndUpdate(
                { _id: account._id, version: account.version },
                { $set: { balance: newBalance.toFixed(2) }, $inc: { version: 1 } },
                { returnDocument: 'after', session }
            );

            if (!updatedAccount) {
                throw new Error('VERSION_CONFLICT');
            }

            const transaction = await Transaction.create([{
                transactionId: idempotencyKey,
                account: updatedAccount._id,
                type: 'withdrawal',
                amount,
                balanceAfter: updatedAccount.balance,
                status: 'completed',
                description: description || 'Withdrawal',
                initiatedBy,
                idempotencyKey,
            }], { session });

            await session.commitTransaction();
            return { account: updatedAccount, transaction: transaction[0] };

        } catch (error) {
            await session.abortTransaction();

            if (!isRetryableError(error) || attempt === MAX_RETRIES - 1) {
                if (error.message === 'VERSION_CONFLICT') {
                    throw new Error('Could not complete withdrawal after multiple attempts — please retry');
                }
                throw error;
            }

            await randomJitter();

        } finally {
            session.endSession();
        }
    }
}

export async function transfer({ fromAccountNumber, toAccountNumber, amount, initiatedBy, idempotencyKey, note }) {
    if (fromAccountNumber === toAccountNumber) {
        throw new Error('Cannot transfer to the same account');
    }

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const session = await mongoose.startSession();
        try {
            session.startTransaction();

            const transferAmount = parsePositiveAmount(amount, 'Transfer amount');

            async function applyBalanceChange(accountNumber) {
                const isDebit = accountNumber === fromAccountNumber;

                const acc = await Account.findOne({ accountNumber }).session(session);
                if (!acc) {
                    throw new Error(`${isDebit ? 'Source' : 'Destination'} account not found`);
                }
                if (acc.status !== 'active') {
                    throw new Error(`Cannot transfer ${isDebit ? 'from' : 'into'} a ${acc.status} account`);
                }

                const currentBalance = new BigNumber(acc.balance.toString());
                const newBalance = isDebit
                    ? currentBalance.minus(transferAmount)
                    : currentBalance.plus(transferAmount);

                if (isDebit) {
                    const overdraftLimit = new BigNumber(acc.overdraftLimit.toString());
                    if (newBalance.isLessThan(overdraftLimit.negated())) {
                        throw new Error('Insufficient funds');
                    }
                }

                const updated = await Account.findOneAndUpdate(
                    { _id: acc._id, version: acc.version },
                    { $set: { balance: newBalance.toFixed(2) }, $inc: { version: 1 } },
                    { returnDocument: 'after', session }
                );

                if (!updated) {
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
                amount,
                status: 'completed',
                initiatedBy,
                note,
            }], { session, ordered: true });

            const transactions = await Transaction.create([
                {
                    transactionId: `${idempotencyKey}-out`,
                    account: updatedFromAccount._id,
                    type: 'transfer_out',
                    amount,
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
                    amount,
                    balanceAfter: updatedToAccount.balance,
                    relatedTransfer: newTransfer[0]._id,
                    status: 'completed',
                    description: note || 'Transfer in',
                    initiatedBy,
                    idempotencyKey: `${idempotencyKey}-in`,
                },
            ], { session, ordered: true });

            await session.commitTransaction();
            return {
                transfer: newTransfer[0],
                fromAccount: updatedFromAccount,
                toAccount: updatedToAccount,
                transactions,
            };

        } catch (error) {
            await session.abortTransaction();

            if (!isRetryableError(error) || attempt === MAX_RETRIES - 1) {
                if (error.message === 'VERSION_CONFLICT') {
                    throw new Error('Could not complete transfer after multiple attempts — please retry');
                }
                throw error;
            }

            await randomJitter();

        } finally {
            session.endSession();
        }
    }
}

export async function repayLoan({ loanId, amount, initiatedBy, idempotencyKey }) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const session = await mongoose.startSession();
        try {
            session.startTransaction();

            const loan = await Loan.findById(loanId).populate('disbursementAccountId').session(session);
            if (!loan) throw new Error('Loan not found');
            if (loan.status !== 'active') throw new Error(`Cannot repay a loan with status '${loan.status}'`);

            const unpaidEntries = loan.repaymentSchedule.filter((e) => e.status === 'pending' || e.status === 'partially_paid');
            if (unpaidEntries.length === 0) throw new Error('No pending or partially paid repayments remain on this loan');

            const outstanding = new BigNumber(loan.outstandingBalance.toString());
            const paymentAmount = parsePositiveAmount(amount, 'Repayment amount');

            if (paymentAmount.isGreaterThan(outstanding)) {
                throw new Error(`Repayment amount $${paymentAmount.toFixed(2)} exceeds outstanding loan balance $${outstanding.toFixed(2)}`);
            }

            const account = await Account.findOne({ accountNumber: loan.disbursementAccountId.accountNumber }).session(session);
            if (account.status !== 'active') throw new Error(`Cannot withdraw from a ${account.status} account`);

            const currentBalance = new BigNumber(account.balance.toString());
            const newBalance = currentBalance.minus(paymentAmount);

            const overdraftLimit = new BigNumber(account.overdraftLimit.toString());
            if (newBalance.isLessThan(overdraftLimit.negated())) throw new Error('Insufficient funds');

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
                amount,
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

            await session.commitTransaction();
            return { loan, account: updatedAccount, transaction: transaction[0] };

        } catch (error) {
            await session.abortTransaction();
            if (!isRetryableError(error) || attempt === MAX_RETRIES - 1) {
                if (error.message === 'VERSION_CONFLICT') throw new Error('Could not complete repayment — please retry');
                throw error;
            }
            await randomJitter();
        } finally {
            session.endSession();
        }
    }
}