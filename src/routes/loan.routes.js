import { Router } from 'express';
import * as loanController from '../controllers/loan.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

router.post('/apply', authenticate, loanController.applyForLoan);
router.get('/', authenticate, loanController.getLoans);
router.patch('/:id/approve', authenticate, authorize('manager', 'admin'), loanController.approveLoan);
router.patch('/:id/reject', authenticate, authorize('manager', 'admin'), loanController.rejectLoan);
router.post('/:id/repay', authenticate, loanController.repayLoan);
router.get('/:id/transactions', authenticate, loanController.getLoanTransactions);
export default router;