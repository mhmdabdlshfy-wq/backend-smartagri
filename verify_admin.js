const mongoose = require('mongoose');
const User = require('./models/User');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const verifyAdmin = async () => {
    try {
        console.log('🔄 Connecting to verify Admin User...');
        // Force IPv4 loopback
        await mongoose.connect('mongodb://127.0.0.1:27017/smart-agri');
        console.log('✅ DB Connected.');

        const admin = await User.findOne({ username: 'admin' });

        if (!admin) {
            console.log('❌ Admin user NOT FOUND! Creating one now...');
            await User.create({
                username: 'admin',
                password: '1234',
                role: 'admin'
            });
            console.log('✅ Admin created: admin / 1234');
        } else {
            console.log('✅ Admin user FOUND.');
            console.log('   Hash:', admin.password);

            // Check password manually
            const isMatch = await admin.matchPassword('1234');
            if (isMatch) {
                console.log('✅ Password check: 1234 matches the stored hash!');
                console.log('🔑 CREDENTIALS ARE VALID:');
                console.log('   User: admin');
                console.log('   Pass: 1234');
            } else {
                console.log('❌ Password check FAILED. The stored hash is incorrect.');
                console.log('🛠 Fixing it now...');

                // Direct update with new hash handled by pre-save? No, better delete and recreate to be safe
                await User.deleteOne({ _id: admin._id });
                await User.create({
                    username: 'admin',
                    password: '1234',
                    role: 'admin'
                });
                console.log('✅ Admin RECREATED with correct password: admin / 1234');
            }
        }
        process.exit(0);
    } catch (err) {
        console.error('❌ Verification Error:', err);
        process.exit(1);
    }
};

verifyAdmin();
