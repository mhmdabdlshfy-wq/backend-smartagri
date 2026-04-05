const express = require('express');
const router = express.Router();
const SensorData = require('../models/SensorData');

// Get stats
router.get('/stats', async (req, res) => {
    try {
        const today = new Date();
        today.setHours(today.getHours() - 24);

        const recentData = await SensorData.find({ createdAt: { $gte: today } });

        if (recentData.length === 0) return res.json({ avgTemp: 0, maxHumid: 0, minPh: 0, count: 0 });

        const avgTemp = recentData.reduce((acc, curr) => acc + curr.temperature, 0) / recentData.length;
        const maxHumid = Math.max(...recentData.map(d => d.humidity));
        const minPh = Math.min(...recentData.map(d => d.ph));

        res.json({
            avgTemp: parseFloat(avgTemp.toFixed(1)),
            maxHumid,
            minPh,
            count: recentData.length
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;
