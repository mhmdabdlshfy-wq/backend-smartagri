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

// ═══════════════════════════════════════════════════════════
// VERCEL-PROVEN MongoDB Connection Pattern
// Uses global cache to persist connection across Lambda calls
// ═══════════════════════════════════════════════════════════
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/smart-agri';

let cached = global.mongoose;
if (!cached) {
    cached = global.mongoose = { conn: null, promise: null };
}

async function connectDB() {
    // If we already have a live connection, reuse it
    if (cached.conn && mongoose.connection.readyState === 1) {
        return cached.conn;
    }

    // If a connection attempt is already in progress, wait for it
    if (!cached.promise) {
        console.log("Creating NEW MongoDB connection...");
        console.log("MONGO_URI exists:", !!process.env.MONGO_URI);

        const opts = {
            bufferCommands: false, // Disable mongoose buffering (fail fast)
            serverSelectionTimeoutMS: 5000,
        };

        cached.promise = mongoose.connect(MONGO_URI, opts).then((m) => {
            console.log("MongoDB Connected Successfully!");
            return m;
        });
    }

    try {
        cached.conn = await cached.promise;
    } catch (err) {
        // Reset promise so next request will retry
        cached.promise = null;
        console.error("MongoDB Connection FAILED:", err.message);
        throw err;
    }

    return cached.conn;
}

// Ensure DB is connected before handling ANY request
app.use(async (req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (err) {
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

// Health check route
app.get('/', (req, res) => {
    res.json({
        message: 'Smart Agriculture API is running!',
        dbState: mongoose.connection.readyState // 0=disconnected, 1=connected, 2=connecting
    });
});

// For local development only
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, async () => {
        console.log(`Server running on port ${PORT}`);
        await connectDB();
        startSimulation(io);
    });
}

// Required for Vercel serverless
module.exports = app;
