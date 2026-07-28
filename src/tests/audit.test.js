import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from './helpers/db.js';
import { createCustomerWithAccount, createStaffToken } from './helpers/factory.js';
import app from '../app.js';
import AuditLog from '../models/auditLog.model.js';

beforeAll(async () => {
    await startTestDb();
}, 300000);

afterAll(async () => {
    await stopTestDb();
});

beforeEach(async () => {
    await clearTestDb();
});

describe('Audit Logging System', () => {
    it('creates audit logs on customer registration/login and exposes them to staff', async () => {
        // Register a customer
        const registrationData = {
            name: 'Audit User',
            email: 'audit@example.com',
            password: 'Password123!',
            phone: '08111111111',
            dateOfBirth: '1995-05-15',
            address: {
                street: '12 State Road',
                city: 'Lagos',
                state: 'Lagos',
                zipCode: '100001',
                country: 'Nigeria',
            },
            nationalId: 'NID-999888',
        };

        const regRes = await request(app)
            .post('/api/auth/register')
            .send(registrationData);

        expect(regRes.status).toBe(201);

        // Login
        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({ email: registrationData.email, password: registrationData.password });

        expect(loginRes.status).toBe(200);

        // Fetch audit logs as manager
        const { token: managerToken } = await createStaffToken('manager');

        const auditRes = await request(app)
            .get('/api/audit-logs')
            .set('Authorization', `Bearer ${managerToken}`);

        expect(auditRes.status).toBe(200);
        expect(auditRes.body.success).toBe(true);
        expect(auditRes.body.pagination.totalCount).toBeGreaterThanOrEqual(2);

        const actions = auditRes.body.data.map(log => log.action);
        expect(actions).toContain('REGISTER_SUCCESS');
        expect(actions).toContain('LOGIN_SUCCESS');
    });

    it('blocks customers from viewing audit logs', async () => {
        const { token } = await createCustomerWithAccount();

        const res = await request(app)
            .get('/api/audit-logs')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(403);
    });
});
