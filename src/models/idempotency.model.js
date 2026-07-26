import mongoose from 'mongoose';

const idempotencySchema = new mongoose.Schema(
    {
        key: { type: String, required: true, unique: true, index: true },
        statusCode: { type: Number },
        response: { type: mongoose.Schema.Types.Mixed },
    },
    { timestamps: true }
);

const Idempotency = mongoose.model('Idempotency', idempotencySchema);
export default Idempotency;