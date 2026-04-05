/**
 * Intelligence Engine - Core calculation module
 * Contains all mathematical algorithms for:
 * 1. Crop Health Score
 * 2. Predictive Analytics (Linear Regression + Moving Average)
 * 3. Risk Assessment (Disease, Heat, Water stress)
 * 4. Anomaly Detection
 * 5. Irrigation Intelligence
 * 6. Insights & Analytics
 * 
 * All computations are deterministic and based on real agricultural science.
 */

const CROPS = require('../config/crops');

// ============================================================
// 1. CROP HEALTH SCORE ENGINE
// Score 0-100 based on deviation from crop ideal conditions
// ============================================================

/**
 * Calculate how well a single metric matches ideal conditions.
 * Uses a bell curve penalty: score = 100 * exp(-0.5 * (deviation/tolerance)^2)
 * This gives 100% at ideal, ~60% at 1 tolerance distance, ~13% at 2x tolerance.
 * 
 * @param {number} value - Current sensor reading
 * @param {object} range - { min, max, ideal, stressTolerance }
 * @returns {number} 0-100 score for this metric
 */
function metricScore(value, range) {
    if (value == null || isNaN(value)) return 0;

    const deviation = Math.abs(value - range.ideal);
    const tolerance = range.stressTolerance || (range.max - range.min) / 2;

    // Gaussian penalty curve
    const score = 100 * Math.exp(-0.5 * Math.pow(deviation / tolerance, 2));
    return Math.max(0, Math.min(100, Math.round(score * 10) / 10));
}

/**
 * Calculate overall crop health score (0-100).
 * Weighted average: Temperature 30%, Moisture 30%, Humidity 20%, pH 20%
 * 
 * @param {object} sensorData - { temperature, humidity, ph, soilMoisture }
 * @param {string} cropName - Active crop name
 * @returns {object} { overall, breakdown, category, color }
 */
function calculateHealthScore(sensorData, cropName) {
    const crop = CROPS[cropName];
    if (!crop || !sensorData) {
        return { overall: 0, breakdown: {}, category: 'Unknown', color: '#6b7280' };
    }

    const tempScore = metricScore(sensorData.temperature, crop.temp);
    const humidScore = metricScore(sensorData.humidity, crop.humidity);
    const phScore = metricScore(sensorData.ph, crop.ph);
    const moistScore = metricScore(sensorData.soilMoisture, crop.moisture);

    // Weighted average (temperature and moisture are most critical)
    const overall = Math.round(
        tempScore * 0.30 +
        moistScore * 0.30 +
        humidScore * 0.20 +
        phScore * 0.20
    );

    let category, color;
    if (overall >= 90) { category = 'Excellent'; color = '#10b981'; }
    else if (overall >= 75) { category = 'Good'; color = '#22c55e'; }
    else if (overall >= 50) { category = 'Moderate'; color = '#f59e0b'; }
    else { category = 'Poor'; color = '#ef4444'; }

    return {
        overall,
        breakdown: {
            temperature: { score: tempScore, value: sensorData.temperature, ideal: crop.temp.ideal },
            humidity: { score: humidScore, value: sensorData.humidity, ideal: crop.humidity.ideal },
            ph: { score: phScore, value: sensorData.ph, ideal: crop.ph.ideal },
            soilMoisture: { score: moistScore, value: sensorData.soilMoisture, ideal: crop.moisture.ideal }
        },
        category,
        color
    };
}


// ============================================================
// 2. PREDICTIVE ANALYTICS ENGINE
// Moving Average + Simple Linear Regression
// ============================================================

/**
 * Simple Linear Regression: y = mx + b
 * @param {number[]} values - Array of numeric values
 * @returns {{ slope: number, intercept: number, r2: number }}
 */
