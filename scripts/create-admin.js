// One-off bootstrap script: promotes an existing user to `admin`.
//
// Why this exists: /api/auth/staff (which creates managers/tellers) requires
// an existing admin token, and /api/auth/register always forces role
// 'customer'. Something has to create the very first admin, and this script
// is that "something" — run it once against your target database, then
// delete it (or just leave it here gitignored; it's harmless as long as
// nobody can run it without shell/DB access, since it does not go through
// the HTTP API or any auth check at all).
//
// Usage:
//   node scripts/create-admin.js alice@test.com
//
import { connectDatabase, closeDatabase } from '../src/config/db.js';
import User from '../src/models/user.model.js';

const email = process.argv[2];

if (!email) {
    console.error('Usage: node scripts/create-admin.js <email>');
    process.exit(1);
}

(async () => {
    await connectDatabase();

    const user = await User.findOne({ email });

    if (!user) {
        console.error(`No user found with email: ${email}`);
        await closeDatabase();
        process.exit(1);
    }

    user.role = 'admin';
    await user.save();

    console.log(`✅ ${email} is now an admin (userId: ${user._id}).`);
    console.log('They must log in again to get a token with the new role.');

    await closeDatabase();
    process.exit(0);
})();
