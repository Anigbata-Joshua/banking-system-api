import mongoose from 'mongoose';

const accountSchema = new mongoose.Schema(
    {
        accountNumber: { type: String, required: [true, 'Account number is required'], unique: true, index: true, },
        customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: [true, 'Customer ID reference is required'], },
        type: { type: String, enum: ['savings', 'current'], required: [true, 'Account type is required'], },
        balance: { type: mongoose.Schema.Types.Decimal128, required: true,  default: () => mongoose.Types.Decimal128.fromString('0.00'),},
        currency: { type: String, required: true, default: 'NGN', },
        status: { type: String, enum: ['active', 'frozen', 'closed'], default: 'active', },
        overdraftLimit: {
            type: mongoose.Schema.Types.Decimal128,
            required: true,
            default: () => mongoose.Types.Decimal128.fromString('0.00'),
            validate: {
                validator: (value) => parseFloat(value.toString()) >= 0,
                message: 'Overdraft limit cannot be negative',
            },
        },
        version: { type: Number, default: 0, required: true, },
        closedAt: { type: Date, },
    }, {
        timestamps: true,
        toJSON: {
            transform: (doc, ret) => {
                // At the point this transform runs, Decimal128 fields are still the raw
                // BSON Decimal128 instance — the { $numberDecimal: "..." } wrapper shape
                // doesn't exist yet, since that's produced later by Decimal128's own
                // toJSON() when the final JSON.stringify pass serializes it. Checking for
                // the wrapper shape here (as an earlier version of this code did) never
                // matches anything, so the raw value passes through untouched and the
                // wrapper leaks into the response anyway. Calling toString() directly on
                // the Decimal128 instance is what actually flattens it to a plain string.
                if (ret.balance !== undefined && ret.balance !== null) {
                    ret.balance = ret.balance.toString();
                }
                if (ret.overdraftLimit !== undefined && ret.overdraftLimit !== null) {
                    ret.overdraftLimit = ret.overdraftLimit.toString();
                }
                return ret;
            },
        },
    },
);

accountSchema.index({ customerId: 1 });

const Account = mongoose.model('Account', accountSchema);

export default Account;