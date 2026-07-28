import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from './helpers/db.js';
import { createCustomerWithAccount } from './helpers/factory.js';
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

describe('GET /api/accounts/:accountNumber/statement', () => {
    it('rejects a request missing both date params', async () => {
        const { account, token } = await createCustomerWithAccount();

        const res = await request(app)
            .get(`/api/accounts/${account.accountNumber}/statement`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(400);
    });

    it('rejects unparseable date strings', async () => {
        const { account, token } = await createCustomerWithAccount();

        const res = await request(app)
            .get(`/api/accounts/${account.accountNumber}/statement`)
            .query({ startDate: 'not-a-date', endDate: '2026-01-01' })
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(400);
    });

    it('rejects a startDate that is after endDate', async () => {
        const { account, token } = await createCustomerWithAccount();

        const res = await request(app)
            .get(`/api/accounts/${account.accountNumber}/statement`)
            .query({ startDate: '2026-12-31', endDate: '2026-01-01' })
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(400);
    });

    it('returns a PDF for a valid range even with zero transactions', async () => {
        const { account, token } = await createCustomerWithAccount();

        const res = await request(app)
            .get(`/api/accounts/${account.accountNumber}/statement`)
            .query({ startDate: '2026-01-01', endDate: '2026-12-31' })
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe('application/pdf');
    });

    it('returns 404 for a nonexistent account number', async () => {
        const { token } = await createCustomerWithAccount();

        const res = await request(app)
            .get('/api/accounts/0000000000/statement')
            .query({ startDate: '2026-01-01', endDate: '2026-12-31' })
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(404);
    });
});
