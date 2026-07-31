import { Router } from 'express';
import * as beneficiaryController from '../controllers/beneficiary.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate, addBeneficiarySchema } from '../middleware/validate.js';

const router = Router();

router.post('/', authenticate, authorize('customer'), validate(addBeneficiarySchema), beneficiaryController.addBeneficiary);
router.get('/', authenticate, authorize('customer'), beneficiaryController.getBeneficiaries);
router.delete('/:id', authenticate, authorize('customer'), beneficiaryController.deleteBeneficiary);

export default router;