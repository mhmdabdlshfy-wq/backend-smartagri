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

// Database Connection
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/smart-agri')
    .then(() => {
        console.log('MongoDB Connected');
        // Start Simulation only after DB is ready
        startSimulation(io);
    })
    .catch(err => console.error('MongoDB Connection Error:', err));


// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/sensors', require('./routes/sensors'));
app.use('/api/collab', require('./routes/tasks'));
app.use('/api/collab', require('./routes/messages'));

// Health check route for Vercel
app.get('/', (req, res) => {
    res.json({ message: 'Smart Agriculture API is running successfully on Vercel!' });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
