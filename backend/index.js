require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const connectDB = require('./src/infrastructure/db/connection');
const { initializeSocket } = require('./src/infrastructure/ws/socket');
const { quizRoutes, authRoutes } = require('./src/api/routes');

const app = express();
const server = http.createServer(app);

// MongoDB connection
connectDB();

// WebSocket initialization
const io = initializeSocket(server);

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'Bilen Bilir API' });
});

app.use('/api/auth', authRoutes);
app.use('/api/quizzes', quizRoutes);

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = { app, server, io };
