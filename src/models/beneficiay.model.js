import mongoose from 'mongoose';

const beneficiarySchema = new mongoose.Schema(
    {
        customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: [true, 'Customer ID reference is required'] },
        beneficiaryAccountNumber: { type: String, required: [true, 'Beneficiary account number is required'], trim: true },
        beneficiaryName: { type: String, required: [true, 'Beneficiary name is required'], trim: true },
        nickname: { type: String, trim: true },
        isVerified: { type: Boolean, default: false },
    },
    { timestamps: true }
);

beneficiarySchema.index({ customerId: 1, beneficiaryAccountNumber: 1 }, { unique: true });
const Beneficiary = mongoose.model('Beneficiary', beneficiarySchema);

export default Beneficiary;