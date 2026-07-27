import mongoose from 'mongoose';

const cardSchema = new mongoose.Schema(
    {
        customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: [true, 'Customer ID reference is required'] },
        accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: [true, 'Account reference is required'] },
        cardNumberHash: { type: String, required: [true, 'Card number hash is required'] },
        cardNumberLastFour: { type: String, required: [true, 'Last four digits are required'], match: [/^\d{4}$/, 'Must be exactly 4 digits'] },
        cardType: { type: String, enum: ['debit', 'credit'], required: [true, 'Card type is required'] },
        expiryDate: { type: Date, required: [true, 'Expiry date is required'] },
        status: { type: String, enum: ['active', 'blocked', 'expired'], default: 'active' },
        pinHash: { type: String, required: [true, 'PIN hash is required'] },
    },
    { timestamps: true }
);

cardSchema.index({ customerId: 1 });
cardSchema.index({ accountId: 1 });

const Card = mongoose.model('Card', cardSchema);

export default Card;