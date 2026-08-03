import AuditLog from '../models/auditLog.model.js';

// Logs a user action or system event. userId falls back to null if not provided.
export async function logAction(userId, action, details, ipAddress = '') {
    try {
        await AuditLog.create({
            userId: userId || null,
            action,
            details,
            ipAddress,
        });
    } catch (error) {
        console.error(`[AuditLog] Failed to log action '${action}':`, error.message);
    }
}