const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

const fixLogin = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/smart-agri');
        console.log('✅ Connected to MongoDB');

        // Delete existing admin
        const result = await User.deleteOne({ username: 'admin' });
        if (result.deletedCount > 0) {
            console.log('🗑️ Deleted potentially corrupted Admin user.');
        }

        // Create new admin CORRECTLY (relying on pre-save hook)
        // Or manually hashing but bypassing hook? No, easiest is passing raw password
        // The model hook: "await bcrypt.hash(this.password, salt)" will run.
        // So we pass '1234' raw.

        await User.create({
            username: 'admin',
            password: '1234', // Raw password, pre-save hook will hash it ONCE
            role: 'admin'
        });

        console.log('✅ New Admin Created Successfully!');
        console.log('🔑 Try logging in with:');
        console.log('   Username: admin');
        console.log('   Password: 1234');

        process.exit(0);
    } catch (err) {
        console.error('❌ Error fixing login:', err);
        process.exit(1);
    }
};

fixLogin();