function linearRegression(values) {
    const n = values.length;
    if (n < 2) return { slope: 0, intercept: values[0] || 0, r2: 0 };

    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0;

    for (let i = 0; i < n; i++) {
        sumX += i;
        sumY += values[i];
        sumXY += i * values[i];
        sumXX += i * i;
        sumYY += values[i] * values[i];
    }

    const denom = (n * sumXX - sumX * sumX);
    if (denom === 0) return { slope: 0, intercept: sumY / n, r2: 0 };

    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;

    // R² (coefficient of determination) - confidence metric
    const ssRes = values.reduce((sum, y, i) => sum + Math.pow(y - (slope * i + intercept), 2), 0);
    const ssTot = values.reduce((sum, y) => sum + Math.pow(y - sumY / n, 2), 0);
    const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);

    return { slope, intercept, r2 };
}

/**
 * Moving Average (Simple)
 * @param {number[]} data - Input data points
 * @param {number} window - Window size
 * @returns {number[]} Smoothed values
 */
function movingAverage(data, window = 5) {
    if (data.length < window) return data;
    const result = [];
    for (let i = 0; i <= data.length - window; i++) {
        const slice = data.slice(i, i + window);
        result.push(slice.reduce((a, b) => a + b, 0) / window);
    }
    return result;
}

/**
 * Generate predictions for a metric.
 * Combines moving average smoothing with linear regression.
 * 
 * @param {number[]} values - Historical values (last N readings)
 * @param {number} steps - How many future points to predict
 * @param {number} intervalMs - Time between readings in ms
 * @param {Date} lastTimestamp - Last known timestamp
 * @returns {{ predictions: Array, confidence: number, trend: string }}
 */
function predictMetric(values, steps = 6, intervalMs = 5 * 60000, lastTimestamp = new Date()) {
    // Smooth data first
    const smoothed = movingAverage(values, Math.min(5, values.length));

    // Apply regression on smoothed data
    const { slope, intercept, r2 } = linearRegression(smoothed);
    const n = smoothed.length;

    const predictions = [];
    for (let i = 1; i <= steps; i++) {
        const predictedValue = slope * (n + i - 1) + intercept;
        predictions.push({
            time: new Date(lastTimestamp.getTime() + i * intervalMs),
            value: parseFloat(predictedValue.toFixed(2))
        });
    }

    // Confidence based on R² and data consistency
    const confidence = Math.round(r2 * 100);
    const trend = slope > 0.1 ? 'rising' : slope < -0.1 ? 'falling' : 'stable';

    return { predictions, confidence, trend };
}


// ============================================================
// 3. RISK ASSESSMENT MODULE
// Disease, Heat Stress, Water Stress probability
// ============================================================

/**
 * Calculate risk probabilities (0-100%) for a crop.
 * 
 * Disease Risk: f(humidity, temperature) - High humidity + warmth = fungal risk
 * Heat Stress: f(temperature vs crop max)
 * Water Stress: f(soil moisture vs crop min)
 * 
 * @param {object} sensorData
 * @param {string} cropName
 * @returns {{ disease: number, heat: number, water: number, overall: string }}
 */
