import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { startTestDb, stopTestDb, clearTestDb } from './helpers/db.js';
import { createCustomerWithAccount } from './helpers/factory.js';
import Account from '../models/account.model.js';
import { deposit, withdraw, transfer } from '../services/ledger.service.js';

beforeAll(async () => {
    await startTestDb();
}, 300000);

afterAll(async () => {
    await stopTestDb();
});

beforeEach(async () => {
    await clearTestDb();
});

describe('ledger.deposit', () => {
    it('increases balance and records a completed transaction', async () => {
        const { account } = await createCustomerWithAccount({ balance: '100.00' });

        const result = await deposit({
            accountNumber: account.accountNumber,
            amount: '50.00',
            initiatedBy: new mongoose.Types.ObjectId(),
            idempotencyKey: 'dep-basic',
            description: 'test deposit',
        });

        expect(result.account.balance.toString()).toBe('150.00');
        expect(result.transaction.type).toBe('deposit');
        expect(result.transaction.status).toBe('completed');
    });

    it('rejects deposits into a frozen account', async () => {
        const { account } = await createCustomerWithAccount({ balance: '100.00' });
        await Account.findByIdAndUpdate(account._id, { status: 'frozen' });

        await expect(
            deposit({
                accountNumber: account.accountNumber,
                amount: '50.00',
                initiatedBy: new mongoose.Types.ObjectId(),
                idempotencyKey: 'dep-frozen',
            })
        ).rejects.toThrow(/frozen/);
    });

    it('rejects deposits into a closed account', async () => {
        const { account } = await createCustomerWithAccount({ balance: '100.00' });
        await Account.findByIdAndUpdate(account._id, { status: 'closed' });

        await expect(
            deposit({
                accountNumber: account.accountNumber,
                amount: '50.00',
                initiatedBy: new mongoose.Types.ObjectId(),
                idempotencyKey: 'dep-closed',
            })
        ).rejects.toThrow(/closed/);
    });

    it('throws for an unknown account number', async () => {
        await expect(
            deposit({
                accountNumber: '0000000000',
                amount: '50.00',
                initiatedBy: new mongoose.Types.ObjectId(),
                idempotencyKey: 'dep-missing',
            })
        ).rejects.toThrow(/not found/);
    });

    // --- KNOWN BUG REGRESSION ---
    // No layer in the app currently validates that amount > 0. This test
    // documents today's actual (unsafe) behavior. Once amount validation is
    // added to ledger.service.js (see code review), this test should be
    // updated to assert a rejection instead.
   it('rejects a negative deposit amount', async () => {
    const { account } = await createCustomerWithAccount({ balance: '100.00' });

    await expect(
        deposit({
            accountNumber: account.accountNumber,
            amount: '-30.00',
            initiatedBy: new mongoose.Types.ObjectId(),
            idempotencyKey: 'dep-negative',
        })
    ).rejects.toThrow(/must be a positive number/);
});

it('rejects a zero deposit amount', async () => {
    const { account } = await createCustomerWithAccount({ balance: '100.00' });

    await expect(
        deposit({
            accountNumber: account.accountNumber,
            amount: '0.00',
            initiatedBy: new mongoose.Types.ObjectId(),
            idempotencyKey: 'dep-zero',
        })
    ).rejects.toThrow(/must be a positive number/);
});
});

describe('ledger.withdraw', () => {
    it('decreases balance within the overdraft limit', async () => {
        const { account } = await createCustomerWithAccount({ balance: '100.00', overdraftLimit: '50.00' });

        const result = await withdraw({
            accountNumber: account.accountNumber,
            amount: '140.00',
            initiatedBy: new mongoose.Types.ObjectId(),
            idempotencyKey: 'wd-basic',
        });

        expect(result.account.balance.toString()).toBe('-40.00');
    });

    it('allows a withdrawal that lands exactly on the overdraft floor', async () => {
        const { account } = await createCustomerWithAccount({ balance: '100.00', overdraftLimit: '50.00' });

        const result = await withdraw({
            accountNumber: account.accountNumber,
            amount: '150.00',
            initiatedBy: new mongoose.Types.ObjectId(),
            idempotencyKey: 'wd-floor-exact',
        });

        expect(result.account.balance.toString()).toBe('-50.00');
    });

    it('rejects a withdrawal that is one cent past the overdraft floor', async () => {
        const { account } = await createCustomerWithAccount({ balance: '100.00', overdraftLimit: '50.00' });

        await expect(
            withdraw({
                accountNumber: account.accountNumber,
                amount: '150.01',
                initiatedBy: new mongoose.Types.ObjectId(),
                idempotencyKey: 'wd-floor-over',
            })
        ).rejects.toThrow(/Insufficient funds/);
    });

    it('does not double-process a replayed idempotency key', async () => {
        const { account } = await createCustomerWithAccount({ balance: '100.00' });

        await withdraw({
            accountNumber: account.accountNumber,
            amount: '10.00',
            initiatedBy: new mongoose.Types.ObjectId(),
            idempotencyKey: 'wd-idem-key',
        });

        await expect(
            withdraw({
                accountNumber: account.accountNumber,
                amount: '10.00',
                initiatedBy: new mongoose.Types.ObjectId(),
                idempotencyKey: 'wd-idem-key',
            })
        ).rejects.toThrow();

        const finalAccount = await Account.findById(account._id);
        expect(finalAccount.balance.toString()).toBe('90.00');
    });

    // --- KNOWN BUG REGRESSION ---
it('rejects a negative withdrawal amount', async () => {
    const { account } = await createCustomerWithAccount({ balance: '100.00' });

    await expect(
        withdraw({
            accountNumber: account.accountNumber,
            amount: '-500.00',
            initiatedBy: new mongoose.Types.ObjectId(),
            idempotencyKey: 'wd-negative',
        })
    ).rejects.toThrow(/must be a positive number/);
});
});

