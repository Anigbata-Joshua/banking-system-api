import AuditLog from '../models/auditLog.model.js';

/**
 * Log a user action or system event.
 * @param {string|null} userId - The user ID associated with the event
 * @param {string} action - The action type
 * @param {any} details - Additional context
 * @param {string} [ipAddress] - IP address of the client
 */
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
