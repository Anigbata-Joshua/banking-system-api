import Account from '../models/account.model.js';
import Transaction from '../models/transaction.model.js';
import Loan from '../models/loan.model.js';
import Card from '../models/card.model.js';
import catchAsync from '../utils/catchAsync.js';
import BigNumber from 'bignumber.js';

export const getFinancialReport = catchAsync(async (req, res) => {
    // 1. Account Stats via Aggregation
    const accountStatsList = await Account.aggregate([
        {
            $group: {
                _id: null,
                total: { $sum: 1 },
                savings: { $sum: { $cond: [{ $eq: ["$type", "savings"] }, 1, 0] } },
                current: { $sum: { $cond: [{ $eq: ["$type", "current"] }, 1, 0] } },
                active: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
                frozen: { $sum: { $cond: [{ $eq: ["$status", "frozen"] }, 1, 0] } },
                closed: { $sum: { $cond: [{ $eq: ["$status", "closed"] }, 1, 0] } },
                totalBalance: { $sum: "$balance" }
            }
        }
    ]);

    const rawAccountStats = accountStatsList[0] || {
        total: 0,
        savings: 0,
        current: 0,
        active: 0,
        frozen: 0,
        closed: 0,
        totalBalance: 0
    };

    const accountStats = {
        total: rawAccountStats.total,
        types: {
            savings: rawAccountStats.savings,
            current: rawAccountStats.current
        },
        statuses: {
            active: rawAccountStats.active,
            frozen: rawAccountStats.frozen,
            closed: rawAccountStats.closed
        },
        totalBalance: new BigNumber(rawAccountStats.totalBalance ? rawAccountStats.totalBalance.toString() : '0').toFixed(2)
    };

    // 2. Transaction Stats via Aggregation
    const transactionStatsList = await Transaction.aggregate([
        {
            $group: {
                _id: "$type",
                count: { $sum: 1 },
                totalAmount: { $sum: "$amount" }
            }
        }
    ]);

    let totalTransactions = 0;
    const byType = {};
    for (const item of transactionStatsList) {
        totalTransactions += item.count;
        byType[item._id] = {
            count: item.count,
            totalAmount: new BigNumber(item.totalAmount ? item.totalAmount.toString() : '0').toFixed(2)
        };
    }

    const transactionStats = {
        total: totalTransactions,
        byType
    };

    // 3. Loan Stats via Aggregation
    const loanStatsList = await Loan.aggregate([
        {
            $group: {
                _id: null,
                total: { $sum: 1 },
                pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
                approved: { $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] } },
                rejected: { $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] } },
                active: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
                closed: { $sum: { $cond: [{ $eq: ["$status", "closed"] }, 1, 0] } },
                defaulted: { $sum: { $cond: [{ $eq: ["$status", "defaulted"] }, 1, 0] } },
                totalPrincipal: { $sum: "$principal" },
                totalOutstanding: { $sum: { $ifNull: ["$outstandingBalance", 0] } }
            }
        }
    ]);

    const rawLoanStats = loanStatsList[0] || {
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
        active: 0,
        closed: 0,
        defaulted: 0,
        totalPrincipal: 0,
        totalOutstanding: 0
    };

    const loanStats = {
        total: rawLoanStats.total,
        statuses: {
            pending: rawLoanStats.pending,
            approved: rawLoanStats.approved,
            rejected: rawLoanStats.rejected,
            active: rawLoanStats.active,
            closed: rawLoanStats.closed,
            defaulted: rawLoanStats.defaulted
        },
        totalPrincipal: new BigNumber(rawLoanStats.totalPrincipal ? rawLoanStats.totalPrincipal.toString() : '0').toFixed(2),
        totalOutstanding: new BigNumber(rawLoanStats.totalOutstanding ? rawLoanStats.totalOutstanding.toString() : '0').toFixed(2)
    };

    // 4. Card Stats via Aggregation
    const cardStatsList = await Card.aggregate([
        {
            $group: {
                _id: null,
                total: { $sum: 1 },
                active: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
                blocked: { $sum: { $cond: [{ $eq: ["$status", "blocked"] }, 1, 0] } },
                expired: { $sum: { $cond: [{ $eq: ["$status", "expired"] }, 1, 0] } }
            }
        }
    ]);

    const rawCardStats = cardStatsList[0] || {
        total: 0,
        active: 0,
        blocked: 0,
        expired: 0
    };

    const cardStats = {
        total: rawCardStats.total,
        statuses: {
            active: rawCardStats.active,
            blocked: rawCardStats.blocked,
            expired: rawCardStats.expired
        }
    };

    res.status(200).json({
        success: true,
        data: {
            accounts: accountStats,
            transactions: transactionStats,
            loans: loanStats,
            cards: cardStats,
        },
    });
});
