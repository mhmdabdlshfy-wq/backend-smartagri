const mongoose = require('mongoose');

const SensorDataSchema = new mongoose.Schema({
    temperature: {
        type: Number,
        required: true
    },
    humidity: {
        type: Number,
        required: true
    },
    ph: {
        type: Number,
        required: true
    },
    soilMoisture: {
        type: Number,
        required: true
    },
    cropType: {
        type: String,
        default: 'General'
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    }
});

module.exports = mongoose.model('SensorData', SensorDataSchema);
