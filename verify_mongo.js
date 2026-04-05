const mongoose = require('mongoose');
const SensorData = require('./models/SensorData');
const User = require('./models/User');
require('dotenv').config();

const verifyConnection = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/smart-agri');
        console.log('✅ Connection Successful: MongoDB Connected!');

        const sensorCount = await SensorData.countDocuments();
        console.log(`📊 Sensor Data Count: ${sensorCount} records`);

        const userCount = await User.countDocuments();
        console.log(`👤 Users Count: ${userCount} users`);

        if (sensorCount > 0) {
            const latest = await SensorData.findOne().sort({ createdAt: -1 });
            console.log('🕒 Latest Reading:', latest.createdAt, `Temp: ${latest.temperature}°C`);
        } else {
            console.log('⚠️ No sensor data found yet. (Wait for simulation to seed)');
        }

        process.exit(0);
    } catch (err) {
        console.error('❌ Connection Failed:', err.message);
        process.exit(1);
    }
};

verifyConnection();
