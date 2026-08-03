import { Router } from 'express';
import * as cardController from '../controllers/card.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate, issueCardSchema } from '../middleware/validate.js';

const router = Router();

router.post('/', authenticate, authorize('customer'), validate(issueCardSchema), cardController.issueCard);
router.get('/', authenticate, cardController.getMyCards);
router.patch('/:id/block', authenticate, cardController.blockCard);

export default router;