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
            const depositAmount = new BigNumber(amount.toString());
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
            const withdrawalAmount = new BigNumber(amount.toString());
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

            const transferAmount = new BigNumber(amount.toString());

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

            const nextDueEntry = loan.repaymentSchedule.find((e) => e.status === 'pending');
            if (!nextDueEntry) throw new Error('No pending repayments remain on this loan');

            const account = await Account.findOne({ accountNumber: loan.disbursementAccountId.accountNumber }).session(session);
            if (account.status !== 'active') throw new Error(`Cannot withdraw from a ${account.status} account`);

            const currentBalance = new BigNumber(account.balance.toString());
            const paymentAmount = new BigNumber(amount.toString());
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

            const outstanding = new BigNumber(loan.outstandingBalance.toString());
            loan.outstandingBalance = outstanding.minus(paymentAmount).toFixed(2);
            nextDueEntry.status = 'paid';
            nextDueEntry.paidTransactionId = transaction[0]._id;
            if (new BigNumber(loan.outstandingBalance.toString()).isLessThanOrEqualTo(0)) {
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