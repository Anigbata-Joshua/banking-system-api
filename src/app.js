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
import auditLogRoutes from './routes/auditLog.routes.js';
import reportRoutes from './routes/report.routes.js';
import customerRoutes from './routes/customer.routes.js';




const app = express();

app.use(helmet());
app.use(cors({
    origin: env.corsOrigins && env.corsOrigins.length > 0 ? env.corsOrigins : env.frontendURI,
    credentials: true,
}));
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
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/customers', customerRoutes);

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
app.use('/api/auth', authLimiter, authRoutes);

app.use(errorHandler);

export default app;