import { Router } from 'express';
import { uploadKYCDocument } from '../controllers/customer.controller.js';
import { authenticate } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';

const router = Router();

router.post('/kyc/upload', authenticate, upload.single('document'), uploadKYCDocument);

export default router;
