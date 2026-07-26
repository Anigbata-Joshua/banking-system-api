import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema(
    {
        transactionId: { type: String, required: true, unique: true, index: true, },
        account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true, },
        type: { type: String, enum: ['deposit', 'withdrawal', 'transfer_in', 'transfer_out', 'loan_disbursement', 'loan_repayment', 'fee',], required: true, },
        amount: { type: mongoose.Schema.Types.Decimal128, required: true, },
        balanceAfter: { type: mongoose.Schema.Types.Decimal128, required: true, },
        relatedTransfer: { type: mongoose.Schema.Types.ObjectId, ref: 'Transfer', },
        status: { type: String, enum: ['pending', 'completed', 'failed', 'reversed'], default: 'pending', required: true, },
        description: { type: String, },
        initiatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, },
        idempotencyKey: { type: String, required: true, unique: true, index: true,},
    },
    {timestamps: true,}
);

// Indexes
transactionSchema.index({ account: 1, createdAt: -1 });

const Transaction = mongoose.model('Transaction', transactionSchema);

export default Transaction;
