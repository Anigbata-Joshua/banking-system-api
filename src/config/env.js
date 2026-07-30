import 'dotenv/config';

const required = (key, fallback = undefined) => {
    const value = process.env[key] ?? fallback;

    if (value === undefined) {
        throw new Error(`Missing required environment variable: ${key}`)
    } return value;
};

export const env = {
    //Server
    nodeEnv: process.env.NODE_ENV || "development",
    isProduction: process.env.NODE_ENV === "production",
    port: parseInt(process.env.PORT || "6000", 10),

    //Uploads
    uploadPath: process.env.UPLOAD_PATH || 'uploads/',
    //Database
    mongoUri: required("MONGODB_URI"),

    // Frontend & CORS
    frontendURI: process.env.FRONTEND_URI || 'http://localhost:5173',
    corsOrigins: (process.env.CORS_ORIGIN || "").split(",").map((O) => O.trim()).filter(Boolean),

    //JWT
    jwtAccessSecret: required("JWT_ACCESS_SECRET"),
    jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRATION || "45m",

    jwtRefreshSecret: required("JWT_REFRESH_SECRET"),
    jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRATION || "7d",

    rateLimit: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
}