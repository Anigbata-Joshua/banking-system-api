import User from '../models/user.model.js';
import catchAsync from '../utils/catchAsync.js';
import { logAction } from '../services/auditLog.service.js';
import path from 'path';
import fs from 'fs';
import { env } from '../config/env.js';

export const uploadKYCDocument = catchAsync(async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Save relative path or filename
    const filePath = req.file.path.replace(/\\/g, '/'); // normalize slashes
    user.kycDocuments.push(filePath);
    user.kycStatus = 'pending';
    await user.save();

    await logAction(req.user.userId, 'UPLOAD_KYC_DOCUMENT', { path: filePath }, req.ip);

    res.status(200).json({
        success: true,
        message: 'KYC document uploaded successfully',
        data: {
            kycStatus: user.kycStatus,
            kycDocuments: user.kycDocuments,
        },
    });
});

export const getKYCDocument = catchAsync(async (req, res) => {
    const { filename } = req.params;
    const uploadDir = env.uploadPath || 'uploads/';
    const sanitizedFilename = path.basename(filename);
    const filePath = path.resolve(uploadDir, sanitizedFilename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, message: 'Document not found' });
    }

    const isStaff = ['teller', 'manager', 'admin'].includes(req.user.role);
    if (!isStaff) {
        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const relativePath = path.join(uploadDir, sanitizedFilename).replace(/\\/g, '/');
        const userHasDoc = user.kycDocuments.some(doc => doc.replace(/\\/g, '/') === relativePath);

        if (!userHasDoc) {
            return res.status(403).json({ success: false, message: 'You do not have permission to access this document' });
        }
    }

    res.sendFile(filePath);
});
