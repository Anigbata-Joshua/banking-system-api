import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false, },
        action: { type: String, required: true, index: true, },
        details: { type: mongoose.Schema.Types.Mixed, },
        ipAddress: { type: String, },
    }, { timestamps: { createdAt: 'timestamp', updatedAt: false }, }
);

auditLogSchema.index({ timestamp: -1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

export default AuditLog;
