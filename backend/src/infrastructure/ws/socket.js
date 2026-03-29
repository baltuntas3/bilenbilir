const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

const { createRoomHandler, createGameHandler, endAnsweringLocks, nextQuestionLocks } = require('../../api/handlers');
const { autoAdvanceToResults } = require('../../api/handlers/socketHandlerUtils');
const { RoomUseCases, GameUseCases } = require('../../application/use-cases');
const { roomRepository, gameSessionRepository } = require('../repositories');
const { mongoQuizRepository } = require('../repositories/MongoQuizRepository');
const { RoomCleanupService } = require('../services/RoomCleanupService');
const { GameTimerService } = require('../services/GameTimerService');
const { socketRateLimiter } = require('../../api/middlewares/socketRateLimiter');
const { checkOrigin } = require('../../shared/config/cors');

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
 * @throws {Error} If JWT_SECRET is not configured (critical misconfiguration)
 */
const verifySocketToken = (token) => {
  if (!token) return null;

  const JWT_SECRET = process.env.JWT_SECRET;
  if (!JWT_SECRET) {
    // Critical misconfiguration - should fail loudly like authMiddleware does
    throw new Error('JWT_SECRET environment variable is not set. Authentication is not possible.');
  }

  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
};

const initializeSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: checkOrigin,
      methods: ['GET', 'POST']
    }
  });

  // Socket.io authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

    try {
      // Verify token if provided (optional for players, required for hosts)
      const user = verifySocketToken(token);

      // Attach user info to socket for later use
      socket.user = user;
      socket.isAuthenticated = !!user;

      next();
    } catch (error) {
      // JWT_SECRET not configured - critical error
      console.error('[Socket] Authentication error:', error.message);
      next(new Error('Server authentication configuration error'));
    }
  });

  // Initialize timer service
  timerService = new GameTimerService(io);

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id, socket.isAuthenticated && socket.user ? `(authenticated: ${socket.user.userId})` : '(guest)');

    // Register handlers
    createRoomHandler(io, socket, roomUseCases, timerService, gameUseCases);
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
            playerCount: result.playerCount,
            connectedPlayerCount: result.connectedPlayerCount,
            disconnected: true,
            reason: 'connection_lost'
          });

          // Auto-advance if remaining connected players have all answered
          if (result.shouldAutoAdvance) {
            await autoAdvanceToResults({ io, pin: result.pin, endAnsweringLocks, timerService, gameUseCases });
          }
        } else if (result.type === 'spectator_disconnected') {
          io.to(result.pin).emit('spectator_left', {
            spectatorId: result.spectator.id,
            nickname: result.spectator.nickname,
            spectatorCount: result.spectatorCount
          });
        }
      } catch (error) {
        console.error('Disconnect handler error:', error.message);
      }
    });
  });

  // Start room cleanup service with injected dependencies
  cleanupService = new RoomCleanupService(roomRepository, io, {
    roomUseCases,
    gameUseCases,
    timerService,
    autoAdvanceToResults,
    endAnsweringLocks,
    managedLocks: [endAnsweringLocks, nextQuestionLocks],
    hostGracePeriod: 300000,   // 5 minutes - match RoomUseCases
    playerGracePeriod: 120000, // 2 minutes
    spectatorGracePeriod: 120000
  });
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

module.exports = { initializeSocket, getIO, stopCleanupService, stopTimerService, stopRateLimiter, getTimerService, gameUseCases };
