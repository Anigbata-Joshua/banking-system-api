import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        setupFiles: ['./src/tests/helpers/env.setup.js'],
        testTimeout: 60000,
        hookTimeout: 300000,
        // Each test file boots its own MongoMemoryReplSet (needed for
        // multi-document transactions in ledger.service.js). Running them
        // in parallel multiplies memory/CPU usage and binary-download
        // contention, so keep them sequential for stability.
        fileParallelism: false,
    },
});
