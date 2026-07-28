import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from './helpers/db.js';
import { createCustomerWithAccount, createStaffToken } from './helpers/factory.js';
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

describe('Financial Reports Endpoint', () => {
    it('returns summary statistics for managers and admins', async () => {
        // Create some data
        await createCustomerWithAccount({ balance: '500.00', accountType: 'savings' });
        await createCustomerWithAccount({ balance: '1000.00', accountType: 'current' });

        const { token: managerToken } = await createStaffToken('manager');

        const res = await request(app)
            .get('/api/reports/financial')
            .set('Authorization', `Bearer ${managerToken}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.accounts.total).toBe(2);
        expect(res.body.data.accounts.types.savings).toBe(1);
        expect(res.body.data.accounts.types.current).toBe(1);
        expect(res.body.data.accounts.totalBalance).toBe('1500.00');
        expect(res.body.data.loans).toBeDefined();
        expect(res.body.data.cards).toBeDefined();
    });

    it('blocks customers from generating reports', async () => {
        const { token } = await createCustomerWithAccount();

        const res = await request(app)
            .get('/api/reports/financial')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(403);
    });
});