function calculateRisks(sensorData, cropName) {
    const crop = CROPS[cropName];
    if (!crop || !sensorData) {
        return { disease: 0, heat: 0, water: 0, overall: 'Unknown' };
    }

    // Disease Risk: exponential increase when humidity > 70% and temp > 20°C
    let diseaseRisk = 0;
    if (sensorData.humidity > 60 && sensorData.temperature > 18) {
        const humidityFactor = Math.min(1, (sensorData.humidity - 60) / 30); // 0 at 60%, 1 at 90%
        const tempFactor = Math.min(1, (sensorData.temperature - 18) / 15);   // 0 at 18°C, 1 at 33°C
        diseaseRisk = humidityFactor * tempFactor * 100 * crop.riskSensitivity.disease;
    }

    // Heat Stress: sigmoid curve above crop max temperature
    let heatRisk = 0;
    if (sensorData.temperature > crop.temp.ideal) {
        const excess = sensorData.temperature - crop.temp.ideal;
        const tolerance = crop.temp.stressTolerance;
        heatRisk = Math.min(100, (excess / tolerance) * 50 * crop.riskSensitivity.heat);
    }

    // Water Stress: linear increase below optimal moisture
    let waterRisk = 0;
    if (sensorData.soilMoisture < crop.moisture.ideal) {
        const deficit = crop.moisture.ideal - sensorData.soilMoisture;
        const range = crop.moisture.ideal - crop.moisture.min;
        waterRisk = Math.min(100, (deficit / range) * 100 * crop.riskSensitivity.water);
    }

    // Overall risk level
    const maxRisk = Math.max(diseaseRisk, heatRisk, waterRisk);
    let overall = 'Low';
    if (maxRisk > 70) overall = 'Critical';
    else if (maxRisk > 40) overall = 'High';
    else if (maxRisk > 20) overall = 'Moderate';

    return {
        disease: Math.round(diseaseRisk),
        heat: Math.round(heatRisk),
        water: Math.round(waterRisk),
        overall
    };
}


// ============================================================
// 4. ANOMALY DETECTION
// Detects sudden spikes, drops, and sensor malfunction patterns
// ============================================================

/**
 * Detect anomalies by comparing recent data points.
 * 
 * @param {Array} recentData - Last N sensor readings (sorted by time asc)
 * @returns {Array} Detected anomalies with type, severity, and description
 */
function detectAnomalies(recentData) {
    if (!recentData || recentData.length < 3) return [];

    const anomalies = [];
    const last = recentData[recentData.length - 1];
    const prev = recentData[recentData.length - 2];
    const windowSize = Math.min(10, recentData.length);
    const window = recentData.slice(-windowSize);

    // Calculate standard deviations for each metric
    const metrics = ['temperature', 'humidity', 'ph', 'soilMoisture'];

    for (const metric of metrics) {
        const values = window.map(d => d[metric]);
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const std = Math.sqrt(values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length);

        const currentValue = last[metric];
        const previousValue = prev[metric];
        const change = Math.abs(currentValue - previousValue);

        // Spike detection: sudden change > threshold
        const thresholds = {
            temperature: 8,    // >8°C spike
            humidity: 20,      // >20% spike
            ph: 1.5,           // >1.5 pH jump
            soilMoisture: 25   // >25% spike
        };

        if (change > thresholds[metric]) {
            anomalies.push({
                type: 'spike',
                metric,
                severity: change > thresholds[metric] * 1.5 ? 'Critical' : 'Warning',
                value: currentValue,
                change: parseFloat(change.toFixed(2)),
                message: `Sudden ${currentValue > previousValue ? 'spike' : 'drop'} in ${metric}: ${change.toFixed(1)} unit change detected`
            });
        }

        // Z-score anomaly: value > 2.5 standard deviations from mean
        if (std > 0) {
            const zScore = Math.abs((currentValue - mean) / std);
            if (zScore > 2.5) {
                anomalies.push({
                    type: 'outlier',
                    metric,
                    severity: zScore > 3 ? 'Critical' : 'Warning',
                    value: currentValue,
                    zScore: parseFloat(zScore.toFixed(2)),
                    message: `Abnormal ${metric} reading: ${currentValue} (z-score: ${zScore.toFixed(1)})`
                });
            }
        }

        // Sensor malfunction: stuck value (same value > 5 consecutive readings)
        if (values.length >= 5) {
            const lastFive = values.slice(-5);
            const allSame = lastFive.every(v => v === lastFive[0]);
            if (allSame) {
                anomalies.push({
                    type: 'malfunction',
                    metric,
                    severity: 'Warning',
                    value: currentValue,
                    message: `Possible sensor malfunction: ${metric} stuck at ${currentValue}`
                });
            }
        }
    }

    return anomalies;
}


