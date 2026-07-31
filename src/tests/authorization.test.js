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

describe('authentication gate', () => {
    it('rejects requests with no Authorization header', async () => {
        const { account } = await createCustomerWithAccount();
        const res = await request(app).get(`/api/accounts/${account.accountNumber}`);
        expect(res.status).toBe(401);
    });

    it('rejects requests with a malformed token', async () => {
        const { account } = await createCustomerWithAccount();
        const res = await request(app)
            .get(`/api/accounts/${account.accountNumber}`)
            .set('Authorization', 'Bearer not-a-real-token');
        expect(res.status).toBe(401);
    });
});

describe('cross-customer authorization', () => {
    it('blocks a customer from viewing another customer\'s account', async () => {
        const owner = await createCustomerWithAccount();
        const intruder = await createCustomerWithAccount();

        const res = await request(app)
            .get(`/api/accounts/${owner.account.accountNumber}`)
            .set('Authorization', `Bearer ${intruder.token}`);

        expect(res.status).toBe(403);
    });

    it('blocks a customer from depositing into another customer\'s account', async () => {
        const owner = await createCustomerWithAccount();
        const intruder = await createCustomerWithAccount();

        const res = await request(app)
            .post(`/api/accounts/${owner.account.accountNumber}/deposit`)
            .set('Authorization', `Bearer ${intruder.token}`)
            .set('Idempotency-Key', 'authz-deposit-1')
            .send({ amount: '10.00' });

        expect(res.status).toBe(403);
    });

    it('blocks a customer from withdrawing from another customer\'s account', async () => {
        const owner = await createCustomerWithAccount();
        const intruder = await createCustomerWithAccount();

        const res = await request(app)
            .post(`/api/accounts/${owner.account.accountNumber}/withdraw`)
            .set('Authorization', `Bearer ${intruder.token}`)
            .set('Idempotency-Key', 'authz-withdraw-1')
            .send({ amount: '10.00' });

        expect(res.status).toBe(403);
    });

    it('blocks a customer from viewing another customer\'s statement', async () => {
        const owner = await createCustomerWithAccount();
        const intruder = await createCustomerWithAccount();

        const res = await request(app)
            .get(`/api/accounts/${owner.account.accountNumber}/statement`)
            .query({ startDate: '2026-01-01', endDate: '2026-12-31' })
            .set('Authorization', `Bearer ${intruder.token}`);

        expect(res.status).toBe(403);
    });

    it('blocks a customer from deleting another customer\'s beneficiary', async () => {
        const owner = await createCustomerWithAccount();
        const intruder = await createCustomerWithAccount();

        const beneficiaryUser = await createCustomerWithAccount();
        const addRes = await request(app)
            .post('/api/beneficiaries')
            .set('Authorization', `Bearer ${owner.token}`)
            .send({ beneficiaryAccountNumber: beneficiaryUser.account.accountNumber, beneficiaryName: 'Some Beneficiary' });

        const res = await request(app)
            .delete(`/api/beneficiaries/${addRes.body.data._id}`)
            .set('Authorization', `Bearer ${intruder.token}`);

        expect(res.status).toBe(403);
    });

    it('blocks a customer from blocking another customer\'s card', async () => {
        const owner = await createCustomerWithAccount();
        const intruder = await createCustomerWithAccount();

        const issueRes = await request(app)
            .post('/api/cards')
            .set('Authorization', `Bearer ${owner.token}`)
            .send({ accountId: owner.account._id.toString(), cardType: 'debit', pin: '1234' });

        const res = await request(app)
            .patch(`/api/cards/${issueRes.body.data.id}/block`)
            .set('Authorization', `Bearer ${intruder.token}`);

        expect(res.status).toBe(403);
    });
});

describe('role-based authorization on staff-only actions', () => {
    it('blocks a customer from freezing an account', async () => {
        const owner = await createCustomerWithAccount();

        const res = await request(app)
            .patch(`/api/accounts/${owner.account.accountNumber}/freeze`)
            .set('Authorization', `Bearer ${owner.token}`);

        expect(res.status).toBe(403);
    });

    it('allows a manager to freeze any account', async () => {
        const owner = await createCustomerWithAccount();
        const manager = await createStaffToken('manager');

        const res = await request(app)
            .patch(`/api/accounts/${owner.account.accountNumber}/freeze`)
            .set('Authorization', `Bearer ${manager.token}`);

        expect(res.status).toBe(200);
    });

    it('blocks a teller from deleting an account (manager/admin only)', async () => {
        const owner = await createCustomerWithAccount({ balance: '0.00' });
        const teller = await createStaffToken('teller');

        const res = await request(app)
            .delete(`/api/accounts/${owner.account.accountNumber}`)
            .set('Authorization', `Bearer ${teller.token}`);

        expect(res.status).toBe(403);
    });
});