describe('ledger.transfer', () => {
    it('moves funds between two accounts atomically', async () => {
        const { account: from } = await createCustomerWithAccount({ balance: '100.00' });
        const { account: to } = await createCustomerWithAccount({ balance: '20.00' });

        const result = await transfer({
            fromAccountNumber: from.accountNumber,
            toAccountNumber: to.accountNumber,
            amount: '30.00',
            initiatedBy: new mongoose.Types.ObjectId(),
            idempotencyKey: 'tr-basic',
        });

        expect(result.fromAccount.balance.toString()).toBe('70.00');
        expect(result.toAccount.balance.toString()).toBe('50.00');
    });

    it('rejects a transfer to the same account', async () => {
        const { account } = await createCustomerWithAccount({ balance: '100.00' });

        await expect(
            transfer({
                fromAccountNumber: account.accountNumber,
                toAccountNumber: account.accountNumber,
                amount: '10.00',
                initiatedBy: new mongoose.Types.ObjectId(),
                idempotencyKey: 'tr-same-account',
            })
        ).rejects.toThrow(/same account/);
    });

    it('rejects a transfer that would breach the sender\'s overdraft limit', async () => {
        const { account: from } = await createCustomerWithAccount({ balance: '50.00', overdraftLimit: '0.00' });
        const { account: to } = await createCustomerWithAccount({ balance: '0.00' });

        await expect(
            transfer({
                fromAccountNumber: from.accountNumber,
                toAccountNumber: to.accountNumber,
                amount: '50.01',
                initiatedBy: new mongoose.Types.ObjectId(),
                idempotencyKey: 'tr-overdraft',
            })
        ).rejects.toThrow(/Insufficient funds/);
    });

    it('leaves both balances unchanged (no partial transfer) when the source account is frozen', async () => {
        const { account: from } = await createCustomerWithAccount({ balance: '100.00' });
        const { account: to } = await createCustomerWithAccount({ balance: '20.00' });
        await Account.findByIdAndUpdate(from._id, { status: 'frozen' });

        await expect(
            transfer({
                fromAccountNumber: from.accountNumber,
                toAccountNumber: to.accountNumber,
                amount: '10.00',
                initiatedBy: new mongoose.Types.ObjectId(),
                idempotencyKey: 'tr-frozen-source',
            })
        ).rejects.toThrow(/frozen/);

        const finalFrom = await Account.findById(from._id);
        const finalTo = await Account.findById(to._id);
        expect(finalFrom.balance.toString()).toBe('100.00');
        expect(finalTo.balance.toString()).toBe('20.00');
    });

    it('does not let either balance breach its overdraft limit under concurrent opposite transfers', async () => {
        const { account: a } = await createCustomerWithAccount({ balance: '100.00' });
        const { account: b } = await createCustomerWithAccount({ balance: '100.00' });

        const results = await Promise.allSettled([
            transfer({
                fromAccountNumber: a.accountNumber,
                toAccountNumber: b.accountNumber,
                amount: '80.00',
                initiatedBy: new mongoose.Types.ObjectId(),
                idempotencyKey: 'tr-concurrent-1',
            }),
            transfer({
                fromAccountNumber: b.accountNumber,
                toAccountNumber: a.accountNumber,
                amount: '80.00',
                initiatedBy: new mongoose.Types.ObjectId(),
                idempotencyKey: 'tr-concurrent-2',
            }),
        ]);

        expect(results.every((r) => r.status === 'fulfilled')).toBe(true);

        const finalA = await Account.findById(a._id);
        const finalB = await Account.findById(b._id);
        expect(finalA.balance.toString()).toBe('100.00');
        expect(finalB.balance.toString()).toBe('100.00');
    });

    // --- CRITICAL KNOWN BUG REGRESSION ---
    // This is the most serious finding from the review: a negative transfer
    // amount inverts which account is debited and which is credited. An
    // attacker who owns `fromAccountNumber` can name ANY account number as
    // `toAccountNumber` and drain it, because ownership is only ever checked
    // on the `fromAccountNumber` side.
it('rejects a negative transfer amount (regression test for the account-draining exploit)', async () => {
    const { account: attacker } = await createCustomerWithAccount({ balance: '0.00' });
    const { account: victim } = await createCustomerWithAccount({ balance: '500.00' });

    await expect(
        transfer({
            fromAccountNumber: attacker.accountNumber,
            toAccountNumber: victim.accountNumber,
            amount: '-200.00',
            initiatedBy: new mongoose.Types.ObjectId(),
            idempotencyKey: 'tr-negative-exploit',
        })
    ).rejects.toThrow(/must be a positive number/);

    const finalAttacker = await Account.findById(attacker._id);
    const finalVictim = await Account.findById(victim._id);
    expect(finalAttacker.balance.toString()).toBe('0.00');
    expect(finalVictim.balance.toString()).toBe('500.00');
});
});
