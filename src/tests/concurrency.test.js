import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import Account from '../models/account.model.js';
import { withdraw } from '../services/ledger.service.js';

let replSet;
let testAccount;

beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const uri = replSet.getUri();
    await mongoose.connect(uri);
}, 300000);

afterAll(async () => {
    await mongoose.disconnect();
    await replSet.stop();
});

beforeEach(async () => {
    await Account.deleteMany({});
    testAccount = await Account.create({
        accountNumber: '9999999999',
        customerId: new mongoose.Types.ObjectId(),
        type: 'savings',
        balance: '1000.00',
        overdraftLimit: '0.00',
    });
});

describe('concurrent withdrawals', () => {
    it('never allows the balance to go negative under 50 simultaneous requests', async () => {
        const withdrawalPromises = Array.from({ length: 50 }, (_, i) =>
            withdraw({
                accountNumber: testAccount.accountNumber,
                amount: '100.00',
                initiatedBy: new mongoose.Types.ObjectId(),
                idempotencyKey: `concurrency-test-${i}`,
                description: 'Concurrency test withdrawal',
            }).then(
                (result) => ({ status: 'fulfilled', result }),
                (error) => ({ status: 'rejected', error })
            )
        );

        const results = await Promise.all(withdrawalPromises);

        const succeeded = results.filter((r) => r.status === 'fulfilled');
        const failed = results.filter((r) => r.status === 'rejected');

        console.log('Failure reasons:', failed.map((f) => f.error.message));

        const finalAccount = await Account.findOne({ accountNumber: testAccount.accountNumber });
        const finalBalance = finalAccount.balance.toString();

        expect(succeeded.length).toBe(10);
        expect(failed.length).toBe(40);
        expect(finalBalance).toBe('0.00');
        expect(parseFloat(finalBalance)).toBeGreaterThanOrEqual(0);
    });
});