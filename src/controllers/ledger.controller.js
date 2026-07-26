import Account from '../models/account.model.js';
import * as ledgerService from '../services/ledger.service.js';
import catchAsync from '../utils/catchAsync.js';
import { verifyAccountOwnership } from '../utils/verifyAccountOwnership.js';


export const depositInAccount = catchAsync(async (req, res) => {
    const { amount, description } = req.body;
    const { accountNumber } = req.params;
    const idempotencyKey = req.headers['idempotency-key'];
    const initiatedBy = req.user.userId;

    await verifyAccountOwnership(accountNumber, req.user);

    const result = await ledgerService.deposit({
        accountNumber,
        amount,
        initiatedBy,
        idempotencyKey,
        description,
    });

    res.status(201).json({
        success: true,
        message: 'Deposit successful',
        data: result,
    });
});

export const withdrawFromAccount = catchAsync(async (req, res) => {
    const { amount, description } = req.body;
    const { accountNumber } = req.params;
    const idempotencyKey = req.headers['idempotency-key'];
    const initiatedBy = req.user.userId;

    await verifyAccountOwnership(accountNumber, req.user);

    const result = await ledgerService.withdraw({
        accountNumber,
        amount,
        initiatedBy,
        idempotencyKey,
        description,
    });

    res.status(201).json({
        success: true,
        message: 'Withdrawal successful',
        data: result,
    });
});

export const transferFunds = catchAsync(async (req, res) => {
    const { toAccountNumber, amount, note } = req.body;
    const { accountNumber: fromAccountNumber } = req.params;
    const idempotencyKey = req.headers['idempotency-key'];
    const initiatedBy = req.user.userId;

    await verifyAccountOwnership(fromAccountNumber, req.user);

    const result = await ledgerService.transfer({ fromAccountNumber, toAccountNumber, amount, initiatedBy, idempotencyKey, note });

    res.status(201).json({
        success: true, message: 'Transfer successful',
        data: result
    });
});