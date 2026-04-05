const mongoose = require('mongoose');

/**
 * Task Model
 * Represents an assignment from an engineer to a farmer.
 * Tasks can be: irrigation, fertilizer, inspection, maintenance, custom
 */
const TaskSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        default: ''
    },
    type: {
        type: String,
        enum: ['irrigation', 'fertilizer', 'inspection', 'maintenance', 'custom'],
        default: 'custom'
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    status: {
        type: String,
        enum: ['pending', 'in_progress', 'completed', 'cancelled'],
        default: 'pending'
    },
    // Who created it (engineer)
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // Who it's assigned to (farmer)
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // Farmer can add a note when completing
    completionNote: {
        type: String,
        default: ''
    },
    completedAt: {
        type: Date
    },
    dueDate: {
        type: Date
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    }
});

module.exports = mongoose.model('Task', TaskSchema);
