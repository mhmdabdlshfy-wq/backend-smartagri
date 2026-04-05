/**
 * Crop Configuration Database
 * Each crop has ideal ranges, stress tolerances, and risk sensitivity factors.
 * Used by: Health Score Engine, Risk Assessment, Irrigation Engine, Alert System
 */
module.exports = {
    Wheat: {
        name: 'Wheat',
        emoji: '🌾',
        temp: { min: 15, max: 25, ideal: 20, stressTolerance: 5 },
        humidity: { min: 40, max: 60, ideal: 50, stressTolerance: 15 },
        ph: { min: 6.0, max: 7.0, ideal: 6.5, stressTolerance: 0.8 },
        moisture: { min: 30, max: 50, ideal: 40, stressTolerance: 15 },
        riskSensitivity: { disease: 0.7, heat: 0.8, water: 0.9 },
        waterNeed: 450,  // mm per season
        growthStages: ['Germination', 'Tillering', 'Flowering', 'Grain Fill', 'Maturity']
    },
    Corn: {
        name: 'Corn',
        emoji: '🌽',
        temp: { min: 18, max: 30, ideal: 24, stressTolerance: 6 },
        humidity: { min: 50, max: 70, ideal: 60, stressTolerance: 15 },
        ph: { min: 5.8, max: 7.0, ideal: 6.5, stressTolerance: 0.8 },
        moisture: { min: 40, max: 60, ideal: 50, stressTolerance: 12 },
        riskSensitivity: { disease: 0.6, heat: 0.9, water: 0.85 },
        waterNeed: 500,
        growthStages: ['Emergence', 'V6 Stage', 'Tasseling', 'Silking', 'Maturity']
    },
    Tomato: {
        name: 'Tomato',
        emoji: '🍅',
        temp: { min: 20, max: 28, ideal: 24, stressTolerance: 4 },
        humidity: { min: 60, max: 80, ideal: 70, stressTolerance: 10 },
        ph: { min: 6.0, max: 6.8, ideal: 6.4, stressTolerance: 0.5 },
        moisture: { min: 50, max: 70, ideal: 60, stressTolerance: 10 },
        riskSensitivity: { disease: 0.9, heat: 0.85, water: 0.8 },
        waterNeed: 600,
        growthStages: ['Seedling', 'Vegetative', 'Flowering', 'Fruiting', 'Harvest']
    },
    Potato: {
        name: 'Potato',
        emoji: '🥔',
        temp: { min: 15, max: 22, ideal: 18, stressTolerance: 4 },
        humidity: { min: 50, max: 70, ideal: 60, stressTolerance: 12 },
        ph: { min: 4.8, max: 6.5, ideal: 5.5, stressTolerance: 0.7 },
        moisture: { min: 40, max: 60, ideal: 50, stressTolerance: 12 },
        riskSensitivity: { disease: 0.85, heat: 0.7, water: 0.9 },
        waterNeed: 500,
        growthStages: ['Sprouting', 'Vegetative', 'Tuber Init', 'Tuber Bulking', 'Maturity']
    },
    Rice: {
        name: 'Rice',
        emoji: '🌾',
        temp: { min: 22, max: 32, ideal: 27, stressTolerance: 5 },
        humidity: { min: 70, max: 90, ideal: 80, stressTolerance: 10 },
        ph: { min: 5.5, max: 7.0, ideal: 6.2, stressTolerance: 0.6 },
        moisture: { min: 70, max: 90, ideal: 80, stressTolerance: 10 },
        riskSensitivity: { disease: 0.8, heat: 0.75, water: 0.6 },
        waterNeed: 1200,
        growthStages: ['Seedling', 'Tillering', 'Booting', 'Heading', 'Ripening']
    },
    Strawberry: {
        name: 'Strawberry',
        emoji: '🍓',
        temp: { min: 15, max: 26, ideal: 20, stressTolerance: 4 },
        humidity: { min: 60, max: 75, ideal: 68, stressTolerance: 10 },
        ph: { min: 5.5, max: 6.5, ideal: 6.0, stressTolerance: 0.5 },
        moisture: { min: 50, max: 65, ideal: 58, stressTolerance: 8 },
        riskSensitivity: { disease: 0.95, heat: 0.8, water: 0.85 },
        waterNeed: 500,
        growthStages: ['Planting', 'Runner Growth', 'Flowering', 'Fruiting', 'Dormancy']
    }
};
