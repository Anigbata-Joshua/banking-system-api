import { Router } from 'express';
import * as accountController from '../controllers/account.controller.js';
import * as ledgerController from '../controllers/ledger.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

router.post('/', authenticate, accountController.openAccount);
router.get('/:accountNumber', authenticate, accountController.getAccountByNumber);
router.get('/', authenticate, accountController.getMyAccounts);
router.patch('/:accountNumber/freeze', authenticate, authorize('teller', 'manager', 'admin'), accountController.freezeAccount);
router.patch('/:accountNumber/unfreeze', authenticate, authorize('teller', 'manager', 'admin'), accountController.unfreezeAccount);
router.delete('/:accountNumber', authenticate, authorize('manager', 'admin'), accountController.deleteAccount);
router.post('/:accountNumber/deposit', authenticate, ledgerController.depositInAccount);
router.post('/:accountNumber/withdraw', authenticate, ledgerController.withdrawFromAccount);
router.post('/:accountNumber/transfer', authenticate, ledgerController.transferFunds);

export default router;