// ============================================================
// 5. INTELLIGENT IRRIGATION ENGINE
// Calculates recommended irrigation based on multiple factors
// ============================================================

/**
 * Calculate intelligent irrigation recommendation.
 * Considers: current moisture, temperature-based evaporation, humidity,
 * crop water needs, and moisture trend.
 * 
 * @param {object} sensorData - Current sensor readings
 * @param {string} cropName - Active crop
 * @param {Array} recentHistory - Last hour of data for trend analysis
 * @returns {object} Recommendation details
 */
function calculateIrrigation(sensorData, cropName, recentHistory = []) {
    const crop = CROPS[cropName];
    if (!crop || !sensorData) {
        return {
            recommendation: 'Select a crop to get irrigation advice.',
            duration: 0, urgency: 'None', efficiency: 0, action: 'None'
        };
    }

    const { soilMoisture, temperature, humidity } = sensorData;
    const idealMoisture = crop.moisture.ideal;
    const minMoisture = crop.moisture.min;

    // 1. Calculate moisture deficit
    const deficit = idealMoisture - soilMoisture;

    // 2. Estimate evaporation rate (simplified Penman-Monteith concept)
    // Higher temp + lower humidity = more evaporation
    const tempFactor = Math.max(0, (temperature - 15) / 30); // 0 at 15°C, 1 at 45°C
    const humidFactor = Math.max(0, 1 - (humidity / 100));     // 0 at 100%, 1 at 0%
    const evaporationRate = (tempFactor * 0.6 + humidFactor * 0.4) * 3; // mm/hr equivalent

    // 3. Moisture trend analysis
    let moistureTrend = 0; // mm/hr change rate
    if (recentHistory.length >= 5) {
        const values = recentHistory.map(d => d.soilMoisture);
        const { slope } = linearRegression(values);
        moistureTrend = slope * 12; // Convert per-reading to per-hour (5s intervals × 12 = 1 min)
    }

    // 4. Calculate irrigation duration
    // Duration = deficit * base_time / efficiency_factor
    let duration = 0;
    let urgency = 'None';
    let action = 'None';
    let recommendation = '';
    let efficiency = 85; // Base efficiency %

    if (soilMoisture < minMoisture) {
        // Critical: below minimum
        duration = Math.round(deficit * 2.5 + evaporationRate * 10);
        urgency = 'Critical';
        action = 'Irrigate';
        efficiency = Math.round(85 - evaporationRate * 5); // Less efficient in hot/dry
        recommendation = `🚨 Critical: Soil moisture (${soilMoisture}%) is below minimum (${minMoisture}%). Irrigate for ${duration} minutes immediately.`;
    } else if (soilMoisture < idealMoisture - 5) {
        // Warning: below ideal
        duration = Math.round(deficit * 1.5 + evaporationRate * 5);
        urgency = 'High';
        action = 'Irrigate';
        efficiency = Math.round(90 - evaporationRate * 3);
        recommendation = `⚠️ Moisture below optimal (${soilMoisture}% vs ${idealMoisture}%). Schedule ${duration} minute irrigation cycle.`;
    } else if (soilMoisture > crop.moisture.max) {
        urgency = 'Info';
        action = 'Drain';
        efficiency = 0;
        recommendation = `💧 Soil oversaturated (${soilMoisture}%). Ensure proper drainage. Pause irrigation.`;
    } else if (temperature > crop.temp.max && humidity < 40) {
        // Heat + dry air combo
        duration = Math.round(15 + evaporationRate * 5);
        urgency = 'Moderate';
        action = 'Mist';
        efficiency = 70;
        recommendation = `☀️ Hot & dry conditions detected. Consider ${duration}-minute misting cycle for cooling.`;
    } else {
        // Optimal
        urgency = 'Low';
        action = 'None';
        efficiency = 95;
        recommendation = `✅ Conditions optimal for ${cropName}. Moisture at ${soilMoisture}% (ideal: ${idealMoisture}%).`;
    }

    // Adjust efficiency based on conditions
    efficiency = Math.max(20, Math.min(98, efficiency));

    return {
        recommendation,
        duration,
        urgency,
        efficiency,
        action,
        evaporationRate: parseFloat(evaporationRate.toFixed(2)),
        moistureTrend: parseFloat(moistureTrend.toFixed(2)),
        deficit: parseFloat(Math.max(0, deficit).toFixed(1))
    };
}


