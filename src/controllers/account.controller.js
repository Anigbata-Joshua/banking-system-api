import Account from '../models/account.model.js';
import * as accountService from '../services/account.service.js';
import catchAsync from '../utils/catchAsync.js';
import BigNumber from 'bignumber.js';

export const openAccount = catchAsync(async (req, res) => {
    const { type, overdraftLimit } = req.body;

    const account = await accountService.openAccount({
        customerId: req.user.customerId,
        type,
        overdraftLimit,
    });

    res.status(201).json({ success: true, data: account });
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
    // Customers can only view their own.
    if (req.user.role === 'customer' && account.customerId.toString() !== req.user.customerId) {
        return res.status(403).json({
            success: false,
            message: 'You do not have permission to view this account',
        });
    }

    res.status(200).json({ success: true, data: account });
});


export const getMyAccounts = catchAsync(async (req, res) => {
    const { customerId } = req.user;
    const myAccounts = await Account.find({ customerId });

    res.status(200).json({ success: true, data: myAccounts });
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

    return res.status(200).json({
        success: true,
        message: 'Account closed successfully',
        data: account,
    });
});