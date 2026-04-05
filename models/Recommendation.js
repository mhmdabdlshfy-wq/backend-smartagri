const mongoose = require('mongoose');

/**
 * Recommendation Model
 * Engineer-created recommendations based on sensor readings.
 * Clearly tracks: which engineer created it, which farmer's data triggered it,
 * and which farmers should receive it.
 */
const RecommendationSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    content: {
        type: String,
        required: true
    },
    category: {
        type: String,
        enum: ['irrigation', 'fertilizer', 'pest_control', 'harvesting', 'soil', 'general'],
        default: 'general'
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'medium'
    },
    // Which crop this recommendation is about
    crop: {
        type: String,
        default: ''
    },
    // Current sensor snapshot when recommendation was made
    sensorSnapshot: {
        temperature: Number,
        humidity: Number,
        ph: Number,
        soilMoisture: Number
    },
    // Engineer who created this recommendation
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // Which farmer's data triggered this recommendation (optional)
    sourcefarmer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    // Which farmers should see this (empty = all farmers)
    targetFarmers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    acknowledged: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    }
});

module.exports = mongoose.model('Recommendation', RecommendationSchema);

