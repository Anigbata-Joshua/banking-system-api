import mongoose from 'mongoose';

const repaymentScheduleEntrySchema = new mongoose.Schema(
    {
        dueDate: { type: Date, required: true },
        amount: { type: mongoose.Schema.Types.Decimal128, required: true },
        paidAmount: { type: mongoose.Schema.Types.Decimal128, required: true, default: () => mongoose.Types.Decimal128.fromString('0.00') },
        status: { type: String, enum: ['pending', 'paid', 'overdue', 'partially_paid'], default: 'pending' },
        paidTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
    },{ _id: false });

const loanSchema = new mongoose.Schema(
    {
        customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: [true, 'Customer ID reference is required'] },
        disbursementAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: [true, 'Disbursement account is required'] },
        principal: { type: mongoose.Schema.Types.Decimal128, required: [true, 'Principal amount is required'] },
        interestRate: { type: mongoose.Schema.Types.Decimal128, required: [true, 'Interest rate is required'] },
        termMonths: { type: Number, required: [true, 'Loan term (months) is required'] },
        status: { type: String, enum: ['pending', 'approved', 'rejected', 'active', 'closed', 'defaulted'], default: 'pending' },
        // Maker-checker approval trail. `proposedBy` is the teller/manager who
        // recommended the loan (status moves pending -> approved). `approvedBy`
        // is the different manager/admin who confirmed it (status moves
        // approved -> active, and this is the moment disbursement happens).
        // These must never be the same user — enforced in the controller.
        proposedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        proposedAt: { type: Date },
        approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        disbursementDate: { type: Date },
        outstandingBalance: { type: mongoose.Schema.Types.Decimal128 },
        repaymentSchedule: [repaymentScheduleEntrySchema],
    },
    {
        timestamps: true,
        toJSON: {
            transform: (doc, ret) => {
                if (ret.principal !== undefined && ret.principal !== null) {
                    ret.principal = ret.principal.toString();
                }
                if (ret.interestRate !== undefined && ret.interestRate !== null) {
                    ret.interestRate = ret.interestRate.toString();
                }
                if (ret.outstandingBalance !== undefined && ret.outstandingBalance !== null) {
                    ret.outstandingBalance = ret.outstandingBalance.toString();
                }
                if (Array.isArray(ret.repaymentSchedule)) {
                    ret.repaymentSchedule = ret.repaymentSchedule.map((entry) => ({
                        ...entry,
                        amount: entry.amount !== undefined && entry.amount !== null ? entry.amount.toString() : entry.amount,
                        paidAmount: entry.paidAmount !== undefined && entry.paidAmount !== null ? entry.paidAmount.toString() : entry.paidAmount,
                    }));
                }
                return ret;
            },
        },
    }
);

loanSchema.index({ customerId: 1 });

const Loan = mongoose.model('Loan', loanSchema);

export default Loan;