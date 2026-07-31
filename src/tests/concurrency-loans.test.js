import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from './helpers/db.js';
import { createCustomerWithAccount, createStaffToken } from './helpers/factory.js';
import { deposit } from '../services/ledger.service.js';
import app from '../app.js';
import Loan from '../models/loan.model.js';
import Account from '../models/account.model.js';

beforeAll(async () => {
    await startTestDb();
}, 300000);

afterAll(async () => {
    await stopTestDb();
});

beforeEach(async () => {
    await clearTestDb();
});

describe('loan repayment concurrency', () => {
    it('handles concurrent repayments on the same loan without double-paying or schedule desyncs', async () => {
        const { user, account, token } = await createCustomerWithAccount({ balance: '0.00' });
        await deposit({
            accountNumber: account.accountNumber,
            amount: '1000.00',
            initiatedBy: user._id,
            idempotencyKey: 'concur-init-dep',
        });

        const apply = await request(app)
            .post('/api/loans/apply')
            .set('Authorization', `Bearer ${token}`)
            .send({ principal: '500.00', interestRate: '0.10', termMonths: 5, disbursementAccountNumber: account.accountNumber });

        const { token: tellerToken } = await createStaffToken('teller');
        await request(app).patch(`/api/loans/${apply.body.data._id}/recommend`).set('Authorization', `Bearer ${tellerToken}`);
        const { token: managerToken } = await createStaffToken('manager');
        await request(app).patch(`/api/loans/${apply.body.data._id}/approve`).set('Authorization', `Bearer ${managerToken}`);

        const repaymentAmount = '50.00';
        const numRequests = 10;
        
        const requests = Array.from({ length: numRequests }, (_, i) => {
            return request(app)
                .post(`/api/loans/${apply.body.data._id}/repay`)
                .set('Authorization', `Bearer ${token}`)
                .set('Idempotency-Key', `loan-repay-concur-${i}`)
                .send({ amount: repaymentAmount });
        });

        const responses = await Promise.all(requests);

        const successResponses = responses.filter(r => r.status === 200);
        expect(successResponses.length).toBe(numRequests);

        const finalLoan = await Loan.findById(apply.body.data._id);
        expect(finalLoan.outstandingBalance.toString()).toBe('50.00');

        const finalAccount = await Account.findById(account._id);
        expect(finalAccount.balance.toString()).toBe('1000.00');
    });
});