// ============================================================
// 6. INSIGHTS & ANALYTICS
// Weekly averages, stability scores, growth suitability
// ============================================================

/**
 * Calculate 7-day analytics from historical data.
 * 
 * @param {Array} weekData - Array of sensor readings from past 7 days
 * @param {string} cropName - Active crop
 * @returns {object} Analytics object
 */
function calculateInsights(weekData, cropName) {
    const crop = CROPS[cropName];
    if (!weekData || weekData.length === 0 || !crop) {
        return {
            averages: { temperature: 0, humidity: 0, ph: 0, soilMoisture: 0 },
            stability: 0, suitability: 0, waterUsage: 0, trends: {}
        };
    }

    const n = weekData.length;
    const metrics = ['temperature', 'humidity', 'ph', 'soilMoisture'];
    const averages = {};
    const stdDevs = {};
    const trends = {};

    for (const m of metrics) {
        const values = weekData.map(d => d[m]).filter(v => v != null);
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const std = Math.sqrt(values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length);
        averages[m] = parseFloat(mean.toFixed(1));
        stdDevs[m] = parseFloat(std.toFixed(2));

        // Weekly trend: compare first half vs second half
        const midpoint = Math.floor(values.length / 2);
        const firstHalf = values.slice(0, midpoint);
        const secondHalf = values.slice(midpoint);
        const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
        const change = secondAvg - firstAvg;

        trends[m] = {
            direction: change > 0.5 ? 'rising' : change < -0.5 ? 'falling' : 'stable',
            change: parseFloat(change.toFixed(2)),
            arrow: change > 0.5 ? '↑' : change < -0.5 ? '↓' : '→'
        };
    }

    // Environmental Stability Score (0-100)
    // Lower std dev = more stable = better
    const maxStds = { temperature: 10, humidity: 25, ph: 1.5, soilMoisture: 20 };
    let stabilitySum = 0;
    for (const m of metrics) {
        const normalized = 1 - Math.min(1, stdDevs[m] / maxStds[m]);
        stabilitySum += normalized;
    }
    const stability = Math.round((stabilitySum / metrics.length) * 100);

    // Growth Suitability Index (0-100)
    // How close are averages to ideal?
    const cropRanges = { temperature: crop.temp, humidity: crop.humidity, ph: crop.ph, soilMoisture: crop.moisture };
    let suitabilitySum = 0;
    for (const m of metrics) {
        suitabilitySum += metricScore(averages[m], cropRanges[m]);
    }
    const suitability = Math.round(suitabilitySum / metrics.length);

    // Estimated Water Usage (simplified)
    // Based on average temperature and humidity
    const dailyWater = crop.waterNeed / 120; // Assume 120-day season
    const tempMultiplier = 1 + (averages.temperature - 25) * 0.03; // More water when hotter
    const waterUsage = parseFloat((dailyWater * 7 * tempMultiplier).toFixed(1));

    return {
        averages,
        stdDevs,
        stability,
        suitability,
        waterUsage,
        trends,
        dataPoints: n
    };
}


// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    // Health
    calculateHealthScore,
    metricScore,

    // Prediction
    linearRegression,
    movingAverage,
    predictMetric,

    // Risk
    calculateRisks,

    // Anomaly
    detectAnomalies,

    // Irrigation
    calculateIrrigation,

    // Insights
    calculateInsights
};
