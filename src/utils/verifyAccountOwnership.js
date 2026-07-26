import Account from '../models/account.model.js';

export async function verifyAccountOwnership(accountNumber, user) {
    const account = await Account.findOne({ accountNumber });

    if (!account) {
        const error = new Error('Account not found');
        error.statusCode = 404;
        throw error;
    }

    if (user.role === 'customer' && account.customerId.toString() !== user.customerId) {
        const error = new Error('You do not have permission to access this account');
        error.statusCode = 403;
        throw error;
    }

    return account;
}