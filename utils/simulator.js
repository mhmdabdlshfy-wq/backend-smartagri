const SensorData = require('../models/SensorData');
const Alert = require('../models/Alert');
const CROPS = require('../config/crops'); // Ensure this file exists and exports crop data

// Default crop for simulation targets (can be updated dynamically)
let activeCrop = 'Tomato';

const RANGES = {
    temperature: { min: -10, max: 60, criticalHigh: 30, criticalLow: 0 },
    humidity: { min: 0, max: 100, criticalLow: 40, criticalHigh: 95 },
    ph: { min: 0, max: 14, criticalLow: 4, criticalHigh: 9 },
    soilMoisture: { min: 0, max: 100, criticalLow: 10, criticalHigh: 90 }
};

// Max change per step (5 seconds) - smaller changes for smoother transitions
const MAX_CHANGE = {
    temperature: 0.3,
    humidity: 0.5,
    ph: 0.05,
    soilMoisture: 0.3
};

// These will be initialized from the daily cycle at simulation start
let currentValues = {
    temperature: 24.0,
    humidity: 60.0,
    ph: 6.5,
    soilMoisture: 50.0
};

// ═══════════════════════════════════════════════════════════
// REALISTIC DAILY CYCLE ENGINE
// Simulates natural environmental patterns:
//   - Temperature: peaks ~14:00, dips ~04:00 (sinusoidal)
//   - Humidity: inversely correlated with temperature
//   - Soil Moisture: gradual drying + periodic irrigation
//   - pH: slow natural drift
// ═══════════════════════════════════════════════════════════

/**
 * Calculate the target temperature for the current time of day
 * Uses a sinusoidal model: peak at 14:00 (2 PM), trough at 02:00 (2 AM)
 */
const getDailyTemperatureTarget = (hour, minute) => {
    // Convert to fractional hours
    const t = hour + minute / 60;
    // Sinusoidal: peak at 14:00 (phase shift = -14 hrs from cosine peak)
    // cos((t - 14) * π / 12) gives peak at 14:00, trough at 02:00
    const cycle = Math.cos((t - 14) / 12 * Math.PI);

    // Get seasonal base from current month
    // Note: Agricultural environments (greenhouses, managed fields) maintain
    // warmer temperatures than raw outdoor conditions
    const month = new Date().getMonth();
    let seasonalBase;
    if (month >= 4 && month <= 8) seasonalBase = 26;      // Summer
    else if (month >= 10 || month <= 2) seasonalBase = 18; // Winter (managed environment)
    else seasonalBase = 22;                                 // Spring/Autumn

    // Amplitude: temperature swings ±5°C around the seasonal base
    // Smaller swings in managed agriculture vs raw weather
    const amplitude = 5;
    return seasonalBase + cycle * amplitude;
};

/**
 * Calculate target humidity (inversely correlated with temperature)
 * Hot afternoons => lower humidity; cool nights => higher humidity
 */
const getDailyHumidityTarget = (hour, minute) => {
    const t = hour + minute / 60;
    // Inverse of temperature: trough at 14:00, peak in early morning
    const cycle = -Math.cos((t - 14) / 12 * Math.PI);

    const baseHumidity = 58;
    const amplitude = 10;
    return baseHumidity + cycle * amplitude;
};

/**
 * Calculate target soil moisture
 * Gradually dries during the day, rises with simulated irrigation events
 */
const getDailySoilMoistureTarget = (hour) => {
    // Soil moisture is lower in the afternoon (evaporation), higher at night/morning
    const cycle = -Math.cos((hour - 14) / 12 * Math.PI);
    const baseMoisture = 50;
    const amplitude = 8;
    return baseMoisture + cycle * amplitude;
};

/**
 * Smoothly move current value toward a target with natural noise
 * @param {number} current - Current value
 * @param {number} target - Target value for this time of day
 * @param {number} maxChange - Maximum change per step
 * @param {number} noiseLevel - How much random noise to add
 * @param {number} min - Absolute minimum bound
 * @param {number} max - Absolute maximum bound
 * @returns {number} New value
 */
