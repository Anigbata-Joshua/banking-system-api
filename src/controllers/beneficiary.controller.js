import Beneficiary from '../models/beneficiay.model.js';
import Account from '../models/account.model.js';
import catchAsync from '../utils/catchAsync.js';

export const addBeneficiary = catchAsync(async (req, res) => {
    const { beneficiaryAccountNumber, beneficiaryName, nickname } = req.body;

    const targetAccount = await Account.findOne({ accountNumber: beneficiaryAccountNumber });
    if (!targetAccount) {
        return res.status(404).json({
            success: false,
            message: 'Beneficiary account number does not exist',
        });
    }

    const existingBeneficiary = await Beneficiary.findOne({
        customerId: req.user.customerId,
        beneficiaryAccountNumber,
    });

    if (existingBeneficiary) {
        return res.status(400).json({
            success: false,
            message: 'This beneficiary has already been added',
        });
    }

    const beneficiary = await Beneficiary.create({
        customerId: req.user.customerId,
        beneficiaryAccountNumber,
        beneficiaryName,
        nickname,
    });

    res.status(201).json({ success: true, data: beneficiary });
});

export const getBeneficiaries = catchAsync(async (req, res) => {
    const beneficiaries = await Beneficiary.find({ customerId: req.user.customerId });
    const total = beneficiaries.length;


    res.status(200).json({ success: true, total, data: beneficiaries });
});

export const deleteBeneficiary = catchAsync(async (req, res) => {
    const { id } = req.params;

    const beneficiary = await Beneficiary.findById(id);

    if (!beneficiary) {
        return res.status(404).json({ success: false, message: 'Beneficiary not found' });
    }

    if (beneficiary.customerId.toString() !== req.user.customerId) {
        return res.status(403).json({ success: false, message: 'You do not have permission to delete this beneficiary' });
    }

    await Beneficiary.findByIdAndDelete(id);

    res.status(200).json({ success: true, message: 'Beneficiary deleted successfully' });
});