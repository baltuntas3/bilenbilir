const { handleSocketError } = require('../middlewares/errorHandler');
const { ConflictError, UnauthorizedError } = require('../../shared/errors');
const { sanitizeObject, sanitizeNickname } = require('../../shared/utils/sanitize');
const { socketRateLimiter } = require('../middlewares/socketRateLimiter');

/**
 * Room WebSocket Handler
 * Handles room creation, joining, and leaving
 */
const createRoomHandler = (io, socket, roomUseCases, timerService = null) => {
  /**
   * Rate limit check helper
   * @private
   */
  const checkRateLimit = (eventName) => {
    const result = socketRateLimiter.checkLimit(socket.id, eventName);
    if (!result.allowed) {
      socket.emit('error', {
        error: 'Too many requests',
        retryAfter: result.retryAfter
      });
      return false;
    }
    return true;
  };

  /**
   * Ensure socket is authenticated (has valid JWT)
   * Required for host operations
   * @private
   */
  const requireAuth = () => {
    if (!socket.isAuthenticated || !socket.user) {
      throw new UnauthorizedError('Authentication required for this action');
    }
    return socket.user;
  };

  /**
   * Ensure socket is not already in a room
   * @private
   */
  const ensureNotInRoom = async () => {
    const existingRoom = await roomUseCases.findRoomBySocketId({ socketId: socket.id });
    if (existingRoom) {
      throw new ConflictError('Already in a room. Leave current room first.');
    }
  };

  // Host creates a room (requires authentication)
  socket.on('create_room', async (data) => {
    try {
      // Rate limit check
      if (!checkRateLimit('create_room')) return;

      const user = requireAuth(); // JWT required for host
      const { quizId } = data || {};
      await ensureNotInRoom();

      const result = await roomUseCases.createRoom({
        hostId: socket.id,
        hostUserId: user.userId, // Track authenticated user
        quizId
      });

      socket.join(result.room.pin);

      socket.emit('room_created', {
        pin: result.room.pin,
        hostToken: result.hostToken,
        quizTitle: result.quiz.title,
        totalQuestions: result.quiz.getTotalQuestions()
      });
    } catch (error) {
      handleSocketError(socket, error);
    }
  });

  // Player joins a room
  socket.on('join_room', async (data) => {
    try {
      // Rate limit check
      if (!checkRateLimit('join_room')) return;

      const { pin, nickname } = sanitizeObject(data || {});
      await ensureNotInRoom();

      // Validate and sanitize nickname
      const sanitizedNickname = sanitizeNickname(nickname);
      if (!sanitizedNickname) {
        socket.emit('error', { error: 'Invalid nickname format' });
        return;
      }

      const result = await roomUseCases.joinRoom({
        pin,
        nickname: sanitizedNickname,
        socketId: socket.id
      });

      socket.join(pin);

      socket.emit('room_joined', {
        pin,
        playerId: result.player.id,
        playerToken: result.playerToken,
        nickname: result.player.nickname
      });

      io.to(pin).emit('player_joined', {
        player: {
          id: result.player.id,
          nickname: result.player.nickname
        },
        playerCount: result.room.getPlayerCount()
      });
    } catch (error) {
      handleSocketError(socket, error);
    }
  });

  // Player or host leaves room
  socket.on('leave_room', async (data) => {
    try {
      const { pin } = data || {};

      const { room } = await roomUseCases.getRoom({ pin });

      // If host is leaving, close the room
      if (room.isHost(socket.id)) {
        await roomUseCases.closeRoom({
          pin,
          requesterId: socket.id
        });

        io.to(pin).emit('room_closed', { reason: 'host_left' });
        io.in(pin).socketsLeave(pin);
        return;
      }

      // Player leaving
      const result = await roomUseCases.leaveRoom({
        pin,
        socketId: socket.id
      });

      socket.leave(pin);

      io.to(pin).emit('player_left', {
        socketId: socket.id,
        playerCount: result.room.getPlayerCount()
      });
    } catch (error) {
      handleSocketError(socket, error);
    }
  });

  // Get players list
  socket.on('get_players', async (data) => {
    try {
      const { pin } = data || {};

      const result = await roomUseCases.getPlayers({ pin });

      socket.emit('players_list', {
        players: result.players.map(p => ({
          id: p.id,
          nickname: p.nickname
        }))
      });
    } catch (error) {
      handleSocketError(socket, error);
    }
  });

  // Host closes room
  socket.on('close_room', async (data) => {
    try {
      const { pin } = data || {};

      await roomUseCases.closeRoom({
        pin,
        requesterId: socket.id
      });

      io.to(pin).emit('room_closed');
      io.in(pin).socketsLeave(pin);
    } catch (error) {
      handleSocketError(socket, error);
    }
  });

  // Host reconnects to room
  socket.on('reconnect_host', async (data) => {
    try {
      // Rate limit check
      if (!checkRateLimit('reconnect_host')) return;

      const { pin, hostToken } = data || {};

      // Early token format validation
      if (!hostToken || typeof hostToken !== 'string' || hostToken.trim().length === 0) {
        socket.emit('error', { error: 'Host token is required' });
        return;
      }

      const result = await roomUseCases.reconnectHost({
        pin,
        hostToken,
        newSocketId: socket.id
      });

      socket.join(pin);

      socket.emit('host_reconnected', {
        pin: result.room.pin,
        state: result.room.state,
        playerCount: result.room.getPlayerCount(),
        currentQuestionIndex: result.room.currentQuestionIndex
      });

      socket.to(pin).emit('host_returned');
    } catch (error) {
      handleSocketError(socket, error);
    }
  });

  // Player reconnects to room
  socket.on('reconnect_player', async (data) => {
    try {
      // Rate limit check
      if (!checkRateLimit('reconnect_player')) return;

      const { pin, playerToken } = data || {};

      // Early token format validation
      if (!playerToken || typeof playerToken !== 'string' || playerToken.trim().length === 0) {
        socket.emit('error', { error: 'Player token is required' });
        return;
      }

      const result = await roomUseCases.reconnectPlayer({
        pin,
        playerToken,
        newSocketId: socket.id
      });

      socket.join(pin);

      // Get timer sync data if in answering phase
      const timerSync = timerService ? timerService.getTimerSync(pin) : null;

      socket.emit('player_reconnected', {
        pin: result.room.pin,
        playerId: result.player.id,
        nickname: result.player.nickname,
        score: result.player.score,
        state: result.room.state,
        currentQuestionIndex: result.room.currentQuestionIndex,
        timerSync, // null if not in answering phase or no timer
        playerToken: result.newPlayerToken // New rotated token for security
      });

      socket.to(pin).emit('player_returned', {
        playerId: result.player.id,
        nickname: result.player.nickname
      });
    } catch (error) {
      handleSocketError(socket, error);
    }
  });

  // ==================== KICK/BAN EVENTS ====================

  // Host kicks a player
  socket.on('kick_player', async (data) => {
    try {
      if (!checkRateLimit('kick_player')) return;
      requireAuth();

      const { pin, playerId } = data || {};

      const result = await roomUseCases.kickPlayer({
        pin,
        playerId,
        requesterId: socket.id
      });

      // Notify kicked player
      const kickedSocket = io.sockets.sockets.get(result.player.socketId);
      if (kickedSocket) {
        kickedSocket.emit('you_were_kicked', { reason: 'kicked' });
        kickedSocket.leave(pin);
      }

      // Notify room
      io.to(pin).emit('player_kicked', {
        playerId: result.player.id,
        nickname: result.player.nickname,
        playerCount: result.room.getPlayerCount()
      });
    } catch (error) {
      handleSocketError(socket, error);
    }
  });

  // Host bans a player
  socket.on('ban_player', async (data) => {
    try {
      if (!checkRateLimit('ban_player')) return;
      requireAuth();

      const { pin, playerId } = data || {};

      const result = await roomUseCases.banPlayer({
        pin,
        playerId,
        requesterId: socket.id
      });

      // Notify banned player
      const bannedSocket = io.sockets.sockets.get(result.player.socketId);
      if (bannedSocket) {
        bannedSocket.emit('you_were_kicked', { reason: 'banned' });
        bannedSocket.leave(pin);
      }

      // Notify room
      io.to(pin).emit('player_banned', {
        playerId: result.player.id,
        nickname: result.player.nickname,
        playerCount: result.room.getPlayerCount()
      });
    } catch (error) {
      handleSocketError(socket, error);
    }
  });

  // Host unbans a nickname
  socket.on('unban_nickname', async (data) => {
    try {
      if (!checkRateLimit('unban_nickname')) return;
      requireAuth();

      const { pin, nickname } = data || {};

      await roomUseCases.unbanNickname({
        pin,
        nickname,
        requesterId: socket.id
      });

      socket.emit('nickname_unbanned', { nickname });
    } catch (error) {
      handleSocketError(socket, error);
    }
  });

  // Get banned nicknames
  socket.on('get_banned_nicknames', async (data) => {
    try {
      const { pin } = data || {};

      const result = await roomUseCases.getBannedNicknames({ pin });

      socket.emit('banned_nicknames', {
        bannedNicknames: result.bannedNicknames
      });
    } catch (error) {
      handleSocketError(socket, error);
    }
  });

  // ==================== SPECTATOR EVENTS ====================

  // Join as spectator
  // Note: Spectators do not require authentication by design (guests can watch)
  // Audit logging is enabled for tracking purposes
  socket.on('join_as_spectator', async (data) => {
    try {
      if (!checkRateLimit('join_as_spectator')) return;

      const { pin, nickname } = sanitizeObject(data || {});
      await ensureNotInRoom();

      // Audit log for spectator joins (authenticated status tracked for security review)
      console.log(`[Spectator] Join attempt: pin=${pin}, nickname=${nickname}, authenticated=${socket.isAuthenticated}, socketId=${socket.id}`);

      const sanitizedNickname = sanitizeNickname(nickname);
      if (!sanitizedNickname) {
        socket.emit('error', { error: 'Invalid nickname format' });
        return;
      }

      const result = await roomUseCases.joinAsSpectator({
        pin,
        nickname: sanitizedNickname,
        socketId: socket.id
      });

      socket.join(pin);

      socket.emit('room_joined_spectator', {
        pin,
        spectatorId: result.spectator.id,
        spectatorToken: result.spectatorToken, // Token for reconnection
        nickname: result.spectator.nickname,
        state: result.room.state,
        playerCount: result.room.getPlayerCount(),
        spectatorCount: result.room.getSpectatorCount()
      });

      io.to(pin).emit('spectator_joined', {
        spectator: {
          id: result.spectator.id,
          nickname: result.spectator.nickname
        },
        spectatorCount: result.room.getSpectatorCount()
      });
    } catch (error) {
      handleSocketError(socket, error);
    }
  });

  // Leave as spectator
  socket.on('leave_spectator', async (data) => {
    try {
      const { pin } = data || {};

      const result = await roomUseCases.leaveAsSpectator({
        pin,
        socketId: socket.id
      });

      socket.leave(pin);

      io.to(pin).emit('spectator_left', {
        socketId: socket.id,
        spectatorCount: result.room.getSpectatorCount()
      });
    } catch (error) {
      handleSocketError(socket, error);
    }
  });

  // Spectator reconnects to room
  socket.on('reconnect_spectator', async (data) => {
    try {
      if (!checkRateLimit('reconnect_spectator')) return;

      const { pin, spectatorToken } = data || {};

      // Early token format validation
      if (!spectatorToken || typeof spectatorToken !== 'string' || spectatorToken.trim().length === 0) {
        socket.emit('error', { error: 'Spectator token is required' });
        return;
      }

      const result = await roomUseCases.reconnectSpectator({
        pin,
        spectatorToken,
        newSocketId: socket.id
      });

      socket.join(pin);

      socket.emit('spectator_reconnected', {
        pin: result.room.pin,
        spectatorId: result.spectator.id,
        nickname: result.spectator.nickname,
        state: result.room.state,
        playerCount: result.room.getPlayerCount(),
        spectatorCount: result.room.getSpectatorCount(),
        spectatorToken: result.newSpectatorToken // New rotated token for security
      });

      socket.to(pin).emit('spectator_returned', {
        spectatorId: result.spectator.id,
        nickname: result.spectator.nickname
      });
    } catch (error) {
      handleSocketError(socket, error);
    }
  });

  // Get spectators list
  socket.on('get_spectators', async (data) => {
    try {
      const { pin } = data || {};

      const result = await roomUseCases.getSpectators({ pin });

      socket.emit('spectators_list', {
        spectators: result.spectators.map(s => ({
          id: s.id,
          nickname: s.nickname
        }))
      });
    } catch (error) {
      handleSocketError(socket, error);
    }
  });
};

module.exports = { createRoomHandler };
