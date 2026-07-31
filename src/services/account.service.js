import Account from '../models/account.model.js';
import { generateAccountNumber } from '../utils/generateAccountNumber.js';

export async function openAccount({ customerId, type, overdraftLimit }) {
    let attempts = 0;
    while (attempts < 5) {
        const accountNumber = await generateAccountNumber();
        try {
            const account = await Account.create({
                accountNumber,
                customerId,
                type,
                overdraftLimit: overdraftLimit || '0.00',
            });
            return account;
        } catch (error) {
            if (error.code === 11000 && attempts < 4) {
                attempts++;
                continue;
            }
            throw error;
        }
    }
}