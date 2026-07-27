import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import  authRoutes from './routes/auth.routes.js';
import accountRoutes from './routes/account.routes.js';
import beneficiaryRoutes from './routes/beneficiary.routes.js';
import cardRoutes from './routes/card.routes.js';
import loanRoutes from './routes/loan.routes.js';




const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

const globalLimiter = rateLimit({
    windowMs: env.rateLimit,
    max: env.rateLimitMax,
    handler: (req, res, next, options) => {
        res.status(options.statusCode).json({
            success: false,
            message: options.message || 'Too many requests, please try again later',
        });
    },
});

//Routes
app.use('/api', globalLimiter);
app.use('/api/accounts', accountRoutes);
app.use('/api/beneficiaries', beneficiaryRoutes);
app.use('/api/cards', cardRoutes);
app.use('/api/loans', loanRoutes);

// Not yet mounted — waiting on auth.routes.js
const authLimiter = rateLimit({
    windowMs: 900000,
    max: 20,
    handler: (req, res, next, options) => {
        res.status(options.statusCode).json({
            success: false,
            message: 'Too many authentication attempts, please try again later',
        });
    },
});

// Routes
app.use('/api/auth', authRoutes);

app.use(errorHandler);

export default app;