const smoothTowardTarget = (current, target, maxChange, noiseLevel, min, max) => {
    // Pull toward target: difference * pull factor
    const diff = target - current;
    const pullFactor = 0.15; // How quickly we approach the target
    const pull = diff * pullFactor;

    // Add natural noise
    const noise = (Math.random() * 2 - 1) * noiseLevel;

    // Combine pull and noise, cap at maxChange
    let change = pull + noise;
    change = Math.max(-maxChange, Math.min(maxChange, change));

    let newValue = current + change;
    // Clamp to bounds
    newValue = Math.max(min, Math.min(max, newValue));

    return parseFloat(newValue.toFixed(2));
};


const checkAlerts = async (data, io) => {
    const alerts = [];
    const crop = CROPS[activeCrop] || CROPS['Tomato'];
    const cropName = crop.name;
    const cropEmoji = crop.emoji || '🌱';

    // ═══════════════════════════════════════════════════════════
    // CROP-SPECIFIC ALERTS
    // Alerts are generated based on the active crop's ideal ranges
    // from crops.js config. Each crop has different thresholds.
    // ═══════════════════════════════════════════════════════════

    // ── Temperature Alerts (based on crop.temp) ──
    const tempRange = crop.temp;
    const tempStress = tempRange.stressTolerance || 5;

    if (data.temperature > tempRange.max + tempStress) {
        alerts.push({
            type: 'temperature', severity: 'Critical', value: data.temperature,
            message: `🔥 ${cropEmoji} ${cropName}: Extreme Heat ${data.temperature}°C (max ${tempRange.max}°C + ${tempStress}°C tolerance exceeded!)`
        });
    } else if (data.temperature > tempRange.max) {
        alerts.push({
            type: 'temperature', severity: 'Warning', value: data.temperature,
            message: `⚠️ ${cropEmoji} ${cropName}: High Temperature ${data.temperature}°C (ideal max: ${tempRange.max}°C)`
        });
    } else if (data.temperature < tempRange.min - tempStress) {
        alerts.push({
            type: 'temperature', severity: 'Critical', value: data.temperature,
            message: `❄️ ${cropEmoji} ${cropName}: Extreme Cold ${data.temperature}°C (min ${tempRange.min}°C - ${tempStress}°C tolerance exceeded!)`
        });
    } else if (data.temperature < tempRange.min) {
        alerts.push({
            type: 'temperature', severity: 'Warning', value: data.temperature,
            message: `🥶 ${cropEmoji} ${cropName}: Low Temperature ${data.temperature}°C (ideal min: ${tempRange.min}°C)`
        });
    }

    // ── Humidity Alerts (based on crop.humidity) ──
    const humRange = crop.humidity;
    const humStress = humRange.stressTolerance || 10;

    if (data.humidity > humRange.max + humStress) {
        alerts.push({
            type: 'humidity', severity: 'Critical', value: data.humidity,
            message: `💧 ${cropEmoji} ${cropName}: Dangerously High Humidity ${data.humidity}% (max ${humRange.max}% + tolerance exceeded)`
        });
    } else if (data.humidity > humRange.max) {
        alerts.push({
            type: 'humidity', severity: 'Warning', value: data.humidity,
            message: `💧 ${cropEmoji} ${cropName}: High Humidity ${data.humidity}% (ideal max: ${humRange.max}%) – Fungal risk`
        });
    } else if (data.humidity < humRange.min - humStress) {
        alerts.push({
            type: 'humidity', severity: 'Critical', value: data.humidity,
            message: `🏜️ ${cropEmoji} ${cropName}: Critically Low Humidity ${data.humidity}% (min ${humRange.min}% - tolerance exceeded)`
        });
    } else if (data.humidity < humRange.min) {
        alerts.push({
            type: 'humidity', severity: 'Warning', value: data.humidity,
            message: `� ${cropEmoji} ${cropName}: Low Humidity ${data.humidity}% (ideal min: ${humRange.min}%)`
        });
    }

    // ── Soil Moisture Alerts (based on crop.moisture) ──
    const moistRange = crop.moisture;
    const moistStress = moistRange.stressTolerance || 10;

    if (data.soilMoisture < moistRange.min - moistStress) {
        alerts.push({
            type: 'soilMoisture', severity: 'Critical', value: data.soilMoisture,
            message: `🚨 ${cropEmoji} ${cropName}: Critical Drought! Soil moisture ${data.soilMoisture}% (min ${moistRange.min}% - tolerance exceeded)`
        });
    } else if (data.soilMoisture < moistRange.min) {
        alerts.push({
            type: 'irrigation', severity: 'Warning', value: data.soilMoisture,
            message: `🚿 ${cropEmoji} ${cropName}: Irrigation Needed – Soil moisture ${data.soilMoisture}% (ideal min: ${moistRange.min}%)`
        });
    } else if (data.soilMoisture > moistRange.max + moistStress) {
        alerts.push({
            type: 'soilMoisture', severity: 'Critical', value: data.soilMoisture,
            message: `🌊 ${cropEmoji} ${cropName}: Waterlogging Risk! Soil ${data.soilMoisture}% (max ${moistRange.max}% + tolerance exceeded)`
        });
    } else if (data.soilMoisture > moistRange.max) {
        alerts.push({
            type: 'soilMoisture', severity: 'Info', value: data.soilMoisture,
            message: `💦 ${cropEmoji} ${cropName}: High Soil Moisture ${data.soilMoisture}% (ideal max: ${moistRange.max}%) – Monitor drainage`
        });
    }

    // ── pH Alerts (based on crop.ph) ──
    const phRange = crop.ph;
    const phStress = phRange.stressTolerance || 0.5;

    if (data.ph < phRange.min - phStress) {
        alerts.push({
            type: 'ph', severity: 'Critical', value: data.ph,
            message: `⚗️ ${cropEmoji} ${cropName}: Severely Acidic Soil pH ${data.ph} (min ${phRange.min} - tolerance exceeded) – Add lime`
        });
    } else if (data.ph < phRange.min) {
        alerts.push({
            type: 'ph', severity: 'Warning', value: data.ph,
            message: `🧪 ${cropEmoji} ${cropName}: Acidic Soil pH ${data.ph} (ideal min: ${phRange.min})`
        });
    } else if (data.ph > phRange.max + phStress) {
        alerts.push({
            type: 'ph', severity: 'Critical', value: data.ph,
            message: `⚗️ ${cropEmoji} ${cropName}: Highly Alkaline Soil pH ${data.ph} (max ${phRange.max} + tolerance exceeded) – Add sulfur`
        });
    } else if (data.ph > phRange.max) {
        alerts.push({
            type: 'ph', severity: 'Warning', value: data.ph,
            message: `🧪 ${cropEmoji} ${cropName}: Alkaline Soil pH ${data.ph} (ideal max: ${phRange.max})`
        });
    }

    // ── Combo / Disease Alerts (crop-sensitive) ──
    const diseaseRisk = crop.riskSensitivity?.disease || 0.7;
    if (data.humidity > humRange.max && data.temperature > tempRange.ideal && diseaseRisk > 0.6) {
        alerts.push({
            type: 'disease', severity: 'Warning', value: data.humidity,
            message: `🦠 ${cropEmoji} ${cropName}: Disease Risk! Humidity ${data.humidity}% + Temp ${data.temperature}°C (${cropName} disease sensitivity: ${(diseaseRisk * 100).toFixed(0)}%)`
        });
    }
    if (data.temperature > tempRange.max && data.soilMoisture < moistRange.min) {
        alerts.push({
            type: 'irrigation', severity: 'Critical', value: data.soilMoisture,
            message: `☀️🚿 ${cropEmoji} ${cropName}: Heat + Dry Soil! Temp ${data.temperature}°C > max ${tempRange.max}°C AND Soil ${data.soilMoisture}% < min ${moistRange.min}%`
        });
    }

    // ── Random System Alerts (3% chance – rare informational) ──
    if (Math.random() < 0.03) {
        const systemAlerts = [
            { type: 'system', severity: 'Info', value: 0, message: `📡 ${cropEmoji} ${cropName}: Sensor calibration check due in 3 days` },
            { type: 'system', severity: 'Info', value: 0, message: `🔋 ${cropEmoji} ${cropName}: Battery level on Sensor Node #3: 42%` },
            { type: 'system', severity: 'Warning', value: 0, message: `📶 ${cropEmoji} ${cropName}: Weak signal on Sensor Node #7 – Check antenna` },
            { type: 'system', severity: 'Info', value: 0, message: `🌱 ${cropEmoji} ${cropName}: Growth stage update detected` },
            { type: 'system', severity: 'Info', value: 0, message: `📊 ${cropEmoji} ${cropName}: Weekly report generated – View in Analytics` },
        ];
        const randomAlert = systemAlerts[Math.floor(Math.random() * systemAlerts.length)];
        alerts.push(randomAlert);
    }

    // ── Save & Emit (dedup within 3 minutes per type+crop to avoid spam) ──
    for (const alertData of alerts) {
        // Tag every alert with the active crop
        alertData.cropType = cropName;

        const count = await Alert.countDocuments({
            type: alertData.type,
            cropType: cropName,
            createdAt: { $gt: new Date(Date.now() - 180000) } // 3 min dedup
        });

        if (count === 0) {
            const alert = new Alert(alertData);
            await alert.save();
            io.emit('newAlert', alert);
        }
    }
};


