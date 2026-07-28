import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

let replSet;

// A replica set (not a standalone instance) is required because
// ledger.service.js uses mongoose sessions with multi-document transactions,
// which standalone MongoDB does not support.
export async function startTestDb() {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const uri = replSet.getUri();
    await mongoose.connect(uri);
}

export async function stopTestDb() {
    await mongoose.disconnect();
    if (replSet) {
        await replSet.stop();
    }
}

export async function clearTestDb() {
    const { collections } = mongoose.connection;
    await Promise.all(
        Object.values(collections).map((collection) => collection.deleteMany({}))
    );
}
