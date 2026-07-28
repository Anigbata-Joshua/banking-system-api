import { Router } from 'express';
import { getAuditLogs } from '../controllers/auditLog.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

router.get('/', authenticate, authorize('teller', 'manager', 'admin'), getAuditLogs);

export default router;
