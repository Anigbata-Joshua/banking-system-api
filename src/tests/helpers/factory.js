import mongoose from 'mongoose';
import User from '../../models/user.model.js';
import Customer from '../../models/customer.model.js';
import Account from '../../models/account.model.js';
import { signAccessToken } from '../../utils/jwt.js';

function uniqueSuffix() {
    return new mongoose.Types.ObjectId().toString();
}

export async function createCustomerWithAccount({
    balance = '1000.00',
    overdraftLimit = '0.00',
    accountType = 'savings',
} = {}) {
    const user = await User.create({
        name: 'Test Customer',
        email: `customer-${uniqueSuffix()}@example.com`,
        passwordHash: 'Password123!',
        role: 'customer',
    });

    const customer = await Customer.create({
        userId: user._id,
        dateOfBirth: new Date('1990-01-01'),
        address: {
            street: '1 Test Street',
            city: 'Abuja',
            state: 'FCT',
            zipCode: '900001',
            country: 'Nigeria',
        },
        nationalId: `NID-${uniqueSuffix()}`,
    });

    const account = await Account.create({
        accountNumber: String(Math.floor(1000000000 + Math.random() * 9000000000)),
        customerId: customer._id,
        type: accountType,
        balance,
        overdraftLimit,
    });

    const token = signAccessToken({
        userId: user._id.toString(),
        role: user.role,
        customerId: customer._id.toString(),
    });

    return { user, customer, account, token };
}

export async function createStaffToken(role = 'manager') {
    const user = await User.create({
        name: 'Test Staff',
        email: `staff-${uniqueSuffix()}@example.com`,
        passwordHash: 'Password123!',
        role,
    });

    const token = signAccessToken({
        userId: user._id.toString(),
        role,
    });

    return { user, token };
}
