import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from './helpers/db.js';
import { createCustomerWithAccount } from './helpers/factory.js';
import { deposit, withdraw } from '../services/ledger.service.js';
import app from '../app.js';

beforeAll(async () => {
    await startTestDb();
}, 300000);

afterAll(async () => {
    await stopTestDb();
});

beforeEach(async () => {
    await clearTestDb();
});

describe('Transaction History REST API', () => {
    it('returns paginated and filterable transaction history for an account', async () => {
        const { user, account, token } = await createCustomerWithAccount({ balance: '0.00' });

        // Make 3 transactions
        await deposit({
            accountNumber: account.accountNumber,
            amount: '100.00',
            initiatedBy: user._id,
            idempotencyKey: 'history-dep-1',
            description: 'Deposit 1',
        });

        await deposit({
            accountNumber: account.accountNumber,
            amount: '200.00',
            initiatedBy: user._id,
            idempotencyKey: 'history-dep-2',
            description: 'Deposit 2',
        });

        await withdraw({
            accountNumber: account.accountNumber,
            amount: '50.00',
            initiatedBy: user._id,
            idempotencyKey: 'history-with-1',
            description: 'Withdrawal 1',
        });

        // 1. Check all transactions (page 1, limit 10)
        let res = await request(app)
            .get(`/api/accounts/${account.accountNumber}/transactions`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.pagination.totalCount).toBe(3);
        expect(res.body.data).toHaveLength(3);
        expect(res.body.data[0].type).toBe('withdrawal'); // Sort by createdAt desc

        // 2. Filter by type
        res = await request(app)
            .get(`/api/accounts/${account.accountNumber}/transactions`)
            .query({ type: 'deposit' })
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.pagination.totalCount).toBe(2);
        expect(res.body.data).toHaveLength(2);

        // 3. Filter by min/max amount
        res = await request(app)
            .get(`/api/accounts/${account.accountNumber}/transactions`)
            .query({ minAmount: '150.00' })
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.pagination.totalCount).toBe(1);
        expect(res.body.data[0].description).toBe('Deposit 2');

        // 4. Test pagination limit
        res = await request(app)
            .get(`/api/accounts/${account.accountNumber}/transactions`)
            .query({ limit: 1 })
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.pagination.totalPages).toBe(3);
    });

    it('blocks other customers from accessing transaction history', async () => {
        const owner = await createCustomerWithAccount();
        const intruder = await createCustomerWithAccount();

        const res = await request(app)
            .get(`/api/accounts/${owner.account.accountNumber}/transactions`)
            .set('Authorization', `Bearer ${intruder.token}`);

        expect(res.status).toBe(403);
    });
});
