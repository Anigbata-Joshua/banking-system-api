import { Router } from 'express';
import * as beneficiaryController from '../controllers/beneficiary.controller.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.post('/', authenticate, beneficiaryController.addBeneficiary);
router.get('/', authenticate, beneficiaryController.getBeneficiaries);
router.delete('/:id', authenticate, beneficiaryController.deleteBeneficiary);

export default router;