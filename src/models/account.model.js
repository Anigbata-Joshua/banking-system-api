import mongoose from 'mongoose';

const accountSchema = new mongoose.Schema(
    {
        accountNumber: { type: String, required: [true, 'Account number is required'], unique: true, index: true, },
        customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: [true, 'Customer ID reference is required'], },
        type: { type: String, enum: ['savings', 'current'], required: [true, 'Account type is required'], },
        balance: { type: mongoose.Schema.Types.Decimal128, required: true,  default: () => mongoose.Types.Decimal128.fromString('0.00'),},
        currency: { type: String, required: true, default: 'NGN', },
        status: { type: String, enum: ['active', 'frozen', 'closed'], default: 'active', },
        overdraftLimit: { type: mongoose.Schema.Types.Decimal128, required: true,  default: () => mongoose.Types.Decimal128.fromString('0.00'),},
        version: { type: Number, default: 0, required: true, },
        closedAt: { type: Date, },
    }, {
        timestamps: true,},
);

// Indexes
accountSchema.index({ customerId: 1 });

const Account = mongoose.model('Account', accountSchema);

export default Account;
