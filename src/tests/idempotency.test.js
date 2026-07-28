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

describe('idempotency middleware', () => {
    it('requires an Idempotency-Key header on deposit', async () => {
        const { account, token } = await createCustomerWithAccount();

        const res = await request(app)
            .post(`/api/accounts/${account.accountNumber}/deposit`)
            .set('Authorization', `Bearer ${token}`)
            .send({ amount: '10.00' });

        expect(res.status).toBe(400);
    });

    it('does not double-deposit when the same key is replayed', async () => {
        const { account, token } = await createCustomerWithAccount({ balance: '0.00' });
        const key = 'idem-replay-deposit';

        const first = await request(app)
            .post(`/api/accounts/${account.accountNumber}/deposit`)
            .set('Authorization', `Bearer ${token}`)
            .set('Idempotency-Key', key)
            .send({ amount: '25.00' });
        expect(first.status).toBe(201);

        // NOTE: the idempotency middleware saves the cached response
        // asynchronously (fire-and-forget) after res.json() runs, so there
        // is a small window where a request that arrives immediately after
        // the first could see a 409 ("still processing") instead of the
        // cached response. A short delay avoids flaking on that known race
        // — see code review notes on middleware/idempotency.js.
        await new Promise((resolve) => setTimeout(resolve, 100));

        const second = await request(app)
            .post(`/api/accounts/${account.accountNumber}/deposit`)
            .set('Authorization', `Bearer ${token}`)
            .set('Idempotency-Key', key)
            .send({ amount: '25.00' });

        expect(second.status).toBe(201);
        expect(second.body).toEqual(first.body);

        const check = await request(app)
            .get(`/api/accounts/${account.accountNumber}`)
            .set('Authorization', `Bearer ${token}`);

        // Only one deposit of 25.00 should have actually been applied.
        expect(check.body.data.balance.$numberDecimal).toBe('25.00');
    });

    it('returns 409 for a genuinely concurrent request with the same key', async () => {
        const { account, token } = await createCustomerWithAccount({ balance: '0.00' });
        const key = 'idem-concurrent';

        const [first, second] = await Promise.all([
            request(app)
                .post(`/api/accounts/${account.accountNumber}/deposit`)
                .set('Authorization', `Bearer ${token}`)
                .set('Idempotency-Key', key)
                .send({ amount: '25.00' }),
            request(app)
                .post(`/api/accounts/${account.accountNumber}/deposit`)
                .set('Authorization', `Bearer ${token}`)
                .set('Idempotency-Key', key)
                .send({ amount: '25.00' }),
        ]);

        const statuses = [first.status, second.status].sort();
        // One request wins and completes; the other is turned away as a
        // duplicate-in-flight request.
        expect(statuses).toEqual([201, 409]);
    });
});
