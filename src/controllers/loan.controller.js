import Account from '../models/account.model.js';
import Loan from '../models/loan.model.js';
import catchAsync from '../utils/catchAsync.js';
import * as ledgerService from '../services/ledger.service.js';
import BigNumber from 'bignumber.js';
import Transaction from '../models/transaction.model.js';
import { logAction } from '../services/auditLog.service.js';

export const applyForLoan = catchAsync(async (req, res) => {
    const { principal, interestRate, termMonths, disbursementAccountNumber } = req.body;

    const existingLoan = await Loan.findOne({
        customerId: req.user.customerId,
        status: { $in: ['pending', 'active'] },
    });

    if (existingLoan) {
        return res.status(400).json({
            success: false,
            message: 'You already have an outstanding loan application or active loan. Please complete repayment before applying for another.',
        });
    }

    const account = await Account.findOne({ accountNumber: disbursementAccountNumber });

    if (!account) {
        return res.status(404).json({
            success: false,
            message: 'Disbursement account not found',
        });
    }

    if (account.customerId.toString() !== req.user.customerId) {
        return res.status(403).json({
            success: false,
            message: 'You do not have permission to use this account for disbursement',
        });
    }

    // Loan borrowing limit check based on transaction history (deposits/transfer_ins)
    const customerAccounts = await Account.find({ customerId: req.user.customerId });
    const customerAccountIds = customerAccounts.map(acc => acc._id);

    const deposits = await Transaction.find({
        account: { $in: customerAccountIds },
        type: { $in: ['deposit', 'transfer_in'] },
        status: 'completed',
    });

    let totalDeposits = new BigNumber(0);
    for (const dep of deposits) {
        totalDeposits = totalDeposits.plus(new BigNumber(dep.amount.toString()));
    }

    const principalVal = new BigNumber(principal);
    if (totalDeposits.isZero() || principalVal.isGreaterThan(totalDeposits.times(2))) {
        return res.status(400).json({
            success: false,
            message: `Loan eligibility check failed. Your borrowing limit is 2x your total deposits/transfers-in ($${totalDeposits.times(2).toFixed(2)}). You currently have total deposits of $${totalDeposits.toFixed(2)}.`,
        });
    }

    const loan = await Loan.create({
        customerId: req.user.customerId,
        disbursementAccountId: account._id,
        principal,
        interestRate,
        termMonths,
        status: 'pending',
    });

    await logAction(req.user.userId, 'APPLY_LOAN', { loanId: loan._id, principal }, req.ip);

    res.status(201).json({ success: true, message: 'Loan request sent successfully', data: loan });
});
//Get Loans
export const getLoans = catchAsync(async (req, res) => {
    const filter = req.user.role === 'customer'
        ? { customerId: req.user.customerId }
        : {}; // manager/admin see all loans

    const loans = await Loan.find(filter);
    const totalLoans = loans.length;

    res.status(200).json({ success: true, totalLoans, data: loans });
});


//Approve loan
export const approveLoan = catchAsync(async (req, res) => {
    const { id } = req.params;

    const loan = await Loan.findById(id).populate('disbursementAccountId');
    if (!loan) {
        return res.status(404).json({
            success: false,
            message: 'Loan not found'
        });
    }

    if (loan.status !== 'pending') {
        return res.status(400).json({
            success: false,
            message: `Cannot approve a loan with status '${loan.status}'`
        });
    }

    const principal = new BigNumber(loan.principal.toString());
    const interestRate = new BigNumber(loan.interestRate.toString());
    const totalRepayable = principal.plus(principal.times(interestRate));
    const monthlyAmount = totalRepayable.dividedBy(loan.termMonths);

    const repaymentSchedule = Array.from({ length: loan.termMonths }, (_, i) => {
        const dueDate = new Date();
        dueDate.setMonth(dueDate.getMonth() + i + 1);
        return {
            dueDate,
            amount: monthlyAmount.toFixed(2),
            status: 'pending',
        };
    });

    const disbursement = await ledgerService.deposit({
        accountNumber: loan.disbursementAccountId.accountNumber,
        amount: principal.toFixed(2),
        initiatedBy: req.user.userId,
        idempotencyKey: `loan-disbursement-${loan._id}`,
        description: `Loan disbursement for loan ${loan._id}`,
    });

    loan.status = 'active';
    loan.approvedBy = req.user.userId;
    loan.disbursementDate = new Date();
    loan.outstandingBalance = totalRepayable.toFixed(2);
    loan.repaymentSchedule = repaymentSchedule;
    await loan.save();

    await logAction(req.user.userId, 'APPROVE_LOAN', { loanId: loan._id, principal: loan.principal }, req.ip);

    res.status(200).json({
        success: true,
        message: 'Loan approved and disbursed',
        data: { loan, disbursement }
    });
});

//Repay loan
export const rejectLoan = catchAsync(async (req, res) => {
    const { id } = req.params;

    const loan = await Loan.findById(id);
    if (!loan) {
        return res.status(404).json({
            success: false,
            message: 'Loan not found'
        });
    }

    if (loan.status !== 'pending') {
        return res.status(400).json({
            success: false,
            message: `Cannot reject a loan with status '${loan.status}'`
        });
    }

    loan.status = 'rejected';
    loan.approvedBy = req.user.userId;
    await loan.save();

    await logAction(req.user.userId, 'REJECT_LOAN', { loanId: loan._id }, req.ip);

    res.status(200).json({ success: true, message: 'Loan rejected', data: loan });
});

export const repayLoan = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { amount } = req.body;
    const idempotencyKey = req.headers['idempotency-key'];

    if (!idempotencyKey) {
        return res.status(400).json({ success: false, message: 'Idempotency-Key header is required' });
    }

    const loan = await Loan.findById(id);
    if (!loan) {
        return res.status(404).json({ success: false, message: 'Loan not found' });
    }

    if (loan.customerId.toString() !== req.user.customerId) {
        return res.status(403).json({ success: false, message: 'You do not have permission to repay this loan' });
    }

    const result = await ledgerService.repayLoan({
        loanId: id,
        amount,
        initiatedBy: req.user.userId,
        idempotencyKey,
    });

    await logAction(req.user.userId, 'REPAY_LOAN', { loanId: id, amount }, req.ip);

    res.status(200).json({ success: true, message: 'Repayment successful', data: result });
});

//Get loan transcations
export const getLoanTransactions = catchAsync(async (req, res) => {
    const { id } = req.params;

    const loan = await Loan.findById(id);
    if (!loan) {
        return res.status(404).json({ success: false, message: 'Loan not found' });
    }

    if (req.user.role === 'customer' && loan.customerId.toString() !== req.user.customerId) {
        return res.status(403).json({ success: false, message: 'You do not have permission to view this loan' });
    }

    const transactions = await Transaction.find({
        description: { $regex: loan._id.toString() },
    }).sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: transactions });
});