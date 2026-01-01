const { Server } = require('socket.io');
const { createRoomHandler, createGameHandler } = require('../../api/handlers');
const { RoomUseCases, GameUseCases } = require('../../application/use-cases');
const { roomRepository, quizRepository, gameSessionRepository } = require('../repositories');
const { RoomCleanupService } = require('../services/RoomCleanupService');
const { GameTimerService } = require('../services/GameTimerService');

let io;
let cleanupService;
let timerService;

// Initialize use cases
const roomUseCases = new RoomUseCases(roomRepository, quizRepository);
const gameUseCases = new GameUseCases(roomRepository, quizRepository, gameSessionRepository);

const initializeSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: 'http://localhost:5173',
      methods: ['GET', 'POST']
    }
  });

  // Initialize timer service
  timerService = new GameTimerService(io);

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Register handlers
    createRoomHandler(io, socket, roomUseCases);
    createGameHandler(io, socket, gameUseCases, timerService);

    socket.on('disconnect', async () => {
      console.log('User disconnected:', socket.id);

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

const getTimerService = () => {
  return timerService;
};

module.exports = { initializeSocket, getIO, stopCleanupService, stopTimerService, getTimerService };
