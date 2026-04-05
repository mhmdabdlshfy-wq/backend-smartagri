const mongoose = require('mongoose');
const SensorData = require('./models/SensorData');
const User = require('./models/User');
const Alert = require('./models/Alert');
require('dotenv').config();

const RANGES = {
    temperature: { min: 10, max: 50, criticalHigh: 40 },
    humidity: { min: 10, max: 90, criticalLow: 20 },
    ph: { min: 4, max: 9, criticalLow: 5, criticalHigh: 8 }
};

const generateSmoothValue = (current, min, max, maxChange) => {
    let change = (Math.random() * maxChange * 2) - maxChange;
    let newValue = current + change;
    if (newValue < min) newValue = min + Math.abs(change);
    if (newValue > max) newValue = max - Math.abs(change);
    return parseFloat(newValue.toFixed(1));
};

const seedDatabase = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/smart-agri');
        console.log('✅ Connected to MongoDB');

        const count = await SensorData.countDocuments();
        if (count > 0) {
            console.log(`ℹ️ Database already has ${count} records.`);
        } else {
            console.log('🌱 Seeding 24h of data...');

            let current = { temperature: 25.0, humidity: 60.0, ph: 7.0 };
            const now = new Date();
            const bulkOps = [];
            const totalPoints = 288; // 24h * 12 (5-min intervals)

            for (let i = 0; i <= totalPoints; i++) {
                const time = new Date(now.getTime() - (totalPoints - i) * 300000);

                current.temperature = generateSmoothValue(current.temperature, RANGES.temperature.min, RANGES.temperature.max, 2.0);
                current.humidity = generateSmoothValue(current.humidity, RANGES.humidity.min, RANGES.humidity.max, 5.0);
                current.ph = generateSmoothValue(current.ph, RANGES.ph.min, RANGES.ph.max, 0.3);

                bulkOps.push({
                    insertOne: {
                        document: {
                            temperature: current.temperature,
                            humidity: current.humidity,
                            ph: current.ph,
                            createdAt: time
                        }
                    }
                });
            }
            await SensorData.bulkWrite(bulkOps);
            console.log('✅ Successfully seeded 288 records!');
        }

        // Check if Admin exists
        const admin = await User.findOne({ username: 'admin' });
        if (!admin) {
            const bcrypt = require('bcryptjs');
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash('1234', salt);
            await User.create({ username: 'admin', password: hashedPassword, role: 'admin' });
            console.log('✅ Default Admin created (admin/1234)');
        } else {
            console.log('ℹ️ Admin user already exists.');
        }

        console.log('🎉 Verification Complete! Open MongoDB Compass and look for "smart-agri".');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
};

seedDatabase();
