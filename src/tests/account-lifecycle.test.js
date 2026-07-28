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

describe('account freeze/unfreeze', () => {
    it('freezes an active account', async () => {
        const { account } = await createCustomerWithAccount();
        const { token } = await createStaffToken('manager');

        const res = await request(app)
            .patch(`/api/accounts/${account.accountNumber}/freeze`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('frozen');
    });

    it('returns 400 (not an error) when freezing an already-frozen account', async () => {
        const { account } = await createCustomerWithAccount();
        const { token } = await createStaffToken('manager');

        await request(app).patch(`/api/accounts/${account.accountNumber}/freeze`).set('Authorization', `Bearer ${token}`);
        const res = await request(app).patch(`/api/accounts/${account.accountNumber}/freeze`).set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(400);
    });

    it('unfreezes a frozen account back to active', async () => {
        const { account } = await createCustomerWithAccount();
        const { token } = await createStaffToken('manager');

        await request(app).patch(`/api/accounts/${account.accountNumber}/freeze`).set('Authorization', `Bearer ${token}`);
        const res = await request(app).patch(`/api/accounts/${account.accountNumber}/unfreeze`).set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('active');
    });

    it('rejects deposits into a frozen account at the HTTP layer', async () => {
        const { account, token } = await createCustomerWithAccount();
        const { token: managerToken } = await createStaffToken('manager');

        await request(app).patch(`/api/accounts/${account.accountNumber}/freeze`).set('Authorization', `Bearer ${managerToken}`);

        const res = await request(app)
            .post(`/api/accounts/${account.accountNumber}/deposit`)
            .set('Authorization', `Bearer ${token}`)
            .set('Idempotency-Key', 'frozen-deposit-1')
            .send({ amount: '10.00' });

        // ledger.service.js throws a plain Error with no statusCode for this
        // case, so it currently surfaces as a 500 rather than a clean 400.
        // Documenting current behavior; ideally this becomes a 400.
        expect(res.status).toBe(500);
    });
});

describe('account closure', () => {
    it('cannot close an account with a non-zero balance', async () => {
        const { account } = await createCustomerWithAccount({ balance: '10.00' });
        const { token } = await createStaffToken('admin');

        const res = await request(app)
            .delete(`/api/accounts/${account.accountNumber}`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(400);
    });

    it('closes a zero-balance account successfully', async () => {
        const { account } = await createCustomerWithAccount({ balance: '0.00' });
        const { token } = await createStaffToken('admin');

        const res = await request(app)
            .delete(`/api/accounts/${account.accountNumber}`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('closed');
    });

    it('returns 400 when closing an already-closed account', async () => {
        const { account } = await createCustomerWithAccount({ balance: '0.00' });
        const { token } = await createStaffToken('admin');

        await request(app).delete(`/api/accounts/${account.accountNumber}`).set('Authorization', `Bearer ${token}`);
        const res = await request(app).delete(`/api/accounts/${account.accountNumber}`).set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(400);
    });
});
