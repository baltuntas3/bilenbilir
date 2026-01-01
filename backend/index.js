require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const connectDB = require('./src/infrastructure/db/connection');
const { initializeSocket } = require('./src/infrastructure/ws/socket');
const { quizRoutes, authRoutes, gameRoutes } = require('./src/api/routes');
const { errorHandler } = require('./src/api/middlewares/errorHandler');
const { sanitize } = require('./src/api/middlewares/sanitizeMiddleware');
const { emailService } = require('./src/infrastructure/services');

const app = express();
const server = http.createServer(app);

// MongoDB connection
connectDB();

// Email service initialization
emailService.initialize();

// WebSocket initialization
const io = initializeSocket(server);

// Middleware
app.use(cors());
app.use(express.json());
app.use(sanitize); // XSS protection - sanitize all inputs

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'Bilen Bilir API' });
});

app.use('/api/auth', authRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/games', gameRoutes);

// Global error handler (must be last middleware)
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = { app, server, io };
