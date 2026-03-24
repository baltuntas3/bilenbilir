const { handleSocketError } = require('../middlewares/errorHandler');
const { ConflictError } = require('../../shared/errors');
const { sanitizeObject, sanitizeNickname } = require('../../shared/utils/sanitize');
const { createRateLimiter, createAuthChecker, toPlayerDTO, toPlayerQuestionDTO, toShowResultsDTO, validateToken, autoAdvanceToResults, buildShowResultsPayload, buildLeaderboardPayload, buildPodiumPayload } = require('./socketHandlerUtils');
const { endAnsweringLocks } = require('./gameHandler');

/**
 * Map team data for client consumption
 * @param {Team} team - Team entity
 * @returns {Object} Sanitized team data
 */
const toTeamDTO = (team) => ({
  id: team.id,
  name: team.name,
  color: team.color,
  playerIds: [...team.playerIds],
  playerCount: team.getPlayerCount()
});

/**
 * Room WebSocket Handler
 * Handles room creation, joining, and leaving
 */
const createRoomHandler = (io, socket, roomUseCases, timerService = null, gameUseCases = null) => {
  const checkRateLimit = createRateLimiter(socket);
  const requireAuth = createAuthChecker(socket);
  const sendAck = (ack, payload) => {
    if (typeof ack === 'function') ack(payload);
  };

  /**
   * Build spectator-safe game snapshot payload for join/reconnect.
   * Keeps a single source of truth for spectator state restoration.
   * @private
   */
  const buildSpectatorSnapshot = (room) => {
    const payload = {
      state: room.state,
      playerCount: room.getPlayerCount(),
      spectatorCount: room.getSpectatorCount()
    };

    const snapshot = room.getQuizSnapshot();
    if (!snapshot) return payload;

    payload.currentQuestionIndex = room.currentQuestionIndex;
    payload.totalQuestions = snapshot.getTotalQuestions();

    const question = snapshot.getQuestion(room.currentQuestionIndex);
    if (question) {
      payload.currentQuestion = toPlayerQuestionDTO(question.getHostData());
    }

    if (timerService && room.state === 'ANSWERING_PHASE') {
      const timerSync = timerService.getTimerSync(room.pin);
      if (timerSync) payload.timerSync = timerSync;
      payload.answeredCount = room.getAnsweredCount();
      payload.totalPlayersInPhase = room.answeringPhasePlayerCount;
    }

    if (room.state === 'SHOW_RESULTS') {
      Object.assign(payload, buildShowResultsPayload(room, snapshot));
    }

    if (room.state === 'LEADERBOARD') {
      Object.assign(payload, buildLeaderboardPayload(room));
    }

    if (room.state === 'PAUSED') {
      payload.pausedFromState = room.pausedFromState;
      Object.assign(payload, buildLeaderboardPayload(room));
      // Include SHOW_RESULTS data so clients can restore the correct phase on resume
      if (room.pausedFromState === 'SHOW_RESULTS') {
        Object.assign(payload, buildShowResultsPayload(room, snapshot));
      }
    }

    if (room.state === 'PODIUM') {
      Object.assign(payload, buildPodiumPayload(room));
    }

    return payload;
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

  /**
   * Stop timer and archive game before room deletion.
   * Called from any code path that closes/deletes a room.
   * @private
   */
  const cleanupBeforeRoomClose = async (pin, room) => {
    if (timerService) timerService.stopTimer(pin);
    if (gameUseCases && room && room.hasQuizSnapshot && room.hasQuizSnapshot()) {
      try {
        await gameUseCases.saveInterruptedGame({ pin, reason: 'host_closed' });
      } catch (err) {
        // Best-effort: archival failure should not block room closure
        console.error(`Failed to archive game on room close ${pin}:`, err.message);
      }
    }
  };

  /**
   * Check if all connected players have answered after a player is removed/left during ANSWERING_PHASE.
   * If so, auto-transition to results to prevent the game from getting stuck.
   * @private
   */
  const checkAllAnsweredAfterRemoval = async (room) => {
    if (!gameUseCases) return;
    if (room.state !== 'ANSWERING_PHASE') return;

    const noConnectedPlayers = room.getConnectedPlayerCount() === 0;
    if (!room.haveAllPlayersAnswered() && !noConnectedPlayers) return;

    await autoAdvanceToResults({ io, pin: room.pin, endAnsweringLocks, timerService, gameUseCases });
  };

  // Host creates a room (requires authentication)
  socket.on('create_room', async (data, ack) => {
    try {
      // Rate limit check
      if (!checkRateLimit('create_room')) {
        sendAck(ack, { ok: false, error: 'Too many requests' });
        return;
      }

      const user = requireAuth(); // JWT required for host
      const { quizId } = data || {};
      await ensureNotInRoom();

      const result = await roomUseCases.createRoom({
        hostId: socket.id,
        hostUserId: user.userId, // Track authenticated user
        quizId
      });

      socket.join(result.room.pin);

      const payload = {
        pin: result.room.pin,
        hostToken: result.hostToken,
        quizTitle: result.quiz.title,
        totalQuestions: result.quiz.getTotalQuestions()
      };
      socket.emit('room_created', payload);
      sendAck(ack, payload);
    } catch (error) {
      sendAck(ack, { ok: false, error: error.message });
      handleSocketError(socket, error);
    }
  });

  // Player joins a room
  socket.on('join_room', async (data, ack) => {
    try {
      // Rate limit check
      if (!checkRateLimit('join_room')) {
        sendAck(ack, { ok: false, error: 'Too many requests' });
        return;
      }

      const { pin, nickname } = sanitizeObject(data || {});
      await ensureNotInRoom();

      // Validate and sanitize nickname
      const sanitizedNickname = sanitizeNickname(nickname);
      if (!sanitizedNickname) {
        sendAck(ack, { ok: false, error: 'Invalid nickname format' });
        socket.emit('error', { error: 'Invalid nickname format' });
        return;
      }

      const result = await roomUseCases.joinRoom({
        pin,
        nickname: sanitizedNickname,
        socketId: socket.id
      });

      socket.join(pin);

      const payload = {
        pin,
        playerId: result.player.id,
        playerToken: result.playerToken,
        nickname: result.player.nickname
      };
      socket.emit('room_joined', payload);
      sendAck(ack, payload);

      io.to(pin).emit('player_joined', {
        player: {
          id: result.player.id,
          nickname: result.player.nickname
        },
        playerCount: result.room.getPlayerCount()
      });
    } catch (error) {
      sendAck(ack, { ok: false, error: error.message });
      handleSocketError(socket, error);
    }
  });

  // Player or host leaves room
  socket.on('leave_room', async (data, ack) => {
    try {
      if (!checkRateLimit('leave_room')) return;

      const { pin } = data || {};

      const { room } = await roomUseCases.getRoom({ pin });

      // If host is leaving, close the room
      if (room.isHost(socket.id)) {
        await cleanupBeforeRoomClose(pin, room);
        await roomUseCases.closeRoom({
          pin,
          requesterId: socket.id
        });

        io.to(pin).emit('room_closed', { reason: 'host_left' });
        io.in(pin).socketsLeave(pin);
        sendAck(ack, { success: true, role: 'host' });
        return;
      }

      if (!room.getPlayer(socket.id)) {
        sendAck(ack, { ok: false, error: 'Player is not in this room' });
        socket.emit('error', { error: 'Player is not in this room' });
        return;
      }

      // Player leaving
      const result = await roomUseCases.leaveRoom({
        pin,
        socketId: socket.id
      });

      socket.leave(pin);

      io.to(pin).emit('player_left', {
        playerId: result.removedPlayer?.id || socket.id,
        nickname: result.removedPlayer?.nickname || null,
        playerCount: result.room.getPlayerCount(),
        connectedPlayerCount: result.room.getConnectedPlayerCount(),
        disconnected: false
      });

      // Auto-advance if remaining connected players have all answered
      await checkAllAnsweredAfterRemoval(result.room);
      sendAck(ack, { success: true, role: 'player' });
    } catch (error) {
      sendAck(ack, { ok: false, error: error.message });
      handleSocketError(socket, error);
    }
  });

  // Get players list (requires room membership)
  socket.on('get_players', async (data, ack) => {
    try {
      if (!checkRateLimit('get_players')) {
        sendAck(ack, { ok: false, error: 'Too many requests' });
        return;
      }
      const { pin } = data || {};
      if (!pin || !socket.rooms.has(pin)) {
        sendAck(ack, { ok: false, error: 'Not in this room' });
        socket.emit('error', { error: 'Not in this room' });
        return;
      }

      const result = await roomUseCases.getPlayers({ pin });

      const payload = {
        players: result.players.map(p => ({
          id: p.id,
          nickname: p.nickname
        }))
      };
      socket.emit('players_list', payload);
      sendAck(ack, payload);
    } catch (error) {
      sendAck(ack, { ok: false, error: error.message });
      handleSocketError(socket, error);
    }
  });

  // Host closes room - requires authentication
  socket.on('close_room', async (data, ack) => {
    try {
      if (!checkRateLimit('close_room')) {
        sendAck(ack, { ok: false, error: 'Too many requests' });
        return;
      }
      requireAuth();

      const { pin } = data || {};

      const { room } = await roomUseCases.getRoom({ pin });
      await cleanupBeforeRoomClose(pin, room);

      await roomUseCases.closeRoom({
        pin,
        requesterId: socket.id
      });

      io.to(pin).emit('room_closed');
      io.in(pin).socketsLeave(pin);
      sendAck(ack, { success: true });
    } catch (error) {
      sendAck(ack, { ok: false, error: error.message });
      handleSocketError(socket, error);
    }
  });

  // Host reconnects to room
  socket.on('reconnect_host', async (data, ack) => {
    try {
      // Rate limit check
      if (!checkRateLimit('reconnect_host')) {
        sendAck(ack, { ok: false, error: 'Too many requests' });
        return;
      }

      const { pin, hostToken } = data || {};

      // Early token format validation
      if (!validateToken(socket, hostToken, 'Host token')) {
        sendAck(ack, { ok: false, error: 'Host token is required' });
        return;
      }

      const result = await roomUseCases.reconnectHost({
        pin,
        hostToken,
        newSocketId: socket.id
      });

      socket.join(pin);

      // Build full reconnect payload so host can resume from any state
      const reconnectPayload = {
        pin: result.room.pin,
        state: result.room.state,
        playerCount: result.room.getPlayerCount(),
        connectedPlayerCount: result.room.getConnectedPlayerCount(),
        currentQuestionIndex: result.room.currentQuestionIndex,
        players: result.room.getAllPlayers().map(toPlayerDTO),
      };

      // Include quiz snapshot data if game has started
      const snapshot = result.room.getQuizSnapshot();
      if (snapshot) {
        reconnectPayload.totalQuestions = snapshot.getTotalQuestions();
        const question = snapshot.getQuestion(result.room.currentQuestionIndex);
        if (question) {
          reconnectPayload.currentQuestion = question.getHostData();
        }
      }

      // Include timer sync if in answering phase
      if (timerService) {
        const timerSync = timerService.getTimerSync(pin);
        if (timerSync) {
          reconnectPayload.timerSync = timerSync;
        }
      }

      // Include phase-specific data
      const roomState = result.room.state;
      if (roomState === 'ANSWERING_PHASE') {
        reconnectPayload.answeredCount = result.room.getAnsweredCount();
        reconnectPayload.totalPlayers = result.room.answeringPhasePlayerCount;
      }

      if (roomState === 'SHOW_RESULTS' && snapshot) {
        Object.assign(reconnectPayload, buildShowResultsPayload(result.room, snapshot));
      }

      if (roomState === 'LEADERBOARD') {
        Object.assign(reconnectPayload, buildLeaderboardPayload(result.room));
      }

      if (roomState === 'PAUSED') {
        reconnectPayload.pausedFromState = result.room.pausedFromState;
        Object.assign(reconnectPayload, buildLeaderboardPayload(result.room));
        if (result.room.pausedFromState === 'SHOW_RESULTS' && snapshot) {
          Object.assign(reconnectPayload, buildShowResultsPayload(result.room, snapshot));
        }
      }

      if (roomState === 'PODIUM') {
        Object.assign(reconnectPayload, buildPodiumPayload(result.room));
      }

      socket.emit('host_reconnected', reconnectPayload);
      sendAck(ack, reconnectPayload);

      socket.to(pin).emit('host_returned');
    } catch (error) {
      sendAck(ack, { ok: false, error: error.message });
      handleSocketError(socket, error);
    }
  });

  // Player reconnects to room
  socket.on('reconnect_player', async (data, ack) => {
    try {
      // Rate limit check
      if (!checkRateLimit('reconnect_player')) {
        sendAck(ack, { ok: false, error: 'Too many requests' });
        return;
      }

      const { pin, playerToken } = data || {};

      // Early token format validation
      if (!validateToken(socket, playerToken, 'Player token')) {
        sendAck(ack, { ok: false, error: 'Player token is required' });
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

      // Retrieve current question from quiz snapshot for state restoration
      const snapshot = result.room.getQuizSnapshot();
      let currentQuestion = null;
      let totalQuestions = 0;
      if (snapshot) {
        totalQuestions = snapshot.getTotalQuestions();
        const question = snapshot.getQuestion(result.room.currentQuestionIndex);
        if (question) {
          currentQuestion = toPlayerQuestionDTO(question.getHostData());
        }
      }

      // Build reconnect payload with phase-specific data
      const reconnectPayload = {
        pin: result.room.pin,
        playerId: result.player.id,
        nickname: result.player.nickname,
        score: result.player.score,
        streak: result.player.streak,
        state: result.room.state,
        currentQuestionIndex: result.room.currentQuestionIndex,
        totalQuestions,
        currentQuestion,
        timerSync, // null if not in answering phase or no timer
        playerToken: result.newPlayerToken, // New rotated token for security
        powerUps: result.player.getAllPowerUps(),
        eliminatedOptions: result.player.eliminatedOptions || [],
        hasAnswered: result.player.hasAnswered(),
        answeredCount: result.room.getAnsweredCount(),
        totalPlayersInPhase: result.room.answeringPhasePlayerCount
      };

      // Include phase-specific data for reconnection
      const playerRoomState = result.room.state;

      if (playerRoomState === 'SHOW_RESULTS' && snapshot) {
        Object.assign(reconnectPayload, buildShowResultsPayload(result.room, snapshot));
      }

      if (playerRoomState === 'LEADERBOARD') {
        Object.assign(reconnectPayload, buildLeaderboardPayload(result.room));
      }

      if (playerRoomState === 'PAUSED') {
        reconnectPayload.pausedFromState = result.room.pausedFromState;
        Object.assign(reconnectPayload, buildLeaderboardPayload(result.room));
        if (result.room.pausedFromState === 'SHOW_RESULTS' && snapshot) {
          Object.assign(reconnectPayload, buildShowResultsPayload(result.room, snapshot));
        }
      }

      if (playerRoomState === 'PODIUM') {
        Object.assign(reconnectPayload, buildPodiumPayload(result.room));
      }

      socket.emit('player_reconnected', reconnectPayload);
      sendAck(ack, reconnectPayload);

      socket.to(pin).emit('player_returned', {
        playerId: result.player.id,
        nickname: result.player.nickname
      });
    } catch (error) {
      sendAck(ack, { ok: false, error: error.message });
      handleSocketError(socket, error);
    }
  });

  // ==================== HOST ROOM MANAGEMENT ====================

  // Get host's active room
  socket.on('get_my_room', async (_data, ack) => {
    try {
      if (!checkRateLimit('get_my_room')) {
        sendAck(ack, { ok: false, error: 'Too many requests' });
        return;
      }
      requireAuth();

      const result = await roomUseCases.getHostRoom({
        hostUserId: socket.user.userId
      });

      socket.emit('my_room', result); // null if no active room
      sendAck(ack, result);
    } catch (error) {
      sendAck(ack, { ok: false, error: error.message });
      handleSocketError(socket, error);
    }
  });

  // Force close host's existing room
  socket.on('force_close_room', async (_data, ack) => {
    try {
      if (!checkRateLimit('force_close_room')) {
        sendAck(ack, { ok: false, error: 'Too many requests' });
        return;
      }
      requireAuth();

      const hostRoom = await roomUseCases.getHostRoom({ hostUserId: socket.user.userId });
      if (!hostRoom) {
        const payload = { closed: false, reason: 'No active room found' };
        socket.emit('room_force_closed', payload);
        sendAck(ack, payload);
        return;
      }

      const { pin } = hostRoom;

      // Archive interrupted game BEFORE notifying/disconnecting players
      const { room } = await roomUseCases.getRoom({ pin });
      await cleanupBeforeRoomClose(pin, room);

      // Notify players and remove from channel
      io.to(pin).emit('room_closed', { reason: 'Host closed the room' });
      io.in(pin).socketsLeave(pin);

      // Delete room if saveInterruptedGame didn't already delete it
      const result = await roomUseCases.forceCloseHostRoom({
        hostUserId: socket.user.userId
      });

      const payload = { pin, ...result, closed: true };
      socket.emit('room_force_closed', payload);
      sendAck(ack, payload);
    } catch (error) {
      sendAck(ack, { ok: false, error: error.message });
      handleSocketError(socket, error);
    }
  });

  // ==================== LIGHTNING ROUND ====================

  // Host sets lightning round configuration
  socket.on('set_lightning_round', async (data, ack) => {
    try {
      if (!checkRateLimit('set_lightning_round')) {
        sendAck(ack, { ok: false, error: 'Too many requests' });
        return;
      }
      requireAuth();

      const { pin, enabled, questionCount } = data || {};

      await roomUseCases.setLightningRound({
        pin,
        enabled: !!enabled,
        questionCount: questionCount ? parseInt(questionCount, 10) : 3,
        requesterId: socket.id
      });

      io.to(pin).emit('lightning_round_updated', {
        enabled: !!enabled,
        questionCount: questionCount ? parseInt(questionCount, 10) : 3
      });
      sendAck(ack, { ok: true });
    } catch (error) {
      sendAck(ack, { ok: false, error: error.message });
      handleSocketError(socket, error);
    }
  });

  // ==================== KICK/BAN EVENTS ====================

  // Host kicks a player
  socket.on('kick_player', async (data, ack) => {
    try {
      if (!checkRateLimit('kick_player')) {
        sendAck(ack, { ok: false, error: 'Too many requests' });
        return;
      }
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
        playerCount: result.room.getPlayerCount(),
        connectedPlayerCount: result.room.getConnectedPlayerCount()
      });

      // Auto-advance if remaining connected players have all answered
      await checkAllAnsweredAfterRemoval(result.room);
      sendAck(ack, { ok: true });
    } catch (error) {
      sendAck(ack, { ok: false, error: error.message });
      handleSocketError(socket, error);
    }
  });

  // Host bans a player
  socket.on('ban_player', async (data, ack) => {
    try {
      if (!checkRateLimit('ban_player')) {
        sendAck(ack, { ok: false, error: 'Too many requests' });
        return;
      }
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
        playerCount: result.room.getPlayerCount(),
        connectedPlayerCount: result.room.getConnectedPlayerCount()
      });

      // Auto-advance if remaining connected players have all answered
      await checkAllAnsweredAfterRemoval(result.room);
      sendAck(ack, { ok: true });
    } catch (error) {
      sendAck(ack, { ok: false, error: error.message });
      handleSocketError(socket, error);
    }
  });

  // Host unbans a nickname
  socket.on('unban_nickname', async (data, ack) => {
    try {
      if (!checkRateLimit('unban_nickname')) {
        sendAck(ack, { ok: false, error: 'Too many requests' });
        return;
      }
      requireAuth();

      const { pin, nickname } = data || {};

      await roomUseCases.unbanNickname({
        pin,
        nickname,
        requesterId: socket.id
      });

      socket.emit('nickname_unbanned', { nickname });
      sendAck(ack, { ok: true });
    } catch (error) {
      sendAck(ack, { ok: false, error: error.message });
      handleSocketError(socket, error);
    }
  });

  // Get banned nicknames
  socket.on('get_banned_nicknames', async (data, ack) => {
    try {
      if (!checkRateLimit('get_banned_nicknames')) {
        sendAck(ack, { ok: false, error: 'Too many requests' });
        return;
      }
      const { pin } = data || {};

      const result = await roomUseCases.getBannedNicknames({ pin });

      const payload = {
        bannedNicknames: result.bannedNicknames
      };
      socket.emit('banned_nicknames', payload);
      sendAck(ack, payload);
    } catch (error) {
      sendAck(ack, { ok: false, error: error.message });
      handleSocketError(socket, error);
    }
  });

  // ==================== SPECTATOR EVENTS ====================

  // Join as spectator
  // Note: Spectators do not require authentication by design (guests can watch)
  // Audit logging is enabled for tracking purposes
  socket.on('join_as_spectator', async (data, ack) => {
    try {
      if (!checkRateLimit('join_as_spectator')) {
        sendAck(ack, { ok: false, error: 'Too many requests' });
        return;
      }

      const { pin, nickname } = sanitizeObject(data || {});
      await ensureNotInRoom();

      // Audit log for spectator joins (authenticated status tracked for security review)
      console.log(`[Spectator] Join attempt: pin=${pin}, nickname=${nickname}, authenticated=${socket.isAuthenticated}, socketId=${socket.id}`);

      const sanitizedNickname = sanitizeNickname(nickname);
      if (!sanitizedNickname) {
        sendAck(ack, { ok: false, error: 'Invalid nickname format' });
        socket.emit('error', { error: 'Invalid nickname format' });
        return;
      }

      const result = await roomUseCases.joinAsSpectator({
        pin,
        nickname: sanitizedNickname,
        socketId: socket.id
      });

      socket.join(pin);

      const payload = {
        pin,
        spectatorId: result.spectator.id,
        spectatorToken: result.spectatorToken, // Token for reconnection
        nickname: result.spectator.nickname,
        ...buildSpectatorSnapshot(result.room)
      };
      socket.emit('room_joined_spectator', payload);
      sendAck(ack, payload);

      io.to(pin).emit('spectator_joined', {
        spectator: {
          id: result.spectator.id,
          nickname: result.spectator.nickname
        },
        spectatorCount: result.room.getSpectatorCount()
      });
    } catch (error) {
      sendAck(ack, { ok: false, error: error.message });
      handleSocketError(socket, error);
    }
  });

  // Leave as spectator
  socket.on('leave_spectator', async (data) => {
    try {
      if (!checkRateLimit('leave_spectator')) return;
      const { pin } = data || {};

      const result = await roomUseCases.leaveAsSpectator({
        pin,
        socketId: socket.id
      });

      socket.leave(pin);

      io.to(pin).emit('spectator_left', {
        spectatorId: result.removedSpectator?.id || socket.id,
        nickname: result.removedSpectator?.nickname || null,
        spectatorCount: result.room.getSpectatorCount()
      });
    } catch (error) {
      handleSocketError(socket, error);
    }
  });

  // Spectator reconnects to room
  socket.on('reconnect_spectator', async (data, ack) => {
    try {
      if (!checkRateLimit('reconnect_spectator')) {
        sendAck(ack, { ok: false, error: 'Too many requests' });
        return;
      }

      const { pin, spectatorToken } = data || {};

      // Early token format validation
      if (!validateToken(socket, spectatorToken, 'Spectator token')) {
        sendAck(ack, { ok: false, error: 'Spectator token is required' });
        return;
      }

      const result = await roomUseCases.reconnectSpectator({
        pin,
        spectatorToken,
        newSocketId: socket.id
      });

      socket.join(pin);

      const payload = {
        pin: result.room.pin,
        spectatorId: result.spectator.id,
        nickname: result.spectator.nickname,
        spectatorToken: result.newSpectatorToken, // New rotated token for security
        ...buildSpectatorSnapshot(result.room)
      };
      socket.emit('spectator_reconnected', payload);
      sendAck(ack, payload);

      socket.to(pin).emit('spectator_returned', {
        spectatorId: result.spectator.id,
        nickname: result.spectator.nickname
      });
    } catch (error) {
      sendAck(ack, { ok: false, error: error.message });
      handleSocketError(socket, error);
    }
  });

  // Get spectators list (requires room membership)
  socket.on('get_spectators', async (data, ack) => {
    try {
      if (!checkRateLimit('get_spectators')) {
        sendAck(ack, { ok: false, error: 'Too many requests' });
        return;
      }
      const { pin } = data || {};
      if (!pin || !socket.rooms.has(pin)) {
        sendAck(ack, { ok: false, error: 'Not in this room' });
        socket.emit('error', { error: 'Not in this room' });
        return;
      }

      const result = await roomUseCases.getSpectators({ pin });

      const payload = {
        spectators: result.spectators.map(s => ({
          id: s.id,
          nickname: s.nickname
        }))
      };
      socket.emit('spectators_list', payload);
      sendAck(ack, payload);
    } catch (error) {
      sendAck(ack, { ok: false, error: error.message });
      handleSocketError(socket, error);
    }
  });

  // ==================== TEAM MODE EVENTS ====================

  // Host enables team mode
  socket.on('enable_team_mode', async (data, ack) => {
    try {
      if (!checkRateLimit('enable_team_mode')) {
        sendAck(ack, { ok: false, error: 'Too many requests' });
        return;
      }
      requireAuth();

      const { pin } = data || {};

      const result = await roomUseCases.enableTeamMode({
        pin,
        requesterId: socket.id
      });

      io.to(pin).emit('team_mode_updated', {
        teamMode: true,
        teams: result.room.getAllTeams().map(toTeamDTO)
      });
      sendAck(ack, { ok: true });
    } catch (error) {
      sendAck(ack, { ok: false, error: error.message });
      handleSocketError(socket, error);
    }
  });

  // Host disables team mode
  socket.on('disable_team_mode', async (data, ack) => {
    try {
      if (!checkRateLimit('disable_team_mode')) {
        sendAck(ack, { ok: false, error: 'Too many requests' });
        return;
      }
      requireAuth();

      const { pin } = data || {};

      await roomUseCases.disableTeamMode({
        pin,
        requesterId: socket.id
      });

      io.to(pin).emit('team_mode_updated', {
        teamMode: false,
        teams: []
      });
      sendAck(ack, { ok: true });
    } catch (error) {
      sendAck(ack, { ok: false, error: error.message });
      handleSocketError(socket, error);
    }
  });

  // Host adds a team
  socket.on('add_team', async (data, ack) => {
    try {
      if (!checkRateLimit('add_team')) {
        sendAck(ack, { ok: false, error: 'Too many requests' });
        return;
      }
      requireAuth();

      const { pin, name } = sanitizeObject(data || {});

      const result = await roomUseCases.addTeam({
        pin,
        name,
        requesterId: socket.id
      });

      io.to(pin).emit('teams_updated', {
        teams: result.room.getAllTeams().map(toTeamDTO)
      });
      sendAck(ack, { ok: true });
    } catch (error) {
      sendAck(ack, { ok: false, error: error.message });
      handleSocketError(socket, error);
    }
  });

  // Host removes a team
  socket.on('remove_team', async (data, ack) => {
    try {
      if (!checkRateLimit('remove_team')) {
        sendAck(ack, { ok: false, error: 'Too many requests' });
        return;
      }
      requireAuth();

      const { pin, teamId } = data || {};

      const result = await roomUseCases.removeTeam({
        pin,
        teamId,
        requesterId: socket.id
      });

      io.to(pin).emit('teams_updated', {
        teams: result.room.getAllTeams().map(toTeamDTO)
      });
      sendAck(ack, { ok: true });
    } catch (error) {
      sendAck(ack, { ok: false, error: error.message });
      handleSocketError(socket, error);
    }
  });

  // Assign player to team
  socket.on('assign_team', async (data, ack) => {
    try {
      if (!checkRateLimit('assign_team')) {
        sendAck(ack, { ok: false, error: 'Too many requests' });
        return;
      }
      requireAuth();

      const { pin, playerId, teamId } = data || {};

      const result = await roomUseCases.assignPlayerToTeam({
        pin,
        playerId,
        teamId,
        requesterId: socket.id
      });

      io.to(pin).emit('teams_updated', {
        teams: result.room.getAllTeams().map(toTeamDTO)
      });
      sendAck(ack, { ok: true });
    } catch (error) {
      sendAck(ack, { ok: false, error: error.message });
      handleSocketError(socket, error);
    }
  });
};

module.exports = { createRoomHandler };
