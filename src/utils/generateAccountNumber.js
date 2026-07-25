import Account from '../models/account.model.js';

export async function generateAccountNumber() {
    let accountNumber;
    let exists = true;

    while (exists) {
         // generate a random 10-digit numeric string here
        accountNumber = Math.floor(1000000000 + Math.random() * 9000000000).toString();

    // check the DB if the account with this number already exist?
        exists = await Account.exists({ accountNumber });
    }

    return accountNumber;
}