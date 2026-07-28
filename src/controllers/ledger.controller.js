import Account from '../models/account.model.js';
import * as ledgerService from '../services/ledger.service.js';
import catchAsync from '../utils/catchAsync.js';
import { verifyAccountOwnership } from '../utils/verifyAccountOwnership.js';
import { logAction } from '../services/auditLog.service.js';


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

    await logAction(req.user.userId, 'DEPOSIT_SUCCESS', { accountNumber, amount }, req.ip);

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

    await logAction(req.user.userId, 'WITHDRAWAL_SUCCESS', { accountNumber, amount }, req.ip);

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

    await logAction(req.user.userId, 'TRANSFER_SUCCESS', { fromAccountNumber, toAccountNumber, amount }, req.ip);

    res.status(201).json({
        success: true, message: 'Transfer successful',
        data: result
    });
});