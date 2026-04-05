const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const { Server } = require("socket.io");
const { startSimulation } = require('./utils/simulator');

const path = require('path');
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(express.json());

// Database Connection - Serverless Safe Pattern
let isConnected = false;
const connectDB = async () => {
    if (isConnected) return;
    console.log("Attempting to connect to:", process.env.MONGO_URI ? "URI EXISTS" : "URI MISSING");
    try {
        const db = await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/smart-agri', {
            serverSelectionTimeoutMS: 5000 // Fails quickly in 5 seconds instead of 30
        });
        isConnected = db.connections[0].readyState;
        console.log('MongoDB Connected Successfully');

        // Disable simulation in Serverless environments (Vercel) to prevent 10s Lambda timeouts
        if (process.env.NODE_ENV !== 'production') {
            startSimulation(io);
        }
    } catch (err) {
        console.error('Atlas Connection Error:', err.message);
        throw err; // Throw explicitly
    }
};

// Ensure DB is connected before handling ANY request
app.use(async (req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (err) {
        // This will print the EXACT error inside Postman!
        return res.status(500).json({
            message: 'Database Connection Failed',
            error: err.message
        });
    }
});


// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/sensors', require('./routes/sensors'));
app.use('/api/collab', require('./routes/tasks'));
app.use('/api/collab', require('./routes/messages'));

// Health check route for Vercel
app.get('/', (req, res) => {
    res.json({ message: 'Smart Agriculture API is running successfully on Vercel!' });
});

// For local testing vs Vercel
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

// Required for Vercel to work property
module.exports = app;
