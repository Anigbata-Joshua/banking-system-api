import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from './helpers/db.js';
import app from '../app.js';
import User from '../models/user.model.js';

beforeAll(async () => {
    await startTestDb();
}, 300000);

afterAll(async () => {
    await stopTestDb();
});

beforeEach(async () => {
    await clearTestDb();
});

const validRegistration = {
    name: 'Jane Doe',
    email: 'jane@example.com',
    password: 'Password123!',
    phone: '08000000000',
    dateOfBirth: '1990-01-01',
    address: {
        street: '1 Main St',
        city: 'Abuja',
        state: 'FCT',
        zipCode: '900001',
        country: 'Nigeria',
    },
    nationalId: 'NID-123456',
};

describe('POST /api/auth/register', () => {
    it('registers a new customer and returns tokens', async () => {
        const res = await request(app).post('/api/auth/register').send(validRegistration);

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data.accessToken).toBeDefined();
        expect(res.body.data.refreshToken).toBeDefined();
        expect(res.body.data.user.email).toBe('jane@example.com');
    });

    it('rejects a duplicate email registration', async () => {
        await request(app).post('/api/auth/register').send(validRegistration);
        const res = await request(app).post('/api/auth/register').send(validRegistration);

        expect(res.status).toBe(400);
    });

    // --- KNOWN BUG REGRESSION ---
    // register() creates a User, then a Customer, with no transaction tying
    // them together. If Customer creation fails, the User is left orphaned.
    // Once fixed, this test should assert `orphan` is null.
it('does not leave an orphaned User when Customer creation fails', async () => {
    const { nationalId, ...incompleteRegistration } = validRegistration;

    const res = await request(app).post('/api/auth/register').send(incompleteRegistration);

    expect(res.status).toBeGreaterThanOrEqual(400);
    const orphan = await User.findOne({ email: incompleteRegistration.email });
    expect(orphan).toBeNull();
});
});

describe('POST /api/auth/login', () => {
    it('logs in with correct credentials', async () => {
        await request(app).post('/api/auth/register').send(validRegistration);

        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: validRegistration.email, password: validRegistration.password });

        expect(res.status).toBe(200);
        expect(res.body.data.accessToken).toBeDefined();
    });

    it('returns 400 (not 500) for a wrong password', async () => {
        await request(app).post('/api/auth/register').send(validRegistration);

        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: validRegistration.email, password: 'wrong-password' });

        expect(res.status).toBe(400);
    });

    it('returns 400 (not 500) for an unknown email', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'nobody@example.com', password: 'whatever' });

        expect(res.status).toBe(400);
    });
});

describe('POST /api/auth/refresh', () => {
it('issues a new access token for a valid refresh token', async () => {
    console.log('[TEST] before register');
    const registerRes = await request(app).post('/api/auth/register').send(validRegistration);
    console.log('[TEST] after register, status:', registerRes.status);
    const { refreshToken } = registerRes.body.data;

    console.log('[TEST] before refresh');
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken });
    console.log('[TEST] after refresh, status:', res.status);

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
}, 30000);

    // --- KNOWN BUG REGRESSION ---
    // refresh() reads user.refreshTokenHash without checking `user` is
    // non-null first. If the user was deleted after the token was issued,
    // this throws a raw TypeError that the error handler turns into a 500.
    // Once fixed (checking `if (!user)` before use), this should assert 401.
it('returns 401 (not 500) when the user no longer exists', async () => {
    const registerRes = await request(app).post('/api/auth/register').send(validRegistration);
    const { refreshToken } = registerRes.body.data;

    await User.deleteMany({});

    const res = await request(app).post('/api/auth/refresh').send({ refreshToken });

    expect(res.status).toBe(401);
});
});

describe('POST /api/auth/logout', () => {
    it('requires authentication', async () => {
        const res = await request(app).post('/api/auth/logout');
        expect(res.status).toBe(401);
    });

    it('clears the refresh token so it can no longer be used', async () => {
        const registerRes = await request(app).post('/api/auth/register').send(validRegistration);
        const { accessToken, refreshToken } = registerRes.body.data;

        await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${accessToken}`);

        const refreshRes = await request(app).post('/api/auth/refresh').send({ refreshToken });
        expect(refreshRes.status).toBe(401);
    });
});