const startSimulation = async (io) => {
    console.log('Starting Sensor Simulation (Realistic Daily Cycles - 5s Interval)...');

    // ── Initialize current values from the daily cycle for the current time ──
    // This prevents a startup spike from hardcoded values
    const initNow = new Date();
    const initHour = initNow.getHours();
    const initMinute = initNow.getMinutes();
    currentValues.temperature = getDailyTemperatureTarget(initHour, initMinute);
    currentValues.humidity = getDailyHumidityTarget(initHour, initMinute);
    currentValues.soilMoisture = getDailySoilMoistureTarget(initHour);
    currentValues.ph = 6.5;
    console.log(`📍 Initialized at ${initHour}:${initMinute} → Temp: ${currentValues.temperature.toFixed(1)}°C, Hum: ${currentValues.humidity.toFixed(1)}%, Soil: ${currentValues.soilMoisture.toFixed(1)}%, pH: ${currentValues.ph}`);

    // ============================================
    // AUTO-SEED: Ensure we always have 1 year of data
    // ============================================
    try {
        // Check if we have data older than 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const oldDataCount = await SensorData.countDocuments({ createdAt: { $lt: thirtyDaysAgo } });

        if (oldDataCount === 0) {
            console.log('🗑️  No historical data found. Clearing short-term data and seeding full year...');
            await SensorData.deleteMany({}); // Clear everything

            const seedData = [];
            const now = new Date();

            // ══════════════════════════════════════════════
            // SMOOTH WALK SEEDER
            // Each point is based on the PREVIOUS point,
            // smoothly pulled toward the daily cycle target.
            // This creates realistic, continuous chart lines.
            // ══════════════════════════════════════════════

            // Walking state — carries forward so every point connects smoothly
            let walkTemp = 20;
            let walkHum = 58;
            let walkSoil = 50;
            let walkPh = 6.5;

            // Helper: smoothly step toward a target
            const stepToward = (current, target, maxStep, noise) => {
                const pull = (target - current) * 0.2; // 20% pull toward target
                const n = (Math.random() - 0.5) * noise; // tiny noise
                let val = current + Math.max(-maxStep, Math.min(maxStep, pull + n));
                return parseFloat(val.toFixed(2));
            };

            // ── YEAR DATA: 1 point every 6 hours for 12 months ──
            for (let i = 365; i >= 1; i--) {
                const date = new Date(now);
                date.setDate(date.getDate() - i);
                const month = date.getMonth();

                // Seasonal base temperature (managed agriculture)
                let seasonalBase;
                if (month >= 4 && month <= 8) seasonalBase = 26;
                else if (month >= 10 || month <= 2) seasonalBase = 18;
                else seasonalBase = 22;

                // Slow irrigation cycle: ~20 day period (smooth, not 5 days)
                const dayOfYear = 365 - i;
                const irrigationBase = 50 + Math.sin(dayOfYear / 20 * Math.PI * 2) * 6;

                for (let h = 0; h < 24; h += 6) {
                    const timestamp = new Date(date);
                    timestamp.setHours(h, 0, 0, 0);

                    // Daily targets
                    const dailyTempCycle = Math.cos((h - 14) / 12 * Math.PI) * 5;
                    const tempTarget = seasonalBase + dailyTempCycle;
                    const humTarget = 58 + (-Math.cos((h - 14) / 12 * Math.PI)) * 10;
                    const soilTarget = irrigationBase + (-Math.cos((h - 14) / 12 * Math.PI)) * 4;
                    const phTarget = 6.5 + Math.sin(dayOfYear / 60) * 0.15;

                    // Smooth walk toward targets
                    walkTemp = stepToward(walkTemp, tempTarget, 1.0, 0.3);
                    walkHum = stepToward(walkHum, humTarget, 1.5, 0.5);
                    walkSoil = stepToward(walkSoil, soilTarget, 1.0, 0.4);
                    walkPh = stepToward(walkPh, phTarget, 0.05, 0.02);

                    seedData.push({
                        temperature: parseFloat(Math.max(8, Math.min(38, walkTemp)).toFixed(1)),
                        humidity: parseFloat(Math.max(30, Math.min(85, walkHum)).toFixed(1)),
                        ph: parseFloat(Math.max(5.0, Math.min(8.0, walkPh)).toFixed(2)),
                        soilMoisture: parseFloat(Math.max(30, Math.min(80, walkSoil)).toFixed(1)),
                        cropType: 'Tomato',
                        createdAt: timestamp
                    });
                }
            }

            // ── LAST 7 DAYS: 1 point every 15 minutes ──
            // Continue walk from where year data left off
            for (let i = 7 * 24 * 4; i >= 1; i--) {
                const timestamp = new Date(now);
                timestamp.setMinutes(timestamp.getMinutes() - (i * 15));
                const hour = timestamp.getHours();
                const minute = timestamp.getMinutes();

                const tempTarget = getDailyTemperatureTarget(hour, minute);
                const humTarget = getDailyHumidityTarget(hour, minute);
                const soilTarget = getDailySoilMoistureTarget(hour);

                walkTemp = stepToward(walkTemp, tempTarget, 0.4, 0.15);
                walkHum = stepToward(walkHum, humTarget, 0.6, 0.2);
                walkSoil = stepToward(walkSoil, soilTarget, 0.4, 0.15);
                walkPh = stepToward(walkPh, 6.5, 0.02, 0.008);

                seedData.push({
                    temperature: parseFloat(Math.max(10, Math.min(35, walkTemp)).toFixed(1)),
                    humidity: parseFloat(Math.max(35, Math.min(82, walkHum)).toFixed(1)),
                    ph: parseFloat(Math.max(5.5, Math.min(7.5, walkPh)).toFixed(2)),
                    soilMoisture: parseFloat(Math.max(32, Math.min(75, walkSoil)).toFixed(1)),
                    cropType: 'Tomato',
                    createdAt: timestamp
                });
            }

            // ── LAST 24 HOURS: 1 point every 2 minutes ──
            // Continue walk from 7-day data
            for (let i = 24 * 30; i >= 1; i--) {
                const timestamp = new Date(now);
                timestamp.setMinutes(timestamp.getMinutes() - (i * 2));
                const hour = timestamp.getHours();
                const minute = timestamp.getMinutes();

                const tempTarget = getDailyTemperatureTarget(hour, minute);
                const humTarget = getDailyHumidityTarget(hour, minute);
                const soilTarget = getDailySoilMoistureTarget(hour);

                walkTemp = stepToward(walkTemp, tempTarget, 0.15, 0.05);
                walkHum = stepToward(walkHum, humTarget, 0.25, 0.08);
                walkSoil = stepToward(walkSoil, soilTarget, 0.15, 0.05);
                walkPh = stepToward(walkPh, 6.5, 0.008, 0.003);

                seedData.push({
                    temperature: parseFloat(Math.max(12, Math.min(33, walkTemp)).toFixed(1)),
                    humidity: parseFloat(Math.max(38, Math.min(78, walkHum)).toFixed(1)),
                    ph: parseFloat(Math.max(5.8, Math.min(7.2, walkPh)).toFixed(2)),
                    soilMoisture: parseFloat(Math.max(35, Math.min(72, walkSoil)).toFixed(1)),
                    cropType: 'Tomato',
                    createdAt: timestamp
                });
            }

            // Sort all seed data by time before inserting
            seedData.sort((a, b) => a.createdAt - b.createdAt);

            console.log(`📊 Inserting ${seedData.length} records covering 1 full year...`);
            // Insert in batches to avoid memory issues
            const batchSize = 500;
            for (let i = 0; i < seedData.length; i += batchSize) {
                await SensorData.insertMany(seedData.slice(i, i + batchSize));
            }
            console.log('✅ Database seeded with 1 year of realistic daily-cycle data!');
        } else {
            console.log(`📊 Historical data found (${oldDataCount} old records). Skipping seed.`);
        }
    } catch (e) {
        console.error("Seeding Error:", e);
    }

    // ============================================
    // REAL-TIME SIMULATION (every 5 seconds)
    // Uses realistic daily cycles instead of random drift
    // ============================================

    // Irrigation cycle tracker
    let stepsSinceIrrigation = 0;
    const IRRIGATION_INTERVAL = 720 * 5; // ~1 hour in 5-second steps, triggers every ~5 hours

    setInterval(async () => {
        try {
            const now = new Date();
            const hour = now.getHours();
            const minute = now.getMinutes();

            // Rare anomaly mode: 2% chance
            // Creates small fluctuations that self-correct via daily cycle pull
            if (Math.random() < 0.02) {
                const type = ['temperature', 'humidity', 'ph', 'soilMoisture'][Math.floor(Math.random() * 4)];
                const high = Math.random() > 0.5;

                console.log(`⚡ ANOMALY: Brief ${type} fluctuation ${high ? 'High' : 'Low'}`);

                // Small spikes that self-correct quickly
                if (type === 'temperature') currentValues.temperature += high ? 3 : -3;
                if (type === 'humidity') currentValues.humidity += high ? 5 : -5;
                if (type === 'ph') currentValues.ph += high ? 0.5 : -0.5;
                if (type === 'soilMoisture') currentValues.soilMoisture += high ? 6 : -6;

                // Clamp to safe ranges
                currentValues.temperature = Math.max(5, Math.min(45, currentValues.temperature));
                currentValues.humidity = Math.max(25, Math.min(95, currentValues.humidity));
                currentValues.ph = Math.max(4.5, Math.min(8.5, currentValues.ph));
                currentValues.soilMoisture = Math.max(20, Math.min(90, currentValues.soilMoisture));
            } else {
                // ═══ REALISTIC DAILY CYCLE SIMULATION ═══

                // Temperature: follows sinusoidal daily pattern
                const tempTarget = getDailyTemperatureTarget(hour, minute);
                currentValues.temperature = smoothTowardTarget(
                    currentValues.temperature, tempTarget,
                    MAX_CHANGE.temperature, 0.1, // small noise
                    RANGES.temperature.min, RANGES.temperature.max
                );

                // Humidity: inversely correlated with temperature
                const humTarget = getDailyHumidityTarget(hour, minute);
                currentValues.humidity = smoothTowardTarget(
                    currentValues.humidity, humTarget,
                    MAX_CHANGE.humidity, 0.2,
                    RANGES.humidity.min, RANGES.humidity.max
                );

                // Soil Moisture: daily drying cycle + periodic irrigation
                stepsSinceIrrigation++;
                let soilTarget = getDailySoilMoistureTarget(hour);

                // Simulate irrigation event: moisture jumps up (~every 5 hours of simulation)
                if (stepsSinceIrrigation >= IRRIGATION_INTERVAL && currentValues.soilMoisture < 45) {
                    console.log('🚿 Irrigation event triggered – soil moisture rising');
                    currentValues.soilMoisture = Math.min(100, currentValues.soilMoisture + 15);
                    stepsSinceIrrigation = 0;
                }

                // Rain event: 0.5% chance per step
                if (Math.random() < 0.005) {
                    console.log('🌧️ Rain event detected');
                    currentValues.soilMoisture = Math.min(95, currentValues.soilMoisture + 12);
                    currentValues.humidity = Math.min(98, currentValues.humidity + 8);
                }

                currentValues.soilMoisture = smoothTowardTarget(
                    currentValues.soilMoisture, soilTarget,
                    MAX_CHANGE.soilMoisture, 0.15,
                    RANGES.soilMoisture.min, RANGES.soilMoisture.max
                );

                // pH: very slow natural drift around 6.5
                const phTarget = 6.5 + Math.sin(Date.now() / (1000 * 60 * 60 * 24)) * 0.3; // daily oscillation
                currentValues.ph = smoothTowardTarget(
                    currentValues.ph, phTarget,
                    MAX_CHANGE.ph, 0.02,
                    RANGES.ph.min, RANGES.ph.max
                );
            }

            const data = new SensorData({
                temperature: currentValues.temperature,
                humidity: currentValues.humidity,
                ph: currentValues.ph,
                soilMoisture: currentValues.soilMoisture,
                cropType: activeCrop,
                createdAt: new Date()
            });

            await data.save();

            io.emit('sensorUpdate', data);

            await checkAlerts(data, io);

        } catch (error) {
            console.error('Simulation Error:', error);
        }
    }, 5000);
};

// Export activeCrop setter for API
const setActiveCrop = (crop) => {
    if (CROPS[crop]) {
        activeCrop = crop;
        console.log(`Switched simulation target to ${crop}`);
    }
};

module.exports = { startSimulation, setActiveCrop };

