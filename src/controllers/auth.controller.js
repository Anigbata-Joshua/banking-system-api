import mongoose from "mongoose";
import Customer from "../models/customer.model.js";
import User from "../models/user.model.js";
import catchAsync from "../utils/catchAsync.js";
import bcrypt from 'bcryptjs';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/jwt.js";
import { logAction } from "../services/auditLog.service.js";


export const register = catchAsync(async (req, res) => {
    const { name, email, password, phone, dateOfBirth, address, nationalId } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
        return res.status(400).json({
            success: false,
            message: 'This user or email is already registered',
        });
    }

    const session = await mongoose.startSession();
    let newUser;
    let newCustomer;
    let refreshToken;

    try {
        session.startTransaction();

        const createdUsers = await User.create([{
            name, email, passwordHash: password, phone, role: 'customer'
        }],
            { session }
        );
        newUser = createdUsers[0];

        const createdCustomers = await Customer.create(
            [{ userId: newUser._id, dateOfBirth, address, nationalId }],
            { session }
        );
        newCustomer = createdCustomers[0];

        refreshToken = signRefreshToken({ userId: newUser._id });
        newUser.refreshTokenHash = await bcrypt.hash(refreshToken, 12);
        await newUser.save({ session });

        await session.commitTransaction();
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }

    const accessToken = signAccessToken({
        userId: newUser._id,
        role: newUser.role,
        customerId: newCustomer._id,
    });

    await logAction(newUser._id, 'REGISTER_SUCCESS', { email: newUser.email, role: newUser.role }, req.ip);

    res.status(201).json({
        success: true,
        data: {
            user: {
                id: newUser._id,
                name: newUser.name,
                email: newUser.email,
                role: newUser.role,
            },
            accessToken,
            refreshToken,
        },
    });
});

export const login = catchAsync(async (req, res) => {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
        return res.status(400).json({
            success: false,
            message: 'Invalid email or password',
        });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
        return res.status(400).json({
            success: false,
            message: 'Invalid email or password',
        });
    }

    const customer = await Customer.findOne({ userId: user._id });

    const accessToken = signAccessToken({
        userId: user._id,
        role: user.role,
        ...(customer && { customerId: customer._id }),
    });

    const refreshToken = signRefreshToken({
        userId: user._id,
    });

    user.refreshTokenHash = await bcrypt.hash(refreshToken, 12);
    await user.save();

    await logAction(user._id, 'LOGIN_SUCCESS', { email: user.email, role: user.role }, req.ip);

    res.status(200).json({
        success: true,
        message: 'Login successful',
        data: {
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
            accessToken,
            refreshToken,
        },
    });
});

export const refresh = catchAsync(async (req, res) => {
    const { refreshToken } = req.body;
    const decoded = verifyRefreshToken(refreshToken);

    const user = await User.findById(decoded.userId);

    if (!user) {
        return res.status(401).json({
            success: false,
            message: 'Invalid refresh token',
        });
    }

    const isValid = user.refreshTokenHash && (await bcrypt.compare(refreshToken, user.refreshTokenHash));
    if (!isValid) {
        return res.status(401).json({
            success: false,
            message: 'Invalid refresh token',
        });
    }

    const customer = await Customer.findOne({ userId: user._id });

    const accessToken = signAccessToken({
        userId: user._id,
        role: user.role,
        ...(customer && { customerId: customer._id }),
    });

    await logAction(user._id, 'TOKEN_REFRESH', { email: user.email }, req.ip);

    res.status(200).json({
        success: true,
        data: {
            accessToken,
        },
    });
});

export const logout = catchAsync(async (req, res) => {
    const user = await User.findById(req.user.userId);
    if (user) {
        user.refreshTokenHash = undefined;
        await user.save();
    }

    await logAction(req.user.userId, 'LOGOUT_SUCCESS', {}, req.ip);

    res.status(200).json({
        success: true,
        message: 'Logged out successfully',
    });
});