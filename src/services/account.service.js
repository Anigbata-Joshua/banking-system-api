import Account from '../models/account.model.js';
import { generateAccountNumber } from '../utils/generateAccountNumber.js';

export async function openAccount({ customerId, type, overdraftLimit }) {
    const accountNumber = await generateAccountNumber();

    const account = await Account.create({
        accountNumber,
        customerId,
        type,
        overdraftLimit: overdraftLimit || '0.00',
    });

    return account;
}