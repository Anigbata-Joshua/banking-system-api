import Card from '../models/card.model.js';
import Account from '../models/account.model.js';
import catchAsync from '../utils/catchAsync.js';
import bcrypt from 'bcrypt';
import { logAction } from '../services/auditLog.service.js';

export const issueCard = catchAsync(async (req, res) => {
    const { accountId, cardType, pin } = req.body;

    const account = await Account.findById(accountId);
    if (!account) {
        return res.status(404).json({ success: false, message: 'Account not found' });
    }

    if (account.customerId.toString() !== req.user.customerId) {
        return res.status(403).json({ success: false, message: 'You do not have permission to issue a card for this account' });
    }

    // Generate a fake 16-digit card number
    const fullCardNumber = Array.from({ length: 16 }, () => Math.floor(Math.random() * 10)).join('');
    const cardNumberHash = await bcrypt.hash(fullCardNumber, 12);
    const cardNumberLastFour = fullCardNumber.slice(-4);

    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 3); // 3-year validity

    const pinHash = await bcrypt.hash(pin, 12);

    const card = await Card.create({
        customerId: req.user.customerId,
        accountId,
        cardNumberHash,
        cardNumberLastFour,
        cardType,
        expiryDate,
        pinHash,
    });

    await logAction(req.user.userId, 'ISSUE_CARD', { cardId: card._id, accountId, cardType }, req.ip);

    res.status(201).json({
        success: true,
        data: {
            id: card._id,
            cardNumberLastFour: card.cardNumberLastFour,
            cardType: card.cardType,
            expiryDate: card.expiryDate,
            status: card.status,
        },
    });
});

export const getMyCards = catchAsync(async (req, res) => {
    const cards = await Card.find({ customerId: req.user.customerId })
        .select('-cardNumberHash -pinHash');
        const totalCard = cards.length;

    res.status(200).json({ success: true,totalCard, data: cards });
});

export const blockCard = catchAsync(async (req, res) => {
    const { id } = req.params;

    const card = await Card.findById(id);
    if (!card) {
        return res.status(404).json({ success: false, message: 'Card not found' });
    }

    if (card.customerId.toString() !== req.user.customerId) {
        return res.status(403).json({ success: false, message: 'You do not have permission to block this card' });
    }

    if (card.status === 'blocked') {
        return res.status(400).json({ success: false, message: 'Card is already blocked' });
    }

    card.status = 'blocked';
    await card.save();

    await logAction(req.user.userId, 'BLOCK_CARD', { cardId: card._id }, req.ip);

    res.status(200).json({ success: true, message: 'Card blocked successfully', data: card });
});