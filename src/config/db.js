import mongoose from "mongoose";
import { env } from "./env.js";


// Establish global event listeners once when the module loads
mongoose.set('strictQuery', true);

mongoose.connection.on('connected', () => {
    console.log("✅ Connected to the Banking System database successfully");
});

mongoose.connection.on('error', (error) => {
    console.error("❌ Banking System database error:", error.message);
});

mongoose.connection.on('disconnected', () => {
    console.warn("⚠️ Disconnected from Banking System database. Attempting to reconnect...");
});

// Clear, targeted database orchestration methods
export async function connectDatabase() {
    const options = {
        autoIndex: !env.isProduction,
        maxPoolSize: 50,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000
    };

    try {
        await mongoose.connect(env.mongoUri, options);
    } catch (error) {
        console.error('❌ Critical: Initial connection failed ->', error.message);
        process.exit(1);
    }
}

export async function closeDatabase() {
    try {
        await mongoose.connection.close();
        console.log('✅ MongoDB connection closed safely');
    } catch (error) {
        console.error('❌ Error during MongoDB shutdown:', error.message);
    }
}