import Customer from "../models/customer.model.js";
import User from "../models/user.model.js";
import catchAsync from "../utils/catchAsync.js";
import bcrypt from 'bcryptjs';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/jwt.js";


export const register = catchAsync(async (req, res) => {
    const { name, email, password, phone, dateOfBirth, address, nationalId } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
        return res.status(400).json({
            success: false,
            message: 'This user or email is already registered',
        });
    }

    const newUser = await User.create({
        name,
        email,
        passwordHash: password,
        phone,
        role: 'customer',
    });

    const newCustomer = await Customer.create({
        userId: newUser._id,
        dateOfBirth,
        address,
        nationalId,
    });

    const accessToken = signAccessToken({
        userId: newUser._id,
        role: newUser.role,
        customerId: newCustomer._id,
    });

    const refreshToken = signRefreshToken({
        userId: newUser._id,
    });

    newUser.refreshTokenHash = await bcrypt.hash(refreshToken, 12);
    await newUser.save();

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

    const isValid = user.refreshTokenHash && (await bcrypt.compare(refreshToken, user.refreshTokenHash));
    if (!isValid) {
        return res.status(401).json({
            success: false,
            message: 'Invalid refresh token',
        });
    }

    const customer = await Customer.findOne({ userId: user._id });

    const newAccessToken = signAccessToken({
        userId: user._id,
        role: user.role,
        ...(customer && { customerId: customer._id }),
    });

    res.status(200).json({
        success: true,
        data: { accessToken: newAccessToken },
    });
});

export const logout = catchAsync(async (req, res) => {
    const user = await User.findById(req.user.userId);
    if (user) {
        user.refreshTokenHash = undefined;
        await user.save();
    }

    res.status(200).json({
        success: true,
        message: 'Logged out successfully',
    });
});