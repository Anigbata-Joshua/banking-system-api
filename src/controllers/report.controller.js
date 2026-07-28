import Account from '../models/account.model.js';
import Transaction from '../models/transaction.model.js';
import Loan from '../models/loan.model.js';
import Card from '../models/card.model.js';
import catchAsync from '../utils/catchAsync.js';
import BigNumber from 'bignumber.js';

export const getFinancialReport = catchAsync(async (req, res) => {
    // 1. Account Stats
    const accounts = await Account.find({});
    const accountStats = {
        total: accounts.length,
        types: { savings: 0, current: 0 },
        statuses: { active: 0, frozen: 0, closed: 0 },
        totalBalance: new BigNumber(0),
    };
    for (const acc of accounts) {
        accountStats.types[acc.type] = (accountStats.types[acc.type] || 0) + 1;
        accountStats.statuses[acc.status] = (accountStats.statuses[acc.status] || 0) + 1;
        accountStats.totalBalance = accountStats.totalBalance.plus(new BigNumber(acc.balance.toString()));
    }

    // 2. Transaction Stats
    const transactions = await Transaction.find({});
    const transactionStats = {
        total: transactions.length,
        byType: {},
    };
    for (const tx of transactions) {
        if (!transactionStats.byType[tx.type]) {
            transactionStats.byType[tx.type] = { count: 0, totalAmount: new BigNumber(0) };
        }
        transactionStats.byType[tx.type].count += 1;
        transactionStats.byType[tx.type].totalAmount = transactionStats.byType[tx.type].totalAmount.plus(new BigNumber(tx.amount.toString()));
    }
    // Convert BigNumber to string in transaction stats
    for (const type of Object.keys(transactionStats.byType)) {
        transactionStats.byType[type].totalAmount = transactionStats.byType[type].totalAmount.toFixed(2);
    }

    // 3. Loan Stats
    const loans = await Loan.find({});
    const loanStats = {
        total: loans.length,
        statuses: { pending: 0, approved: 0, rejected: 0, active: 0, closed: 0, defaulted: 0 },
        totalPrincipal: new BigNumber(0),
        totalOutstanding: new BigNumber(0),
    };
    for (const loan of loans) {
        loanStats.statuses[loan.status] = (loanStats.statuses[loan.status] || 0) + 1;
        loanStats.totalPrincipal = loanStats.totalPrincipal.plus(new BigNumber(loan.principal.toString()));
        if (loan.outstandingBalance) {
            loanStats.totalOutstanding = loanStats.totalOutstanding.plus(new BigNumber(loan.outstandingBalance.toString()));
        }
    }

    // 4. Card Stats
    const cards = await Card.find({});
    const cardStats = {
        total: cards.length,
        statuses: { active: 0, blocked: 0, expired: 0 },
    };
    for (const card of cards) {
        cardStats.statuses[card.status] = (cardStats.statuses[card.status] || 0) + 1;
    }

    res.status(200).json({
        success: true,
        data: {
            accounts: {
                total: accountStats.total,
                types: accountStats.types,
                statuses: accountStats.statuses,
                totalBalance: accountStats.totalBalance.toFixed(2),
            },
            transactions: transactionStats,
            loans: {
                total: loanStats.total,
                statuses: loanStats.statuses,
                totalPrincipal: loanStats.totalPrincipal.toFixed(2),
                totalOutstanding: loanStats.totalOutstanding.toFixed(2),
            },
            cards: cardStats,
        },
    });
});
