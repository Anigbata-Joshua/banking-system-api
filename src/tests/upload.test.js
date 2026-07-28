import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from './helpers/db.js';
import { createCustomerWithAccount } from './helpers/factory.js';
import app from '../app.js';
import fs from 'fs';
import path from 'path';

beforeAll(async () => {
    await startTestDb();
}, 300000);

afterAll(async () => {
    await stopTestDb();
});

beforeEach(async () => {
    await clearTestDb();
});

describe('KYC File Uploads', () => {
    it('uploads a document and updates user KYC status', async () => {
        const { token } = await createCustomerWithAccount();

        // Create a dummy file to upload
        const dummyPath = path.resolve('dummy_document.png');
        fs.writeFileSync(dummyPath, 'dummy content');

        const res = await request(app)
            .post('/api/customers/kyc/upload')
            .set('Authorization', `Bearer ${token}`)
            .attach('document', dummyPath);

        // Clean up dummy file
        if (fs.existsSync(dummyPath)) {
            fs.unlinkSync(dummyPath);
        }

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.kycStatus).toBe('pending');
        expect(res.body.data.kycDocuments).toHaveLength(1);
        expect(res.body.data.kycDocuments[0]).toContain('document-');
    });
});
