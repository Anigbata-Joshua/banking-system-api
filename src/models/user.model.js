import mongoose from "mongoose";
import bcrypt from "bcryptjs";
const userSchema = new mongoose.Schema(
    {
        name: { type: String, required: [true, "Name is required"], trim: true },
        email: { type: String, required: [true, "Email is required"], unique: true, lowercase: true, trim: true, match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'], },
        passwordHash: { type: String, required: [true, "Password hash is required"] },
        role: { type: String, enum: ['customer', 'teller', 'manager', 'admin'], default: 'customer' },
        phone: { type: String, trim: true },
        isActive: { type: Boolean, default: true, },
        kycStatus: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending', },
        kycDocuments: [{ type: String, },],
        refreshTokenHash: { type: String, },
    }, {timestamps: true}
);

userSchema.pre('save', async function () {
    if (!this.isModified('passwordHash')) return;
    this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
});

userSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.passwordHash);
};

const User = mongoose.model('User', userSchema);

export default User;