import { Router } from 'express';
import { getFinancialReport } from '../controllers/report.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

router.get('/financial', authenticate, authorize('manager', 'admin'), getFinancialReport);

export default router;
