import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from './helpers/db.js';
import { createStaffToken, createCustomerWithAccount } from './helpers/factory.js';
import User from '../models/user.model.js';
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

describe('POST /api/auth/staff (admin creates manager/teller)', () => {
    it('rejects the request with no Authorization header', async () => {
        const res = await request(app)
            .post('/api/auth/staff')
            .send({ name: 'New Teller', email: 'teller1@bank.com', password: 'Password123!', role: 'teller' });

        expect(res.status).toBe(401);
    });

    it('blocks a customer from creating a staff user', async () => {
        const customer = await createCustomerWithAccount();

        const res = await request(app)
            .post('/api/auth/staff')
            .set('Authorization', `Bearer ${customer.token}`)
            .send({ name: 'New Teller', email: 'teller2@bank.com', password: 'Password123!', role: 'teller' });

        expect(res.status).toBe(403);
    });

    it('blocks a teller from creating a staff user', async () => {
        const teller = await createStaffToken('teller');

        const res = await request(app)
            .post('/api/auth/staff')
            .set('Authorization', `Bearer ${teller.token}`)
            .send({ name: 'New Teller', email: 'teller3@bank.com', password: 'Password123!', role: 'teller' });

        expect(res.status).toBe(403);
    });

    it('blocks a manager from creating a staff user', async () => {
        const manager = await createStaffToken('manager');

        const res = await request(app)
            .post('/api/auth/staff')
            .set('Authorization', `Bearer ${manager.token}`)
            .send({ name: 'New Manager', email: 'manager3@bank.com', password: 'Password123!', role: 'manager' });

        expect(res.status).toBe(403);
    });

    it('allows an admin to create a manager', async () => {
        const admin = await createStaffToken('admin');

        const res = await request(app)
            .post('/api/auth/staff')
            .set('Authorization', `Bearer ${admin.token}`)
            .send({ name: 'New Manager', email: 'manager@bank.com', password: 'Password123!', role: 'manager' });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data.user.role).toBe('manager');
        expect(res.body.data.user.email).toBe('manager@bank.com');
        // Never return the password/hash to the client
        expect(res.body.data.user.passwordHash).toBeUndefined();
        expect(res.body.data.user.password).toBeUndefined();

        const stored = await User.findOne({ email: 'manager@bank.com' });
        expect(stored).not.toBeNull();
        expect(stored.role).toBe('manager');
        // The stored credential must be hashed, not the plaintext password
        expect(stored.passwordHash).not.toBe('Password123!');
    });

    it('allows an admin to create a teller', async () => {
        const admin = await createStaffToken('admin');

        const res = await request(app)
            .post('/api/auth/staff')
            .set('Authorization', `Bearer ${admin.token}`)
            .send({ name: 'New Teller', email: 'teller@bank.com', password: 'Password123!', role: 'teller' });

        expect(res.status).toBe(201);
        expect(res.body.data.user.role).toBe('teller');

        const stored = await User.findOne({ email: 'teller@bank.com' });
        expect(stored.role).toBe('teller');
    });

    it('rejects an attempt to create another admin through this endpoint', async () => {
        const admin = await createStaffToken('admin');

        const res = await request(app)
            .post('/api/auth/staff')
            .set('Authorization', `Bearer ${admin.token}`)
            .send({ name: 'Sneaky Admin', email: 'admin2@bank.com', password: 'Password123!', role: 'admin' });

        expect(res.status).toBe(400);

        const stored = await User.findOne({ email: 'admin2@bank.com' });
        expect(stored).toBeNull();
    });

    it('rejects an attempt to create a customer through this endpoint', async () => {
        const admin = await createStaffToken('admin');

        const res = await request(app)
            .post('/api/auth/staff')
            .set('Authorization', `Bearer ${admin.token}`)
            .send({ name: 'Sneaky Customer', email: 'cust2@bank.com', password: 'Password123!', role: 'customer' });

        expect(res.status).toBe(400);
    });

    it('rejects duplicate email addresses', async () => {
        const admin = await createStaffToken('admin');

        const first = await request(app)
            .post('/api/auth/staff')
            .set('Authorization', `Bearer ${admin.token}`)
            .send({ name: 'New Teller', email: 'dup@bank.com', password: 'Password123!', role: 'teller' });
        expect(first.status).toBe(201);

        const second = await request(app)
            .post('/api/auth/staff')
            .set('Authorization', `Bearer ${admin.token}`)
            .send({ name: 'Another Teller', email: 'dup@bank.com', password: 'Password123!', role: 'manager' });

        expect(second.status).toBe(400);
    });

    it('the newly created manager can log in and receive a manager-scoped token', async () => {
        const admin = await createStaffToken('admin');

        await request(app)
            .post('/api/auth/staff')
            .set('Authorization', `Bearer ${admin.token}`)
            .send({ name: 'New Manager', email: 'loginmgr@bank.com', password: 'Password123!', role: 'manager' });

        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({ email: 'loginmgr@bank.com', password: 'Password123!' });

        expect(loginRes.status).toBe(200);
        expect(loginRes.body.data.user.role).toBe('manager');

        // And that token should now be able to do manager-only work, e.g. freeze an account.
        const owner = await createCustomerWithAccount();
        const freezeRes = await request(app)
            .patch(`/api/accounts/${owner.account.accountNumber}/freeze`)
            .set('Authorization', `Bearer ${loginRes.body.data.accessToken}`);

        expect(freezeRes.status).toBe(200);
    });
});
