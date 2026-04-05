const mongoose = require('mongoose');
const User = require('./models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const debugRegister = async () => {
    try {
        console.log('🔄 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/smart-agri');
        console.log('✅ Connected.');

        const username = 'testuser_' + Date.now();
        const password = 'testpassword';
        const role = 'user';

        console.log('📝 Testing User Creation...');
        console.log(`   Username: ${username}`);
        console.log('   Password:', password);

        // Check Env
        console.log('🔍 Checking Environment:');
        console.log('   JWT_SECRET:', process.env.JWT_SECRET ? '✅ Present' : '❌ MISSING (Critical!)');

        if (!process.env.JWT_SECRET) {
            console.error('❌ Cannot generate token without JWT_SECRET!');
            process.exit(1);
        }

        // Create User
        console.log('🛠 Creating User...');
        const user = await User.create({ username, password, role });

        console.log('✅ User created with ID:', user._id);
        console.log('   Hashed Password:', user.password);

        // Generate Token
        console.log('🔑 Generating Token...');
        const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
        console.log('✅ Token generated successfully!');

        // Cleanup
        await User.deleteOne({ _id: user._id });
        console.log('🧹 Cleaned up test user.');

        console.log('🎉 REGISTRATION LOGIC IS WORKING FINE!');
        process.exit(0);

    } catch (err) {
        console.error('❌ REGISTRATION FAILED:', err);
        if (err.name === 'ValidationError') {
            console.error('Validation Error Details:', JSON.stringify(err.errors, null, 2));
        }
        process.exit(1);
    }
};

debugRegister();
