import { Router } from 'express';
import { uploadKYCDocument, getKYCDocument } from '../controllers/customer.controller.js';
import { authenticate } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';

const router = Router();

router.post('/kyc/upload', authenticate, upload.single('document'), uploadKYCDocument);
router.get('/kyc/documents/:filename', authenticate, getKYCDocument);

export default router;
