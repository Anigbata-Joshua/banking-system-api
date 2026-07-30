import Account from '../models/account.model.js';
import Transaction from '../models/transaction.model.js';
import * as accountService from '../services/account.service.js';
import catchAsync from '../utils/catchAsync.js';
import BigNumber from 'bignumber.js';
import { logAction } from '../services/auditLog.service.js';


export const openAccount = catchAsync(async (req, res) => {
    const { type, overdraftLimit } = req.body;

    const account = await accountService.openAccount({
        customerId: req.user.customerId,
        type,
        overdraftLimit,
    });

    await logAction(req.user.userId, 'CREATE_ACCOUNT', { accountNumber: account.accountNumber, type: account.type, customerId: account.customerId }, req.ip);

    res.status(201).json({ success: true, message: 'Account Created Successfully', data: account });
});

export const getAccountByNumber = catchAsync(async (req, res) => {

    const { accountNumber } = req.params;
    const account = await Account.findOne({ accountNumber });

    if (!account) {
        return res.status(404).json({
            success: false,
            message: 'Account not found',
        });
    }

    // Staff (teller/manager/admin) can view any account.
    if (req.user.role === 'customer' && account.customerId.toString() !== req.user.customerId) {
        return res.status(403).json({
            success: false,
            message: 'You do not have permission to view this account',
        });
    }

    res.status(200).json({ success: true, data: account });
});


// Customers can only view their own.
export const getMyAccounts = catchAsync(async (req, res) => {
    const { customerId } = req.user;

    // Fetch accounts belonging to the authenticated customer
    const myAccounts = await Account.find({ customerId });

    const totalAccounts = myAccounts.length;

    res.status(200).json({
        success: true,
        results: totalAccounts,
        data: {
            accounts: myAccounts,
        },
    });
});

export const freezeAccount = catchAsync(async (req, res) => {
    const { accountNumber } = req.params;
    const account = await Account.findOne({ accountNumber });

    if (!account) {
        return res.status(404).json({
            success: false,
            message: 'Account not found',
        });
    }

    if (account.status === 'frozen') {
        return res.status(400).json({
            success: false,
            message: 'Account is already frozen',
            data: account,
        });
    }

    if (account.status === 'closed') {
        return res.status(400).json({
            success: false,
            message: 'Cannot freeze a closed account',
            data: account,
        });
    }

    account.status = 'frozen';
    await account.save();

    await logAction(req.user.userId, 'FREEZE_ACCOUNT', { accountNumber: account.accountNumber }, req.ip);

    res.status(200).json({
        success: true,
        message: 'Account frozen successfully',
        data: account,
    });
});

export const unfreezeAccount = catchAsync(async (req, res) => {
    const { accountNumber } = req.params;
    const account = await Account.findOne({ accountNumber });

    if (!account) {
        return res.status(404).json({
            success: false,
            message: 'Account not found',
        });
    }

    if (account.status === 'closed') {
        return res.status(400).json({
            success: false,
            message: 'Cannot unfreeze a closed account',
        });
    }

    if (account.status === 'active') {
        return res.status(200).json({
            success: true,
            message: 'Account is already active',
            data: account,
        });
    }

    account.status = 'active';
    await account.save();

    await logAction(req.user.userId, 'UNFREEZE_ACCOUNT', { accountNumber: account.accountNumber }, req.ip);

    return res.status(200).json({
        success: true,
        message: 'Account unfrozen successfully',
        data: account,
    });
});

export const deleteAccount = catchAsync(async (req, res) => {
    const { accountNumber } = req.params;
    const account = await Account.findOne({ accountNumber });

    if (!account) {
        return res.status(404).json({
            success: false,
            message: 'Account not found',
        });
    }

    if (account.status === 'closed') {
        return res.status(400).json({
            success: false,
            message: 'Account already closed',
        });
    }

    const balance = new BigNumber(account.balance.toString());
    if (!balance.isZero()) {
        return res.status(400).json({
            success: false,
            message: 'Cannot close an account with a non-zero balance',
        });
    }

    account.status = 'closed';
    account.closedAt = new Date();
    await account.save();

    await logAction(req.user.userId, 'CLOSE_ACCOUNT', { accountNumber: account.accountNumber }, req.ip);

    return res.status(200).json({
        success: true,
        message: 'Account closed successfully',
        data: account,
    });
});

export const getTransactionHistory = catchAsync(async (req, res) => {
    const { accountNumber } = req.params;
    const { type, startDate, endDate, minAmount, maxAmount, page = 1, limit = 10 } = req.query;

    const account = await Account.findOne({ accountNumber });
    if (!account) {
        return res.status(404).json({ success: false, message: 'Account not found' });
    }

    if (req.user.role === 'customer' && account.customerId.toString() !== req.user.customerId) {
        return res.status(403).json({ success: false, message: 'You do not have permission to access this account' });
    }

    const query = { account: account._id };

    if (type) {
        query.type = type;
    }

    if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) {
            const start = new Date(startDate);
            if (!isNaN(start.valueOf())) query.createdAt.$gte = start;
        }
        if (endDate) {
            const end = new Date(endDate);
            if (!isNaN(end.valueOf())) query.createdAt.$lte = end;
        }
    }

    if (minAmount || maxAmount) {
        query.amount = {};
        if (minAmount) {
            query.amount.$gte = parseFloat(minAmount);
        }
        if (maxAmount) {
            query.amount.$lte = parseFloat(maxAmount);
        }
    }

// parseInt("-1", 10) is -1, which is truthy — the `|| 1` fallback only catches
// NaN/0, not negative numbers. A negative page previously flowed straight into
// skip = (pageNum - 1) * limitNum, producing a negative skip value that MongoDB's
// driver rejects with its own raw error text, which then leaked straight through
// to the API response. Math.max(..., 1) closes that off for both page and limit.
const pageNum = Math.max(parseInt(page, 10) || 1, 1);
const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
const skip = (pageNum - 1) * limitNum;

    const totalCount = await Transaction.countDocuments(query);
    const totalPages = Math.ceil(totalCount / limitNum);

    const transactions = await Transaction.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum);

    res.status(200).json({
        success: true,
        pagination: {
            page: pageNum,
            limit: limitNum,
            totalPages,
            totalCount,
        },
        data: transactions,
    });
});

