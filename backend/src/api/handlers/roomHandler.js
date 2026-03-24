const { handleSocketError } = require('../middlewares/errorHandler');
const { ConflictError, ValidationError, NotFoundError } = require('../../shared/errors');
const { sanitizeObject, sanitizeNickname } = require('../../shared/utils/sanitize');
const { createRateLimiter, createAuthChecker, toPlayerDTO, toPlayerQuestionDTO, toShowResultsDTO, validateToken } = require('./socketHandlerUtils');
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
   * Check if all connected players have answered after a player is removed/left during ANSWERING_PHASE.
   * If so, auto-transition to results to prevent the game from getting stuck.
   * @private
   */
  const checkAllAnsweredAfterRemoval = async (room) => {
    if (!gameUseCases) return;
    const pin = room.pin;
    const isAnswering = room.state === 'ANSWERING_PHASE';
    if (!isAnswering) return;

    const noConnectedPlayers = room.getConnectedPlayerCount() === 0;
    const allAnswered = room.haveAllPlayersAnswered() || noConnectedPlayers;
    if (!allAnswered) return;

    if (!endAnsweringLocks.acquire(pin)) return;
    try {
      if (timerService) timerService.stopTimer(pin);
      io.to(pin).emit('all_players_answered');
      const endResult = await gameUseCases.endAnsweringPhase({ pin, requesterId: 'server' });
      if (endResult) {
        io.to(pin).emit('show_results', toShowResultsDTO(endResult));
      }
    } catch (err) {
      const isExpected = err instanceof ValidationError || err instanceof NotFoundError || err instanceof ConflictError;
      if (!isExpected) {
        console.error('Auto-end after player removal error:', err.message);
      }
    } finally {
      endAnsweringLocks.release(pin);
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
      if (!checkRateLimit('leave_room')) return;

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
        playerId: result.removedPlayer?.id || socket.id,
        nickname: result.removedPlayer?.nickname || null,
        playerCount: result.room.getPlayerCount()
      });

      // Auto-advance if remaining connected players have all answered
      await checkAllAnsweredAfterRemoval(result.room);
    } catch (error) {
      handleSocketError(socket, error);
    }
  });

  // Get players list (requires room membership)
  socket.on('get_players', async (data) => {
    try {
      if (!checkRateLimit('get_players')) return;
      const { pin } = data || {};
      if (!pin || !socket.rooms.has(pin)) {
        socket.emit('error', { error: 'Not in this room' });
        return;
      }

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

  // Host closes room - requires authentication
  socket.on('close_room', async (data) => {
    try {
      if (!checkRateLimit('close_room')) return;
      requireAuth();

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
      if (!validateToken(socket, hostToken, 'Host token')) return;

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
      if (roomState === 'SHOW_RESULTS' && snapshot) {
        const question = snapshot.getQuestion(result.room.currentQuestionIndex);
        if (question) {
          const { distribution, correctCount } = result.room.getAnswerDistribution(
            question.options.length,
            (idx) => question.isCorrect(idx)
          );
          reconnectPayload.correctAnswerIndex = question.correctAnswerIndex;
          reconnectPayload.answerDistribution = distribution;
          reconnectPayload.explanation = question.explanation || null;
          reconnectPayload.answeredCount = result.room.getAnsweredCount();
        }
      }

      if (roomState === 'LEADERBOARD' || roomState === 'PAUSED') {
        reconnectPayload.leaderboard = result.room.getLeaderboard().map(toPlayerDTO);
        if (result.room.isTeamMode()) {
          reconnectPayload.teamLeaderboard = result.room.getTeamLeaderboard();
        }
      }

      if (roomState === 'PODIUM') {
        reconnectPayload.podium = result.room.getPodium().map(toPlayerDTO);
        reconnectPayload.leaderboard = result.room.getLeaderboard().map(toPlayerDTO);
        if (result.room.isTeamMode()) {
          reconnectPayload.teamPodium = result.room.getTeamPodium();
        }
      }

      socket.emit('host_reconnected', reconnectPayload);

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
      if (!validateToken(socket, playerToken, 'Player token')) return;

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
        totalPlayersInPhase: result.room.getConnectedPlayerCount()
      };

      // Include results data if in SHOW_RESULTS or later phases
      if (result.room.state === 'SHOW_RESULTS' && snapshot) {
        const question = snapshot.getQuestion(result.room.currentQuestionIndex);
        if (question) {
          const { distribution, correctCount } = result.room.getAnswerDistribution(
            question.options.length,
            (idx) => question.isCorrect(idx)
          );
          reconnectPayload.correctAnswerIndex = question.correctAnswerIndex;
          reconnectPayload.answerDistribution = distribution;
          reconnectPayload.correctCount = correctCount;
          reconnectPayload.explanation = question.explanation || null;
        }
      }

      socket.emit('player_reconnected', reconnectPayload);

      socket.to(pin).emit('player_returned', {
        playerId: result.player.id,
        nickname: result.player.nickname
      });
    } catch (error) {
      handleSocketError(socket, error);
    }
  });

  // ==================== HOST ROOM MANAGEMENT ====================

  // Get host's active room
  socket.on('get_my_room', async () => {
    try {
      if (!checkRateLimit('get_my_room')) return;
      requireAuth();

      const result = await roomUseCases.getHostRoom({
        hostUserId: socket.user.userId
      });

      socket.emit('my_room', result); // null if no active room
    } catch (error) {
      handleSocketError(socket, error);
    }
  });

  // Force close host's existing room
  socket.on('force_close_room', async () => {
    try {
      if (!checkRateLimit('force_close_room')) return;
      requireAuth();

      const result = await roomUseCases.forceCloseHostRoom({
        hostUserId: socket.user.userId
      });

      if (result.closed) {
        // Notify all players in the room
        io.to(result.pin).emit('room_closed', { reason: 'Host closed the room' });
        io.in(result.pin).socketsLeave(result.pin);
      }

      socket.emit('room_force_closed', result);
    } catch (error) {
      handleSocketError(socket, error);
    }
  });

  // ==================== LIGHTNING ROUND ====================

  // Host sets lightning round configuration
  socket.on('set_lightning_round', async (data) => {
    try {
      if (!checkRateLimit('set_lightning_round')) return;
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

      // Auto-advance if remaining connected players have all answered
      await checkAllAnsweredAfterRemoval(result.room);
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

      // Auto-advance if remaining connected players have all answered
      await checkAllAnsweredAfterRemoval(result.room);
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
      if (!checkRateLimit('get_banned_nicknames')) return;
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
      if (!checkRateLimit('leave_spectator')) return;
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
      if (!validateToken(socket, spectatorToken, 'Spectator token')) return;

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

  // Get spectators list (requires room membership)
  socket.on('get_spectators', async (data) => {
    try {
      if (!checkRateLimit('get_spectators')) return;
      const { pin } = data || {};
      if (!pin || !socket.rooms.has(pin)) {
        socket.emit('error', { error: 'Not in this room' });
        return;
      }

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

  // ==================== TEAM MODE EVENTS ====================

  // Host enables team mode
  socket.on('enable_team_mode', async (data) => {
    try {
      if (!checkRateLimit('enable_team_mode')) return;
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
    } catch (error) {
      handleSocketError(socket, error);
    }
  });

  // Host disables team mode
  socket.on('disable_team_mode', async (data) => {
    try {
      if (!checkRateLimit('disable_team_mode')) return;
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
    } catch (error) {
      handleSocketError(socket, error);
    }
  });

  // Host adds a team
  socket.on('add_team', async (data) => {
    try {
      if (!checkRateLimit('add_team')) return;
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
    } catch (error) {
      handleSocketError(socket, error);
    }
  });

  // Host removes a team
  socket.on('remove_team', async (data) => {
    try {
      if (!checkRateLimit('remove_team')) return;
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
    } catch (error) {
      handleSocketError(socket, error);
    }
  });

  // Assign player to team
  socket.on('assign_team', async (data) => {
    try {
      if (!checkRateLimit('assign_team')) return;
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
    } catch (error) {
      handleSocketError(socket, error);
    }
  });
};

module.exports = { createRoomHandler };
