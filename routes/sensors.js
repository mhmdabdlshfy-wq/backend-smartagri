const express = require('express');
const router = express.Router();
const SensorData = require('../models/SensorData');
const Alert = require('../models/Alert');
const CROPS = require('../config/crops');
const { setActiveCrop } = require('../utils/simulator');
const {
    calculateHealthScore,
    predictMetric,
    calculateRisks,
    detectAnomalies,
    calculateIrrigation,
    calculateInsights
} = require('../utils/intelligence');

// ──────────────────────────────────────────────
// GET /current - Latest sensor reading
// ──────────────────────────────────────────────
router.get('/current', async (req, res) => {
    try {
        const latest = await SensorData.findOne().sort({ createdAt: -1 });
        res.json(latest);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// ──────────────────────────────────────────────
// GET /history - Historical data with aggregation
// ──────────────────────────────────────────────
router.get('/history', async (req, res) => {
    const { range } = req.query;
    let startDate = new Date();
    let interval = 0;

    switch (range) {
        case '1y':
            startDate.setFullYear(startDate.getFullYear() - 1);
            interval = 24 * 60;
            break;
        case '6m':
            startDate.setMonth(startDate.getMonth() - 6);
            interval = 12 * 60;
            break;
        case '1m':
            startDate.setMonth(startDate.getMonth() - 1);
            interval = 6 * 60;
            break;
        case '7d':
            startDate.setDate(startDate.getDate() - 7);
            interval = 60;
            break;
        default:
            startDate.setHours(startDate.getHours() - 24);
            interval = 15;
            break;
    }

    try {
        if (interval > 0) {
            const data = await SensorData.aggregate([
                { $match: { createdAt: { $gte: startDate } } },
                {
                    $group: {
                        _id: {
                            $toDate: {
                                $subtract: [
                                    { $toLong: "$createdAt" },
                                    { $mod: [{ $toLong: "$createdAt" }, interval * 60 * 1000] }
                                ]
                            }
                        },
                        temperature: { $avg: "$temperature" },
                        humidity: { $avg: "$humidity" },
                        ph: { $avg: "$ph" },
                        soilMoisture: { $avg: "$soilMoisture" },
                        createdAt: { $first: "$createdAt" }
                    }
                },
                { $sort: { _id: 1 } }
            ]);
            const formatted = data.map(d => ({
                temperature: parseFloat(d.temperature.toFixed(1)),
                humidity: parseFloat(d.humidity.toFixed(1)),
                ph: parseFloat(d.ph.toFixed(1)),
                soilMoisture: parseFloat(d.soilMoisture.toFixed(1)),
                createdAt: d._id
            }));
            res.json(formatted);
        } else {
            const history = await SensorData.find({
                createdAt: { $gte: startDate }
            }).sort({ createdAt: 1 });
            res.json(history);
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// ──────────────────────────────────────────────
// GET /alerts - Recent alerts (filtered by crop if specified)
// ──────────────────────────────────────────────
router.get('/alerts', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const { crop } = req.query;

        // Build filter: if crop is specified, only show alerts for that crop
        const filter = {};
        if (crop) {
            filter.cropType = crop;
        }

        const alerts = await Alert.find(filter).sort({ createdAt: -1 }).limit(limit);
        res.json(alerts);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// ──────────────────────────────────────────────
// POST /crop - Set active crop
// ──────────────────────────────────────────────
router.post('/crop', (req, res) => {
    const { crop } = req.body;
    if (!crop || !CROPS[crop]) {
        return res.status(400).json({ message: 'Invalid Crop Type' });
    }
    setActiveCrop(crop);
    res.json({ message: `Crop updated to ${crop}`, crop: CROPS[crop] });
});

// ──────────────────────────────────────────────
// GET /crops - List all crops with config
// ──────────────────────────────────────────────
router.get('/crops', (req, res) => {
    res.json(CROPS);
});

// ──────────────────────────────────────────────
// GET /health - Crop Health Score
// Uses the intelligence engine for math-based scoring
// ──────────────────────────────────────────────
router.get('/health', async (req, res) => {
    const { crop } = req.query;
    try {
        const latest = await SensorData.findOne().sort({ createdAt: -1 });
        if (!latest) return res.json({ overall: 0, category: 'No Data' });

        const healthData = calculateHealthScore(latest, crop || 'Tomato');
        res.json(healthData);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Health calculation error' });
    }
});

// ──────────────────────────────────────────────
// GET /predict - Predictive Analytics
// Linear regression + moving average on all metrics
// ──────────────────────────────────────────────
router.get('/predict', async (req, res) => {
    try {
        const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000);
        const data = await SensorData.find({ createdAt: { $gte: thirtyMinsAgo } })
            .sort({ createdAt: 1 });

        if (data.length < 5) {
            return res.json({ message: 'Not enough data for prediction', predictions: {} });
        }

        const lastTime = data[data.length - 1].createdAt;
        const intervalMs = data.length > 1
            ? (data[data.length - 1].createdAt - data[0].createdAt) / (data.length - 1)
            : 5000;

        const metrics = ['temperature', 'humidity', 'soilMoisture'];
        const predictions = {};

        for (const metric of metrics) {
            const values = data.map(d => d[metric]);
            predictions[metric] = predictMetric(values, 6, intervalMs, lastTime);
        }

        res.json({ predictions, dataPoints: data.length });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Prediction Error' });
    }
});

// ──────────────────────────────────────────────
// GET /risks - Risk Assessment
// Disease, heat, water stress probabilities
// ──────────────────────────────────────────────
router.get('/risks', async (req, res) => {
    const { crop } = req.query;
    try {
        const latest = await SensorData.findOne().sort({ createdAt: -1 });
        if (!latest) return res.json({ disease: 0, heat: 0, water: 0, overall: 'No Data' });

        const risks = calculateRisks(latest, crop || 'Tomato');
        res.json(risks);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Risk calculation error' });
    }
});

// ──────────────────────────────────────────────
// GET /anomalies - Anomaly Detection
// Detects spikes, drops, sensor malfunctions
// ──────────────────────────────────────────────
router.get('/anomalies', async (req, res) => {
    try {
        const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
        const recentData = await SensorData.find({ createdAt: { $gte: fiveMinsAgo } })
            .sort({ createdAt: 1 });

        const anomalies = detectAnomalies(recentData);
        res.json({ anomalies, dataPoints: recentData.length });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Anomaly detection error' });
    }
});

// ──────────────────────────────────────────────
// GET /irrigation - Intelligent Irrigation Recommendation
// ──────────────────────────────────────────────
router.get('/irrigation', async (req, res) => {
    const { crop } = req.query;

    if (!crop || !CROPS[crop]) {
        return res.json({
            recommendation: 'Select a crop first.',
            duration: 0, urgency: 'None', efficiency: 0, action: 'None'
        });
    }

    try {
        const latest = await SensorData.findOne().sort({ createdAt: -1 });
        if (!latest) return res.json({ recommendation: 'No data available.' });

        // Get recent history for trend analysis
        const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000);
        const recentHistory = await SensorData.find({ createdAt: { $gte: tenMinsAgo } })
            .sort({ createdAt: 1 });

        const result = calculateIrrigation(latest, crop, recentHistory);
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Irrigation calculation error' });
    }
});

// ──────────────────────────────────────────────
// GET /insights - Weekly Analytics & Insights
// ──────────────────────────────────────────────
router.get('/insights', async (req, res) => {
    const { crop } = req.query;

    try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const weekData = await SensorData.find({ createdAt: { $gte: sevenDaysAgo } })
            .sort({ createdAt: 1 });

        // Also get previous week for comparison
        const fourteenDaysAgo = new Date();
        fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
        const prevWeekData = await SensorData.find({
            createdAt: { $gte: fourteenDaysAgo, $lt: sevenDaysAgo }
        }).sort({ createdAt: 1 });

        const currentInsights = calculateInsights(weekData, crop || 'Tomato');
        const prevInsights = calculateInsights(prevWeekData, crop || 'Tomato');

        // Week-over-week comparison
        const comparison = {};
        if (prevInsights.averages.temperature) {
            const metrics = ['temperature', 'humidity', 'ph', 'soilMoisture'];
            for (const m of metrics) {
                const diff = currentInsights.averages[m] - prevInsights.averages[m];
                comparison[m] = {
                    change: parseFloat(diff.toFixed(1)),
                    direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat',
                    percentChange: prevInsights.averages[m] ? parseFloat(((diff / prevInsights.averages[m]) * 100).toFixed(1)) : 0
                };
            }
        }

        res.json({
            current: currentInsights,
            previous: prevInsights,
            comparison,
            crop: CROPS[crop || 'Tomato']
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Insights calculation error' });
    }
});

// ──────────────────────────────────────────────
// GET /export - Export data as CSV
// ──────────────────────────────────────────────
router.get('/export', async (req, res) => {
    const { range } = req.query;
    let startDate = new Date();

    switch (range) {
        case '1y': startDate.setFullYear(startDate.getFullYear() - 1); break;
        case '6m': startDate.setMonth(startDate.getMonth() - 6); break;
        case '1m': startDate.setMonth(startDate.getMonth() - 1); break;
        case '7d': startDate.setDate(startDate.getDate() - 7); break;
        default: startDate.setHours(startDate.getHours() - 24); break;
    }

    try {
        const data = await SensorData.find({ createdAt: { $gte: startDate } })
            .sort({ createdAt: 1 })
            .lean();

        // Build CSV
        const headers = 'Timestamp,Temperature(°C),Humidity(%),pH,SoilMoisture(%),CropType\n';
        const rows = data.map(d =>
            `${new Date(d.createdAt).toISOString()},${d.temperature},${d.humidity},${d.ph},${d.soilMoisture},${d.cropType || ''}`
        ).join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=sensor_data_${range || '24h'}.csv`);
        res.send(headers + rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Export error' });
    }
});

module.exports = router;
