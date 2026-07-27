import mongoose from 'mongoose';

const repaymentScheduleEntrySchema = new mongoose.Schema(
    {
        dueDate: { type: Date, required: true },
        amount: { type: mongoose.Schema.Types.Decimal128, required: true },
        status: { type: String, enum: ['pending', 'paid', 'overdue'], default: 'pending' },
        paidTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
    },
    { _id: false }
);

const loanSchema = new mongoose.Schema(
    {
        customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: [true, 'Customer ID reference is required'] },
        disbursementAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: [true, 'Disbursement account is required'] },
        principal: { type: mongoose.Schema.Types.Decimal128, required: [true, 'Principal amount is required'] },
        interestRate: { type: mongoose.Schema.Types.Decimal128, required: [true, 'Interest rate is required'] },
        termMonths: { type: Number, required: [true, 'Loan term (months) is required'] },
        status: { type: String, enum: ['pending', 'approved', 'rejected', 'active', 'closed', 'defaulted'], default: 'pending' },
        approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        disbursementDate: { type: Date },
        outstandingBalance: { type: mongoose.Schema.Types.Decimal128 },
        repaymentSchedule: [repaymentScheduleEntrySchema],
    },
    { timestamps: true }
);

loanSchema.index({ customerId: 1 });

const Loan = mongoose.model('Loan', loanSchema);

export default Loan;