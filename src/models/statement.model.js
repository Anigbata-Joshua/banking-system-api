import mongoose from 'mongoose';

const statementSchema = new mongoose.Schema(
    {
        accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: [true, 'Account reference is required'] },
        periodStart: { type: Date, required: [true, 'Period start is required'] },
        periodEnd: { type: Date, required: [true, 'Period end is required'] },
        openingBalance: { type: mongoose.Schema.Types.Decimal128, required: true },
        closingBalance: { type: mongoose.Schema.Types.Decimal128, required: true },
        transactions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' }],
        generatedFileUrl: { type: String },
    },
    { timestamps: true }
);

statementSchema.index({ accountId: 1 });

const Statement = mongoose.model('Statement', statementSchema);

export default Statement;