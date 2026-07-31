import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate, registerSchema, loginSchema, createStaffSchema } from '../middleware/validate.js';

const router = Router();

router.post('/register', validate(registerSchema), authController.register);
router.post('/login', validate(loginSchema), authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authenticate, authController.logout);
router.post('/staff', authenticate, authorize('admin'), validate(createStaffSchema), authController.createStaff);

export default router;