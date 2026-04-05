const mongoose = require('mongoose');
const dotenv = require('dotenv');
const SensorData = require('./models/SensorData');

dotenv.config();

const seedBackend = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected for Seeding...');

        // Clear existing data to ensure clean slate
        await SensorData.deleteMany({});
        console.log('Cleared existing sensor data.');

        const seedData = [];
        const now = new Date();
        const oneYearAgo = new Date(now);
        oneYearAgo.setFullYear(now.getFullYear() - 1);

        // 1. Generate Daily Data for the past year (365 points)
        // Mid-range resolution for the whole year
        for (let d = new Date(oneYearAgo); d < now; d.setDate(d.getDate() + 1)) {
            // Seasonal Temp: Summer (Jun-Aug) hotter, Winter (Dec-Feb) colder
            const month = d.getMonth();
            const seasonalBase = (month >= 4 && month <= 8) ? 28 : 15; // Summer vs Winter base

            // Random variation + Daily Cycle (simulated as average)
            const temp = seasonalBase + (Math.random() * 8 - 4);
            const humidity = 80 - (temp * 1.5) + (Math.random() * 15 - 7.5);

            seedData.push({
                temperature: parseFloat(temp.toFixed(1)),
                humidity: parseFloat(Math.max(0, Math.min(100, humidity)).toFixed(1)),
                ph: parseFloat((6.5 + (Math.random() * 0.8 - 0.4)).toFixed(1)),
                soilMoisture: parseFloat((60 + (Math.random() * 30 - 15)).toFixed(1)),
                cropType: 'Tomato',
                createdAt: new Date(d)
            });
        }

        // 2. Generate Hourly Data for the last 30 days (720 points)
        // High resolution for recent history
        const oneMonthAgo = new Date(now);
        oneMonthAgo.setMonth(now.getMonth() - 1);

        for (let h = new Date(oneMonthAgo); h < now; h.setHours(h.getHours() + 1)) {
            // Daily Cycle: Hotter at 2 PM (14:00), cooler at 2 AM
            const hour = h.getHours();
            const isDay = hour >= 6 && hour <= 18;
            const dailyVar = isDay ? 4 : -4;

            // Smooth curve using sine wave for temp
            const timeOfDay = (hour / 24) * Math.PI * 2;
            const dailyCycle = Math.sin(timeOfDay - Math.PI / 2) * 5; // Peak at noon-ish

            const temp = 22 + dailyCycle + (Math.random() * 1);
            const humidity = 60 - dailyCycle + (Math.random() * 3);

            // Rain Simulation: Every ~5 days moisture spikes
            let moisture = 50 + Math.cos(h.getTime() / (5 * 24 * 3600 * 1000) * 2 * Math.PI) * 20;
            moisture += (Math.random() * 5); // noise

            seedData.push({
                temperature: parseFloat(temp.toFixed(1)),
                humidity: parseFloat(Math.max(0, Math.min(100, humidity)).toFixed(1)),
                ph: 6.5 + (Math.random() * 0.2 - 0.1),
                soilMoisture: parseFloat(Math.max(0, Math.min(100, moisture)).toFixed(1)),
                cropType: 'Tomato',
                createdAt: new Date(h)
            });
        }

        console.log(`Inserting ${seedData.length} records...`);
        await SensorData.insertMany(seedData);
        console.log('✅ Database populated with realistic historical data.');

        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

seedBackend();
