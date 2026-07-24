import { env } from './config/env.js';
import app from './app.js';
import { closeDatabase, connectDatabase } from './config/db.js';

// ---- Process Error Handlers -----
process.on('uncaughtException', (error) => {
    console.error('❌ UNCAUGHT EXCEPTION! shutting down.. ', error.name, error.message);
    console.error(error.stack)
    process.exit(1);
});

process.on('unhandledRejection', (error) => {
    console.error('❌ UNHANDLED REJECTION! shutting down.. ', error.name, error.message);
    gracefulShutdown("unhandledRejection");
});

//---- Start Server ----
let server;

(async () => {
    try {
        await connectDatabase();
        server = app.listen(env.port, () => {
            console.log(`✅ Banking System Database running on port ${env.port} [${env.nodeEnv}]`)
        });
    } catch (error) {
        console.error('❌ failed to connect :', error.message);
        process.exit(1);
    }
})();

async function gracefulShutdown(signal) {
    console.log(`\n Signal: ${signal}. Cleaning up....`)
    try {
        if (server) {
            await new Promise((resolve) => server.close(resolve));
            console.log('HTTP server closed')
        }
        await closeDatabase();
        console.log('Database connection closed successfully');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during shutdown:', error.message);
        process.exit(1);
    }
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'))
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))