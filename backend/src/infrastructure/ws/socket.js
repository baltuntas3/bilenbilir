const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { createRoomHandler, createGameHandler } = require('../../api/handlers');
const { RoomUseCases, GameUseCases } = require('../../application/use-cases');
const { roomRepository, gameSessionRepository } = require('../repositories');
const { mongoQuizRepository } = require('../repositories/MongoQuizRepository');
const { RoomCleanupService } = require('../services/RoomCleanupService');
const { GameTimerService } = require('../services/GameTimerService');
const { socketRateLimiter } = require('../../api/middlewares/socketRateLimiter');

let io;
let cleanupService;
let timerService;

// Initialize use cases
const roomUseCases = new RoomUseCases(roomRepository, mongoQuizRepository);
const gameUseCases = new GameUseCases(roomRepository, mongoQuizRepository, gameSessionRepository);

/**
 * Verify JWT token for socket authentication
 * @param {string} token - JWT token
 * @returns {object|null} - Decoded user or null
 */
const verifySocketToken = (token) => {
  if (!token) return null;

  try {
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) return null;

    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
};

const initializeSocket = (server) => {
  const allowedOrigins = process.env.CLIENT_URL
    ? process.env.CLIENT_URL.split(',').map(url => url.trim())
    : ['http://localhost:5173'];

  io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST']
    }
  });

  // Socket.io authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

    // Verify token if provided (optional for players, required for hosts)
    const user = verifySocketToken(token);

    // Attach user info to socket for later use
    socket.user = user;
    socket.isAuthenticated = !!user;

    next();
  });

  // Initialize timer service
  timerService = new GameTimerService(io);

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id, socket.isAuthenticated ? `(authenticated: ${socket.user.userId})` : '(guest)');

    // Register handlers
    createRoomHandler(io, socket, roomUseCases, timerService);
    createGameHandler(io, socket, gameUseCases, timerService);

    socket.on('disconnect', async () => {
      console.log('User disconnected:', socket.id);

      // Clean up rate limiter entries for this socket
      socketRateLimiter.removeSocket(socket.id);

      try {
        const result = await roomUseCases.handleDisconnect({ socketId: socket.id });

        if (result.type === 'host_disconnected') {
          // Notify players that host disconnected (but room still exists for reconnection)
          io.to(result.pin).emit('host_disconnected', {
            message: 'Host disconnected. Waiting for reconnection...'
          });
        } else if (result.type === 'player_disconnected') {
          io.to(result.pin).emit('player_left', {
            playerId: result.player.id,
            nickname: result.player.nickname,
            playerCount: result.playerCount
          });
        }
      } catch (error) {
        console.error('Disconnect handler error:', error.message);
      }
    });
  });

  // Start room cleanup service
  cleanupService = new RoomCleanupService(roomRepository, io);
  cleanupService.start();

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
};

const stopCleanupService = () => {
  if (cleanupService) {
    cleanupService.stop();
  }
};

const stopTimerService = () => {
  if (timerService) {
    timerService.stopAll();
  }
};

const stopRateLimiter = () => {
  socketRateLimiter.stop();
};

const getTimerService = () => {
  return timerService;
};

module.exports = { initializeSocket, getIO, stopCleanupService, stopTimerService, stopRateLimiter, getTimerService };
