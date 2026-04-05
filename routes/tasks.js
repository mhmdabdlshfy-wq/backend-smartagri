const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const Recommendation = require('../models/Recommendation');
const { protect, authorize } = require('../middleware/auth');

// ──────────────────────────────────────────────
// TASKS
// ──────────────────────────────────────────────

// GET /tasks - Get tasks (filtered by role)
// Engineers see tasks they created; Farmers see tasks assigned to them
router.get('/tasks', protect, async (req, res) => {
    try {
        let filter = {};
        if (req.user.role === 'engineer') {
            filter.createdBy = req.user._id;
        } else if (req.user.role === 'farmer') {
            filter.assignedTo = req.user._id;
        }


        const { status } = req.query;
        if (status) filter.status = status;

        const tasks = await Task.find(filter)
            .populate('createdBy', 'username fullName role')
            .populate('assignedTo', 'username fullName role')
            .sort({ createdAt: -1 });

        res.json(tasks);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// POST /tasks - Create a task (engineer only)
router.post('/tasks', protect, authorize('engineer'), async (req, res) => {
    const { title, description, type, priority, assignedTo, dueDate } = req.body;

    if (!title || !assignedTo) {
        return res.status(400).json({ message: 'Title and assigned farmer are required' });
    }

    try {
        const task = await Task.create({
            title,
            description,
            type: type || 'custom',
            priority: priority || 'medium',
            createdBy: req.user._id,
            assignedTo,
            dueDate: dueDate ? new Date(dueDate) : undefined
        });

        const populated = await Task.findById(task._id)
            .populate('createdBy', 'username fullName role')
            .populate('assignedTo', 'username fullName role');

        res.status(201).json(populated);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// PUT /tasks/:id/status - Update task status (farmer can complete, engineer can cancel)
router.put('/tasks/:id/status', protect, async (req, res) => {
    const { status, completionNote } = req.body;

    try {
        const task = await Task.findById(req.params.id);
        if (!task) return res.status(404).json({ message: 'Task not found' });

        // Farmers can only move to in_progress or completed
        if (req.user.role === 'farmer') {
            if (!['in_progress', 'completed'].includes(status)) {
                return res.status(403).json({ message: 'Farmers can only start or complete tasks' });
            }
            if (task.assignedTo.toString() !== req.user._id.toString()) {
                return res.status(403).json({ message: 'Not your task' });
            }
        }

        task.status = status;
        if (status === 'completed') {
            task.completedAt = new Date();
            task.completionNote = completionNote || '';
        }

        await task.save();

        const populated = await Task.findById(task._id)
            .populate('createdBy', 'username fullName role')
            .populate('assignedTo', 'username fullName role');

        res.json(populated);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// GET /tasks/stats - Task statistics for engineer dashboard
router.get('/tasks/stats', protect, authorize('engineer'), async (req, res) => {
    try {
        const filter = { createdBy: req.user._id };
        const total = await Task.countDocuments(filter);
        const pending = await Task.countDocuments({ ...filter, status: 'pending' });
        const inProgress = await Task.countDocuments({ ...filter, status: 'in_progress' });
        const completed = await Task.countDocuments({ ...filter, status: 'completed' });

        res.json({ total, pending, inProgress, completed });
    } catch (err) {
        res.status(500).json({ message: 'Server Error' });
    }
});


// ──────────────────────────────────────────────
// RECOMMENDATIONS
// ──────────────────────────────────────────────

// GET /recommendations
router.get('/recommendations', protect, async (req, res) => {
    try {
        let filter = {};
        if (req.user.role === 'farmer') {
            // Farmer sees recommendations targeted at them or at all farmers
            filter.$or = [
                { targetFarmers: { $size: 0 } },
                { targetFarmers: req.user._id }
            ];
        } else if (req.user.role === 'engineer') {
            filter.createdBy = req.user._id;
        }

        const recs = await Recommendation.find(filter)
            .populate('createdBy', 'username fullName role')
            .populate('targetFarmers', 'username fullName role')
            .populate('sourcefarmer', 'username fullName role')
            .sort({ createdAt: -1 })
            .limit(20);

        res.json(recs);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// POST /recommendations (engineer only)
router.post('/recommendations', protect, authorize('engineer'), async (req, res) => {
    const { title, content, category, priority, sensorSnapshot, targetFarmers, crop, sourcefarmer } = req.body;

    if (!title || !content) {
        return res.status(400).json({ message: 'Title and content are required' });
    }

    try {
        const rec = await Recommendation.create({
            title,
            content,
            category: category || 'general',
            priority: priority || 'medium',
            crop: crop || '',
            sensorSnapshot,
            createdBy: req.user._id,
            sourcefarmer: sourcefarmer || undefined,
            targetFarmers: targetFarmers || []
        });

        const populated = await Recommendation.findById(rec._id)
            .populate('createdBy', 'username fullName role')
            .populate('targetFarmers', 'username fullName role')
            .populate('sourcefarmer', 'username fullName role');

        res.status(201).json(populated);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// PUT /recommendations/:id/acknowledge (farmer acknowledges)
router.put('/recommendations/:id/acknowledge', protect, async (req, res) => {
    try {
        const rec = await Recommendation.findById(req.params.id);
        if (!rec) return res.status(404).json({ message: 'Recommendation not found' });

        if (!rec.acknowledged.includes(req.user._id)) {
            rec.acknowledged.push(req.user._id);
            await rec.save();
        }

        res.json(rec);
    } catch (err) {
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;
