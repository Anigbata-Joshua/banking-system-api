import { Router } from 'express';
import * as cardController from '../controllers/card.controller.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.post('/', authenticate, cardController.issueCard);
router.get('/', authenticate, cardController.getMyCards);
router.patch('/:id/block', authenticate, cardController.blockCard);

export default router;