import User from '../models/user.model.js';
import catchAsync from '../utils/catchAsync.js';
import { logAction } from '../services/auditLog.service.js';

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
