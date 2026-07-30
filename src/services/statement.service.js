import Account from '../models/account.model.js';
import Transaction from '../models/transaction.model.js';
import Statement from '../models/statement.model.js';

import PDFDocument from 'pdfkit';
export async function generateStatementData({ accountId, startDate, endDate }) {
    const account = await Account.findById(accountId);
    if (!account) {
        throw new Error('Account not found');
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.valueOf())) {
        throw new Error(`Invalid startDate: "${startDate}"`);
    }
    if (isNaN(end.valueOf())) {
        throw new Error(`Invalid endDate: "${endDate}"`);
    }

    // new Date("2026-07-29") parses to midnight UTC (00:00:00.000) on that day, not
    // end-of-day. Using it as-is in a $lte filter silently excludes every transaction
    // that happened later that same day — which looks like missing data, not a bug,
    // unless you notice the date range said to include that day at all. Push the end
    // boundary to the last instant of the day so "endDate" actually means the whole day.
    const endOfDay = new Date(end);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const transactions = await Transaction.find({
        account: accountId,
        createdAt: { $gte: start, $lte: endOfDay },
    }).sort({ createdAt: 1 });

    return { account, transactions };
}


export function buildStatementPDF({ account, transactions, startDate, endDate }, res) {
    const doc = new PDFDocument({ margin: 50 });

    doc.pipe(res);

    doc.fontSize(18).text('Account Statement', { align: 'center' });
    doc.moveDown();

    doc.fontSize(11);
    doc.text(`Account Number: ${account.accountNumber}`);
    doc.text(`Account Type: ${account.type}`);
    doc.text(`Statement Period: ${startDate} to ${endDate}`);
    doc.text(`Current Balance: ${account.balance.toString()} ${account.currency}`);
    doc.moveDown();

    doc.fontSize(13).text('Transactions', { underline: true });
    doc.moveDown(0.5);

    if (transactions.length === 0) {
        doc.fontSize(11).text('No transactions in this period.');
    } else {
        transactions.forEach((tx) => {
            const date = tx.createdAt.toISOString().split('T')[0];
            doc.fontSize(10).text(
                `${date}  |  ${tx.type.padEnd(15)}  |  ${tx.amount.toString().padStart(10)}  |  Balance after: ${tx.balanceAfter.toString()}`
            );
        });
    }

    doc.end();
}