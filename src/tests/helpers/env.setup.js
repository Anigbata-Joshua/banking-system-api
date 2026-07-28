// Runs before any test file's imports. src/config/env.js throws at import
// time if these are missing, and app.js imports env.js, so they must exist
// before app.js (or anything that imports it) is ever imported by a test.
//
// MONGODB_URI is never actually connected to — each test file connects
// mongoose to its own MongoMemoryReplSet instance instead (see helpers/db.js).
// This value only exists to satisfy env.js's required() check.
process.env.NODE_ENV ??= 'test';
process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017/unused-placeholder';
process.env.JWT_ACCESS_SECRET ??= 'test-only-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET ??= 'test-only-refresh-secret-do-not-use-in-prod';
process.env.JWT_ACCESS_EXPIRATION ??= '15m';
process.env.JWT_REFRESH_EXPIRATION ??= '7d';
process.env.RATE_LIMIT_WINDOW_MS ??= '900000';
process.env.RATE_LIMIT_MAX ??= '1000'; // generous ceiling so functional tests don't trip the limiter
