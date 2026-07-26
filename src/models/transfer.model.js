import mongoose from 'mongoose';

const transferSchema = new mongoose.Schema(
    {
        transferId: { type: String, required: true, unique: true, index: true, },
        fromAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true, },
        toAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true, },
        amount: { type: mongoose.Schema.Types.Decimal128, required: true, },
        status: { type: String, enum: ['pending', 'completed', 'failed', 'reversed'], default: 'pending', required: true, },
        initiatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, },
        note: { type: String, trim: true, },
    },
    { timestamps: true, }
);

const Transfer = mongoose.model('Transfer', transferSchema);

export default Transfer;
