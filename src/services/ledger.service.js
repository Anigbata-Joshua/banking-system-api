import BigNumber from 'bignumber.js';
import mongoose from 'mongoose';
import Account from '../models/account.model.js';
import Transaction from '../models/transaction.model.js';

const MAX_RETRIES = 5;

export async function deposit({ accountNumber, amount, initiatedBy, idempotencyKey, description }) {
    const session = await mongoose.startSession();

    try {
        session.startTransaction();

        let updatedAccount = null;

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
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

            updatedAccount = await Account.findOneAndUpdate(
                { _id: account._id, version: account.version },
                { $set: { balance: newBalance.toFixed(2) }, $inc: { version: 1 } },
                { new: true, session }
            );

            if (updatedAccount) break;
        }

        if (!updatedAccount) {
            throw new Error('Could not complete deposit after multiple attempts — please retry');
        }

        const transaction = await Transaction.create([{
            transactionId: idempotencyKey,
            account: updatedAccount._id,
            type: 'deposit',
            amount: amount,
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
        throw error;
    } finally {
        session.endSession();
    }
}