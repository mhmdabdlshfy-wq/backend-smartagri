const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Seed Default Accounts (Removed for Serverless compatibility, run manually or locally if needed)

// Register (with role selection)
router.post('/register', async (req, res) => {
    const { username, password, role, fullName } = req.body;
    if (!username || !password) return res.status(400).json({ message: 'Username and password are required' });

    const allowedRoles = ['farmer', 'engineer', 'admin'];
    const userRole = allowedRoles.includes(role) ? role : 'farmer';

    try {
        const existingUser = await User.findOne({ username });
        if (existingUser) return res.status(400).json({ message: 'User already exists' });

        const user = await User.create({
            username,
            password,
            role: userRole,
            fullName: fullName || username
        });

        const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '24h' });
        res.json({
            token,
            user: { id: user._id, username: user.username, role: user.role, fullName: user.fullName }
        });
    } catch (err) {
        console.error('Register Error:', err);
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
});

// Login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: 'All fields are required' });

    try {
        const user = await User.findOne({ username });
        if (!user) return res.status(400).json({ message: 'Invalid credentials' });

        const isMatch = await user.matchPassword(password);
        if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

        console.log(`✅ Login: ${user.username} (${user.role})`);
        const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '24h' });
        res.json({
            token,
            user: { id: user._id, username: user.username, role: user.role, fullName: user.fullName }
        });
    } catch (err) {
        console.error('Login Error:', err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// Get current user
router.get('/me', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ message: 'No token' });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select('-password');
        if (!user) return res.status(404).json({ message: 'User not found' });

        res.json({ id: user._id, username: user.username, role: user.role, fullName: user.fullName });
    } catch (err) {
        res.status(401).json({ message: 'Invalid token' });
    }
});

// Get users list (for task assignment)
router.get('/users', async (req, res) => {
    try {
        const { role } = req.query;
        const filter = role ? { role } : {};
        const users = await User.find(filter).select('-password').sort({ username: 1 });
        res.json(users);
    } catch (err) {
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;
