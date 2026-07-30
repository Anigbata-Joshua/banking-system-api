import { Router } from 'express';
import * as accountController from '../controllers/account.controller.js';
import * as ledgerController from '../controllers/ledger.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { enforceIdempotency } from '../middleware/idempotency.js';
import * as statementController from '../controllers/statement.controller.js';


const router = Router();

router.post('/', authenticate, authorize('customer'), accountController.openAccount);
router.get('/:accountNumber', authenticate, accountController.getAccountByNumber);
router.get('/', authenticate, accountController.getMyAccounts);
router.patch('/:accountNumber/freeze', authenticate, authorize('teller', 'manager', 'admin'), accountController.freezeAccount);
router.patch('/:accountNumber/unfreeze', authenticate, authorize('teller', 'manager', 'admin'), accountController.unfreezeAccount);
router.delete('/:accountNumber', authenticate, authorize('manager', 'admin'), accountController.deleteAccount);
router.post('/:accountNumber/deposit', authenticate, enforceIdempotency, ledgerController.depositInAccount);
router.post('/:accountNumber/withdraw', authenticate, enforceIdempotency, ledgerController.withdrawFromAccount);
router.post('/:accountNumber/transfer', authenticate, enforceIdempotency, ledgerController.transferFunds);
// Account Statement
router.get('/:accountNumber/statement', authenticate, statementController.getStatement);
router.get('/:accountNumber/transactions', authenticate, accountController.getTransactionHistory);

export default router;