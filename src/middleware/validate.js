import { z, ZodError } from 'zod';

export const validate = (schema) => (req, res, next) => {
    try {
        const parsed = schema.parse({
            body: req.body,
            query: req.query,
            params: req.params,
        });
        if (parsed.body) req.body = parsed.body;
        if (parsed.query) {
            for (const key of Object.keys(req.query)) {
                delete req.query[key];
            }
            Object.assign(req.query, parsed.query);
        }
        if (parsed.params) {
            for (const key of Object.keys(req.params)) {
                delete req.params[key];
            }
            Object.assign(req.params, parsed.params);
        }
    } catch (error) {
        if (error instanceof ZodError || error.name === 'ZodError') {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: (error.errors || error.issues || []).map(err => ({
                    field: err.path.slice(1).join('.'), // slice off 'body'/'query'/'params'
                    message: err.message,
                })),
            });
        }
        return next(error);
    }
    next();
};

const amountSchema = z.union([z.string(), z.number()])
    .transform((val) => val.toString())
    .refine((val) => {
        const num = parseFloat(val);
        return !isNaN(num) && num > 0;
    }, { message: 'Amount must be a positive number' })
    .refine((val) => {
        const parts = val.split('.');
        return parts.length < 2 || parts[1].length <= 2;
    }, { message: 'Amount cannot have more than 2 decimal places' });

const rateSchema = z.union([z.string(), z.number()])
    .transform((val) => val.toString())
    .refine((val) => {
        const num = parseFloat(val);
        return !isNaN(num) && num >= 0 && num <= 1.0;
    }, { message: 'Interest rate must be between 0.0 and 1.0' });

const termMonthsSchema = z.union([z.string(), z.number()])
    .transform((val) => {
        const num = typeof val === 'string' ? parseInt(val, 10) : val;
        return num;
    })
    .refine((val) => !isNaN(val) && Number.isInteger(val) && val >= 1, {
        message: 'Term months must be a positive integer >= 1'
    });

export const registerSchema = z.object({
    body: z.object({
        name: z.string().min(1, 'Name is required').trim(),
        email: z.string().email('Invalid email address').toLowerCase().trim(),
        password: z.string().min(6, 'Password must be at least 6 characters long'),
        phone: z.string().optional(),
        // These three are required (not optional) and address must be the nested
        // object shape, matching what the Customer model actually requires.
        dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be YYYY-MM-DD'),
        address: z.object({
            street: z.string().min(1, 'Street is required'),
            city: z.string().min(1, 'City is required'),
            state: z.string().min(1, 'State is required'),
            zipCode: z.string().min(1, 'Zip code is required'),
            country: z.string().min(1, 'Country is required'),
        }),
        nationalId: z.string().min(1, 'National ID is required'),
    }),
});

export const loginSchema = z.object({
    body: z.object({
        email: z.string().email('Invalid email address').toLowerCase().trim(),
        password: z.string().min(1, 'Password is required'),
    }),
});

export const createStaffSchema = z.object({
    body: z.object({
        name: z.string().min(1, 'Name is required').trim(),
        email: z.string().email('Invalid email address').toLowerCase().trim(),
        password: z.string().min(6, 'Password must be at least 6 characters long'),
        phone: z.string().optional(),
        role: z.enum(['teller', 'manager']),
    }),
});

export const openAccountSchema = z.object({
    body: z.object({
        type: z.enum(['savings', 'current']),
        overdraftLimit: z.union([z.string(), z.number()])
            .optional()
            .transform((val) => val === undefined ? '0.00' : val.toString())
            .refine((val) => {
                const num = parseFloat(val);
                return !isNaN(num) && num >= 0;
            }, { message: 'Overdraft limit must be a non-negative number' })
            .refine((val) => {
                const parts = val.split('.');
                return parts.length < 2 || parts[1].length <= 2;
            }, { message: 'Overdraft limit cannot have more than 2 decimal places' }),
    }),
});

export const depositWithdrawSchema = z.object({
    body: z.object({
        amount: amountSchema,
        description: z.string().optional(),
    }),
});

export const transferSchema = z.object({
    body: z.object({
        toAccountNumber: z.string().regex(/^\d{10}$/, 'Destination account number must be 10 digits'),
        amount: amountSchema,
        note: z.string().optional(),
    }),
});

export const applyLoanSchema = z.object({
    body: z.object({
        principal: amountSchema,
        interestRate: rateSchema,
        termMonths: termMonthsSchema,
        disbursementAccountNumber: z.string().regex(/^\d{10}$/, 'Disbursement account number must be 10 digits'),
    }),
});

export const repayLoanSchema = z.object({
    body: z.object({
        amount: amountSchema,
    }),
});

export const addBeneficiarySchema = z.object({
    body: z.object({
        beneficiaryAccountNumber: z.string().regex(/^\d{10}$/, 'Beneficiary account number must be 10 digits'),
        beneficiaryName: z.string().min(1, 'Beneficiary name is required').trim(),
        nickname: z.string().optional(),
    }),
});

export const issueCardSchema = z.object({
    body: z.object({
        accountId: z.string().min(1, 'Account ID is required'),
        cardType: z.enum(['debit', 'credit'], {
            errorMap: () => ({ message: "Card type must be 'debit' or 'credit'" }),
        }),
        pin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits'), // Card PINs are exactly 4 digits

    }),
});