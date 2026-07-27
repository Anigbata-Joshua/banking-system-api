import Account from '../models/account.model.js';
import catchAsync from '../utils/catchAsync.js';
import { generateStatementData, buildStatementPDF } from '../services/statement.service.js';

export const getStatement = catchAsync(async (req, res) => {
    const { accountNumber } = req.params;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
        return res.status(400).json({ success: false, message: 'startDate and endDate query params are required' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.valueOf()) || isNaN(end.valueOf())) {
        return res.status(400).json({
            success: false,
            message: 'startDate and endDate must be valid dates (e.g. YYYY-MM-DD)',
        });
    }

    if (start > end) {
        return res.status(400).json({ success: false, message: 'startDate must be before endDate' });
    }

    const account = await Account.findOne({ accountNumber });
    if (!account) {
        return res.status(404).json({ success: false, message: 'Account not found' });
    }

    if (req.user.role === 'customer' && account.customerId.toString() !== req.user.customerId) {
        return res.status(403).json({ success: false, message: 'You do not have permission to view this statement' });
    }

    const { transactions } = await generateStatementData({
        accountId: account._id,
        startDate: start,
        endDate: end,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=statement-${accountNumber}.pdf`);

    buildStatementPDF({ account, transactions, startDate, endDate }, res);
});