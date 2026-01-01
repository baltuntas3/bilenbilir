require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const mongoose = require('mongoose');
const connectDB = require('./src/infrastructure/db/connection');
const { initializeSocket, stopCleanupService, stopTimerService, stopRateLimiter } = require('./src/infrastructure/ws/socket');
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

/**
 * Graceful shutdown handler
 * Properly closes all services and connections before exiting
 */
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  // Set a timeout for force shutdown if graceful fails
  const forceShutdownTimeout = setTimeout(() => {
    console.error('Graceful shutdown timed out. Forcing exit...');
    process.exit(1);
  }, 30000); // 30 second timeout

  try {
    // 1. Stop accepting new connections
    server.close(() => {
      console.log('HTTP server closed');
    });

    // 2. Stop all background services
    console.log('Stopping background services...');
    stopCleanupService();
    stopTimerService();
    stopRateLimiter();

    // 3. Close Socket.IO connections
    if (io) {
      io.disconnectSockets(true);
      console.log('Socket.IO connections closed');
    }

    // 4. Close MongoDB connection
    await mongoose.connection.close();
    console.log('MongoDB connection closed');

    // Clear force shutdown timeout
    clearTimeout(forceShutdownTimeout);

    console.log('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('Error during graceful shutdown:', error);
    clearTimeout(forceShutdownTimeout);
    process.exit(1);
  }
};

// Listen for shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions and rejections
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit on unhandled rejection, just log
});

module.exports = { app, server, io };
