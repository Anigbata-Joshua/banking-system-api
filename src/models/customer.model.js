import mongoose from 'mongoose';

const customerSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: [true, 'User ID reference is required'], unique: true, },
        dateOfBirth: { type: Date, required: [true, 'Date of birth is required'], },
        address: {
            street: { type: String, required: true },
            city: { type: String, required: true },
            state: { type: String, required: true },
            zipCode: { type: String, required: true },
            country: { type: String, required: true }
        },
        nationalId: { type: String, required: [true, 'National ID is required'], unique: true, trim: true, },
    },
    { timestamps: true,}
);



const Customer = mongoose.model('Customer', customerSchema);

export default Customer;
