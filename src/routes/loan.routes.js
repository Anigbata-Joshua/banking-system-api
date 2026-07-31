import { Router } from 'express';
import * as loanController from '../controllers/loan.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate, applyLoanSchema, repayLoanSchema } from '../middleware/validate.js';

const router = Router();

router.post('/apply', authenticate, authorize('customer'), validate(applyLoanSchema), loanController.applyForLoan);
router.get('/', authenticate, loanController.getLoans);
// Maker: teller or manager recommends the loan. No money moves here.
router.patch('/:id/recommend', authenticate, authorize('teller', 'manager'), loanController.recommendLoan);
// Checker: manager confirms — must be a different person than whoever
// recommended it. This is the only step that disburses funds.
router.patch('/:id/approve', authenticate, authorize('manager'), loanController.approveLoan);
router.patch('/:id/reject', authenticate, authorize('teller', 'manager'), loanController.rejectLoan);
router.post('/:id/repay', authenticate, authorize('customer'), validate(repayLoanSchema), loanController.repayLoan);
router.get('/:id/transactions', authenticate, loanController.getLoanTransactions);
export default router;