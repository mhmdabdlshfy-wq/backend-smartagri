const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

// GET /messages/:userId - Get conversation with a specific user
router.get('/messages/:userId', protect, async (req, res) => {
    try {
        const messages = await Message.find({
            $or: [
                { sender: req.user._id, receiver: req.params.userId },
                { sender: req.params.userId, receiver: req.user._id }
            ]
        })
            .populate('sender', 'username fullName role')
            .populate('receiver', 'username fullName role')
            .sort({ createdAt: 1 })
            .limit(100);

        // Mark unread messages as read
        await Message.updateMany(
            { sender: req.params.userId, receiver: req.user._id, read: false },
            { read: true }
        );

        res.json(messages);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// POST /messages - Send a message
router.post('/messages', protect, async (req, res) => {
    const { receiver, content } = req.body;

    if (!receiver || !content) {
        return res.status(400).json({ message: 'Receiver and content are required' });
    }

    try {
        const msg = await Message.create({
            sender: req.user._id,
            receiver,
            content
        });

        const populated = await Message.findById(msg._id)
            .populate('sender', 'username fullName role')
            .populate('receiver', 'username fullName role');

        res.status(201).json(populated);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// GET /messages/contacts/list - Get users I can message
router.get('/contacts/list', protect, async (req, res) => {
    try {
        let filter = {};
        // Engineers talk to farmers and vice versa
        if (req.user.role === 'engineer') {
            filter.role = 'farmer';
        } else if (req.user.role === 'farmer') {
            filter.role = 'engineer';
        }
        // Admin can talk to anyone

        const contacts = await User.find(filter).select('username fullName role');

        // Get unread count per contact
        const contactsWithUnread = await Promise.all(contacts.map(async (contact) => {
            const unreadCount = await Message.countDocuments({
                sender: contact._id,
                receiver: req.user._id,
                read: false
            });
            return {
                _id: contact._id,
                username: contact.username,
                fullName: contact.fullName,
                role: contact.role,
                unreadCount
            };
        }));

        res.json(contactsWithUnread);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;
