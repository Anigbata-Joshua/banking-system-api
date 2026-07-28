import AuditLog from '../models/auditLog.model.js';
import catchAsync from '../utils/catchAsync.js';

export const getAuditLogs = catchAsync(async (req, res) => {
    const { action, userId, startDate, endDate, page = 1, limit = 10 } = req.query;

    const query = {};
    if (action) query.action = action;
    if (userId) query.userId = userId;

    if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) {
            const start = new Date(startDate);
            if (!isNaN(start.valueOf())) {
                query.timestamp.$gte = start;
            }
        }
        if (endDate) {
            const end = new Date(endDate);
            if (!isNaN(end.valueOf())) {
                query.timestamp.$lte = end;
            }
        }
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = Math.min(parseInt(limit, 10) || 10, 100);
    const skip = (pageNum - 1) * limitNum;

    const totalCount = await AuditLog.countDocuments(query);
    const totalPages = Math.ceil(totalCount / limitNum);

    const logs = await AuditLog.find(query)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('userId', 'name email role');

    res.status(200).json({
        success: true,
        pagination: {
            page: pageNum,
            limit: limitNum,
            totalPages,
            totalCount,
        },
        data: logs,
    });
});
