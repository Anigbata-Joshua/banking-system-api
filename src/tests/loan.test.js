import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { startTestDb, stopTestDb, clearTestDb } from './helpers/db.js';
import { createCustomerWithAccount, createStaffToken } from './helpers/factory.js';
import { deposit } from '../services/ledger.service.js';
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

describe('loan application and approval', () => {
    it('applies for, approves, and disburses a loan into the account balance', async () => {
        const { user, account, token } = await createCustomerWithAccount({ balance: '0.00' });
        await deposit({
            accountNumber: account.accountNumber,
            amount: '500.00',
            initiatedBy: user._id,
            idempotencyKey: 'init-dep-1',
        });

        const apply = await request(app)
            .post('/api/loans/apply')
            .set('Authorization', `Bearer ${token}`)
            .send({
                principal: '1000.00',
                interestRate: '0.10',
                termMonths: 10,
                disbursementAccountNumber: account.accountNumber,
            });
        expect(apply.status).toBe(201);

        const { token: managerToken } = await createStaffToken('manager');
        const approve = await request(app)
            .patch(`/api/loans/${apply.body.data._id}/approve`)
            .set('Authorization', `Bearer ${managerToken}`);

        expect(approve.status).toBe(200);
        expect(approve.body.data.loan.status).toBe('active');
        expect(approve.body.data.loan.repaymentSchedule).toHaveLength(10);

        const accountCheck = await request(app)
            .get(`/api/accounts/${account.accountNumber}`)
            .set('Authorization', `Bearer ${token}`);
        // Decimal128 fields serialize over JSON as { $numberDecimal: "..." },
        // not as plain strings.
        expect(accountCheck.body.data.balance.$numberDecimal).toBe('1500.00');
    });

    it('blocks a customer from applying for a second loan while one is outstanding', async () => {
        const { user, account, token } = await createCustomerWithAccount();
        await deposit({
            accountNumber: account.accountNumber,
            amount: '500.00',
            initiatedBy: user._id,
            idempotencyKey: 'init-dep-2',
        });

        await request(app)
            .post('/api/loans/apply')
            .set('Authorization', `Bearer ${token}`)
            .send({ principal: '500.00', interestRate: '0.05', termMonths: 6, disbursementAccountNumber: account.accountNumber });

        const res = await request(app)
            .post('/api/loans/apply')
            .set('Authorization', `Bearer ${token}`)
            .send({ principal: '200.00', interestRate: '0.05', termMonths: 3, disbursementAccountNumber: account.accountNumber });

        expect(res.status).toBe(400);
    });

    it('blocks a customer from applying for a loan against an account they do not own', async () => {
        const owner = await createCustomerWithAccount();
        await deposit({
            accountNumber: owner.account.accountNumber,
            amount: '500.00',
            initiatedBy: owner.user._id,
            idempotencyKey: 'init-dep-3',
        });

        const intruder = await createCustomerWithAccount();

        const res = await request(app)
            .post('/api/loans/apply')
            .set('Authorization', `Bearer ${intruder.token}`)
            .send({
                principal: '500.00',
                interestRate: '0.05',
                termMonths: 6,
                disbursementAccountNumber: owner.account.accountNumber,
            });

        expect(res.status).toBe(403);
    });

    it('blocks a non-manager/admin from approving a loan', async () => {
        const { user, account, token } = await createCustomerWithAccount();
        await deposit({
            accountNumber: account.accountNumber,
            amount: '500.00',
            initiatedBy: user._id,
            idempotencyKey: 'init-dep-4',
        });

        const apply = await request(app)
            .post('/api/loans/apply')
            .set('Authorization', `Bearer ${token}`)
            .send({ principal: '500.00', interestRate: '0.05', termMonths: 6, disbursementAccountNumber: account.accountNumber });

        const res = await request(app)
            .patch(`/api/loans/${apply.body.data._id}/approve`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(403);
    });

    it('rejects a pending loan and does not disburse funds', async () => {
        const { user, account, token } = await createCustomerWithAccount({ balance: '0.00' });
        await deposit({
            accountNumber: account.accountNumber,
            amount: '250.00',
            initiatedBy: user._id,
            idempotencyKey: 'init-dep-5',
        });

        const apply = await request(app)
            .post('/api/loans/apply')
            .set('Authorization', `Bearer ${token}`)
            .send({ principal: '500.00', interestRate: '0.05', termMonths: 6, disbursementAccountNumber: account.accountNumber });

        const { token: managerToken } = await createStaffToken('manager');
        const reject = await request(app)
            .patch(`/api/loans/${apply.body.data._id}/reject`)
            .set('Authorization', `Bearer ${managerToken}`);

        expect(reject.status).toBe(200);
        expect(reject.body.data.status).toBe('rejected');

        const accountCheck = await request(app)
            .get(`/api/accounts/${account.accountNumber}`)
            .set('Authorization', `Bearer ${token}`);
        expect(accountCheck.body.data.balance.$numberDecimal).toBe('250.00');
    });
});

describe('loan repayment', () => {
    it('processes a repayment and marks the next installment paid', async () => {
        const { user, account, token } = await createCustomerWithAccount({ balance: '0.00' });
        await deposit({
            accountNumber: account.accountNumber,
            amount: '600.00',
            initiatedBy: user._id,
            idempotencyKey: 'init-dep-6',
        });

        const apply = await request(app)
            .post('/api/loans/apply')
            .set('Authorization', `Bearer ${token}`)
            .send({ principal: '1200.00', interestRate: '0.10', termMonths: 12, disbursementAccountNumber: account.accountNumber });

        const { token: managerToken } = await createStaffToken('manager');
        const approve = await request(app)
            .patch(`/api/loans/${apply.body.data._id}/approve`)
            .set('Authorization', `Bearer ${managerToken}`);

        // Decimal128 fields serialize over JSON as { $numberDecimal: "..." };
        // extract the plain string before sending it back.
        const installmentAmount = approve.body.data.loan.repaymentSchedule[0].amount.$numberDecimal;

        const repay = await request(app)
            .post(`/api/loans/${apply.body.data._id}/repay`)
            .set('Authorization', `Bearer ${token}`)
            .set('Idempotency-Key', 'loan-repay-full')
            .send({ amount: installmentAmount });

        expect(repay.status).toBe(200);
        expect(repay.body.data.loan.repaymentSchedule[0].status).toBe('paid');
    });

    it('requires an Idempotency-Key header on repayment', async () => {
        const { user, account, token } = await createCustomerWithAccount({ balance: '0.00' });
        await deposit({
            accountNumber: account.accountNumber,
            amount: '250.00',
            initiatedBy: user._id,
            idempotencyKey: 'init-dep-7',
        });

        const apply = await request(app)
            .post('/api/loans/apply')
            .set('Authorization', `Bearer ${token}`)
            .send({ principal: '500.00', interestRate: '0.05', termMonths: 5, disbursementAccountNumber: account.accountNumber });

        const { token: managerToken } = await createStaffToken('manager');
        await request(app).patch(`/api/loans/${apply.body.data._id}/approve`).set('Authorization', `Bearer ${managerToken}`);

        const res = await request(app)
            .post(`/api/loans/${apply.body.data._id}/repay`)
            .set('Authorization', `Bearer ${token}`)
            .send({ amount: '10.00' });

        expect(res.status).toBe(400);
    });

    it('processes a partial repayment and marks the installment as partially_paid', async () => {
        const { user, account, token } = await createCustomerWithAccount({ balance: '0.00' });
        await deposit({
            accountNumber: account.accountNumber,
            amount: '600.00',
            initiatedBy: user._id,
            idempotencyKey: 'init-dep-8',
        });

        const apply = await request(app)
            .post('/api/loans/apply')
            .set('Authorization', `Bearer ${token}`)
            .send({ principal: '1200.00', interestRate: '0.10', termMonths: 12, disbursementAccountNumber: account.accountNumber });

        const { token: managerToken } = await createStaffToken('manager');
        await request(app).patch(`/api/loans/${apply.body.data._id}/approve`).set('Authorization', `Bearer ${managerToken}`);

        const res = await request(app)
            .post(`/api/loans/${apply.body.data._id}/repay`)
            .set('Authorization', `Bearer ${token}`)
            .set('Idempotency-Key', 'loan-repay-partial')
            .send({ amount: '1.00' }); // far less than the real installment amount

        expect(res.status).toBe(200);
        expect(res.body.data.loan.repaymentSchedule[0].status).toBe('partially_paid');
        expect(res.body.data.loan.repaymentSchedule[0].paidAmount.$numberDecimal).toBe('1.00');
    });

    it('blocks a customer from repaying someone else\'s loan', async () => {
        const owner = await createCustomerWithAccount({ balance: '0.00' });
        await deposit({
            accountNumber: owner.account.accountNumber,
            amount: '250.00',
            initiatedBy: owner.user._id,
            idempotencyKey: 'init-dep-9',
        });

        const intruder = await createCustomerWithAccount();

        const apply = await request(app)
            .post('/api/loans/apply')
            .set('Authorization', `Bearer ${owner.token}`)
            .send({ principal: '500.00', interestRate: '0.05', termMonths: 5, disbursementAccountNumber: owner.account.accountNumber });

        const { token: managerToken } = await createStaffToken('manager');
        await request(app).patch(`/api/loans/${apply.body.data._id}/approve`).set('Authorization', `Bearer ${managerToken}`);

        const res = await request(app)
            .post(`/api/loans/${apply.body.data._id}/repay`)
            .set('Authorization', `Bearer ${intruder.token}`)
            .set('Idempotency-Key', 'loan-repay-intruder')
            .send({ amount: '10.00' });

        expect(res.status).toBe(403);
    });
});
