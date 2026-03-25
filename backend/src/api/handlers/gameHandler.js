const { handleSocketError } = require('../middlewares/errorHandler');
const { createRateLimiter, createAuthChecker, toPlayerDTO, toPlayerQuestionDTO, toShowResultsDTO, autoAdvanceToResults } = require('./socketHandlerUtils');
const { MAX_TIMER_EXTENSION_MS, LOCK_TIMEOUT_MS } = require('../../shared/config/constants');
const { LockManager } = require('../../shared/utils/LockManager');
const { DEFAULT_POWER_UPS } = require('../../domain/value-objects/PowerUp');

/**
 * Game WebSocket Handler
 * Handles game flow: start, questions, answers, results
 */
// Per-room lock to prevent concurrent endAnsweringPhase calls (timer expiry vs all-answered race)
const endAnsweringLocks = new LockManager(LOCK_TIMEOUT_MS);

const createGameHandler = (io, socket, gameUseCases, timerService) => {
  const checkRateLimit = createRateLimiter(socket);
  const requireAuth = createAuthChecker(socket);
  const sendAck = (ack, payload) => {
    if (typeof ack === 'function') ack(payload);
  };

  // Host starts the game (requires authentication)
  socket.on('start_game', async (data, ack) => {
    try {
      // Rate limit check
      if (!checkRateLimit('start_game')) {
        sendAck(ack, { ok: false, error: 'Too many requests' });
        return;
      }

      requireAuth(); // JWT required for host
      const { pin, questionCount } = data || {};

      // Validate questionCount before passing to use case
      let parsedQuestionCount;
      if (questionCount !== undefined && questionCount !== null) {
        parsedQuestionCount = parseInt(questionCount, 10);
        if (!Number.isInteger(parsedQuestionCount) || parsedQuestionCount < 1) {
          sendAck(ack, { ok: false, error: 'Invalid question count' });
          return;
        }
      }

      const result = await gameUseCases.startGame({
        pin,
        requesterId: socket.id,
        questionCount: parsedQuestionCount
      });

      // Send to host with full question data
      socket.emit('game_started', {
        totalQuestions: result.totalQuestions,
        currentQuestion: result.currentQuestion,
        questionIndex: 0,
        powerUps: DEFAULT_POWER_UPS
      });

      // Send to players without answer
      socket.to(pin).emit('game_started', {
        totalQuestions: result.totalQuestions,
        currentQuestion: toPlayerQuestionDTO(result.currentQuestion),
        questionIndex: 0,
        powerUps: DEFAULT_POWER_UPS
      });
      sendAck(ack, { ok: true });
    } catch (error) {
      sendAck(ack, { ok: false, error: error.message });
      handleSocketError(socket, error);
    }
  });

  // Host triggers answering phase (after intro countdown) - requires authentication
  socket.on('start_answering', async (data, ack) => {
    try {
      // Rate limit check
      if (!checkRateLimit('start_answering')) {
        sendAck(ack, { ok: false, error: 'Too many requests' });
        return;
      }

      requireAuth(); // JWT required for host
      const { pin } = data || {};

      const result = await gameUseCases.startAnsweringPhase({
        pin,
        requesterId: socket.id
      });
      // Start server-side timer
      timerService.startTimer(pin, result.timeLimit, async () => {
        // Timer expired — emit time_expired before auto-advancing
        io.to(pin).emit('time_expired');
        await autoAdvanceToResults({ io, pin, endAnsweringLocks, timerService, gameUseCases });
      });

      io.to(pin).emit('answering_started', {
        timeLimit: result.timeLimit,
        optionCount: result.optionCount,
        isLightning: result.isLightning || false
      });
      sendAck(ack, { ok: true });
    } catch (error) {
      sendAck(ack, { ok: false, error: error.message });
      handleSocketError(socket, error);
    }
  });

  // Player submits answer
  socket.on('submit_answer', async (data, ack) => {
    try {
      // Rate limit check
      if (!checkRateLimit('submit_answer')) {
        if (typeof ack === 'function') ack({ ok: false, error: 'Too many requests' });
        return;
      }

      const { pin, answerIndex } = data || {};

      // SECURITY: Only use pin and answerIndex from client
      // Elapsed time MUST be calculated server-side to prevent manipulation
      // Client could send fake elapsedTimeMs to get maximum score

      let elapsedTimeMs;
      try {
        elapsedTimeMs = gameUseCases.getServerElapsedTime(timerService, pin);
      } catch (err) {
        if (typeof ack === 'function') ack({ ok: false, error: err.message });
        socket.emit('error', { error: err.message });
        return;
      }

      // Pass effective timer duration so scoring accounts for TIME_EXTENSION and lightning rounds
      const timerSync = timerService.getTimerSync(pin);
      const effectiveTimeLimitMs = timerSync?.duration || null;

      const result = await gameUseCases.submitAnswer({
        pin,
        socketId: socket.id,
        answerIndex,
        elapsedTimeMs,
        effectiveTimeLimitMs
      });

      socket.emit('answer_received', {
        isCorrect: result.answer.isCorrect,
        score: result.actualScore,
        totalScore: result.player.score,
        streak: result.player.streak,
        streakBonus: result.answer.streakBonus
      });
      if (typeof ack === 'function') {
        ack({
          isCorrect: result.answer.isCorrect,
          score: result.actualScore,
          totalScore: result.player.score,
          streak: result.player.streak,
          streakBonus: result.answer.streakBonus
        });
      }

      io.to(pin).emit('answer_count_updated', {
        answeredCount: result.answeredCount,
        totalPlayersInPhase: result.totalPlayers,
        connectedPlayerCount: result.connectedPlayerCount
      });

      if (result.allAnswered) {
        await autoAdvanceToResults({ io, pin, endAnsweringLocks, timerService, gameUseCases });
      }
    } catch (error) {
      if (typeof ack === 'function') ack({ ok: false, error: error.message });
      handleSocketError(socket, error);
    }
  });

  // Host ends answering phase (timer expired or manual) - requires authentication
  socket.on('end_answering', async (data, ack) => {
    try {
      // Rate limit check
      if (!checkRateLimit('end_answering')) {
        sendAck(ack, { ok: false, error: 'Too many requests' });
        return;
      }

      requireAuth(); // JWT required for host
      const { pin } = data || {};

      timerService.stopTimer(pin);

      // Check lock to prevent race with timer callback auto-transition
      if (!endAnsweringLocks.acquire(pin)) {
        sendAck(ack, { ok: true, alreadyEnding: true });
        return;
      }

      try {
        const result = await gameUseCases.endAnsweringPhase({
          pin,
          requesterId: socket.id
        });

        io.to(pin).emit('show_results', toShowResultsDTO(result));
        sendAck(ack, { ok: true });
      } finally {
        endAnsweringLocks.release(pin);
      }
    } catch (error) {
      sendAck(ack, { ok: false, error: error.message });
      handleSocketError(socket, error);
    }
  });

  // Host shows leaderboard - requires authentication
  socket.on('show_leaderboard', async (data, ack) => {
    try {
      // Rate limit check
      if (!checkRateLimit('show_leaderboard')) {
        sendAck(ack, { ok: false, error: 'Too many requests' });
        return;
      }

      requireAuth(); // JWT required for host
      const { pin } = data || {};

      const result = await gameUseCases.showLeaderboard({
        pin,
        requesterId: socket.id
      });

      const leaderboardPayload = {
        leaderboard: result.leaderboard.map(toPlayerDTO)
      };
      if (result.teamLeaderboard) {
        leaderboardPayload.teamLeaderboard = result.teamLeaderboard;
      }
      io.to(pin).emit('leaderboard', leaderboardPayload);
      sendAck(ack, { ok: true });
    } catch (error) {
      sendAck(ack, { ok: false, error: error.message });
      handleSocketError(socket, error);
    }
  });

  // Host moves to next question - requires authentication
  socket.on('next_question', async (data, ack) => {
    try {
      // Rate limit check
      if (!checkRateLimit('next_question')) {
        sendAck(ack, { ok: false, error: 'Too many requests' });
        return;
      }

      requireAuth(); // JWT required for host
      const { pin } = data || {};

      const result = await gameUseCases.nextQuestion({
        pin,
        requesterId: socket.id
      });

      if (result.isGameOver) {
        const gameOverPayload = {
          podium: result.podium.map(toPlayerDTO),
          leaderboard: result.room.getLeaderboard().map(toPlayerDTO)
        };
        if (result.teamPodium) {
          gameOverPayload.teamPodium = result.teamPodium;
        }
        if (result.room.isTeamMode()) {
          gameOverPayload.teamLeaderboard = result.room.getTeamLeaderboard();
        }
        io.to(pin).emit('game_over', gameOverPayload);

        // Archive game but keep room in PODIUM state for late reconnects/get_results.
        // RoomCleanupService will remove the room after idle timeout.
        let archiveFailed = false;
        try {
          await gameUseCases.archiveGame({ pin });
        } catch (archiveError) {
          archiveFailed = true;
          console.error('Failed to archive game:', archiveError.message);
        }
        sendAck(ack, { ok: true, isGameOver: true, archiveFailed });
      } else {
        // Send to host with full question data
        socket.emit('question_intro', {
          questionIndex: result.questionIndex,
          totalQuestions: result.totalQuestions,
          currentQuestion: result.currentQuestion
        });

        // Send to players without correct answer
        socket.to(pin).emit('question_intro', {
          questionIndex: result.questionIndex,
          totalQuestions: result.totalQuestions,
          currentQuestion: toPlayerQuestionDTO(result.currentQuestion)
        });
        sendAck(ack, { ok: true, isGameOver: false });
      }
    } catch (error) {
      sendAck(ack, { ok: false, error: error.message });
      handleSocketError(socket, error);
    }
  });

  // Get final results - rate limited to prevent spam
  socket.on('get_results', async (data, ack) => {
    try {
      if (!checkRateLimit('get_results')) {
        if (typeof ack === 'function') ack({ ok: false, error: 'Too many requests' });
        return;
      }

      const { pin } = data || {};

      const result = await gameUseCases.getResults({ pin });

      const finalResultsPayload = {
        leaderboard: result.leaderboard.map(toPlayerDTO),
        podium: result.podium.map(toPlayerDTO)
      };
      if (result.teamLeaderboard) {
        finalResultsPayload.teamLeaderboard = result.teamLeaderboard;
      }
      if (result.teamPodium) {
        finalResultsPayload.teamPodium = result.teamPodium;
      }
      socket.emit('final_results', finalResultsPayload);
      if (typeof ack === 'function') ack(finalResultsPayload);
    } catch (error) {
      if (typeof ack === 'function') ack({ ok: false, error: error.message });
      handleSocketError(socket, error);
    }
  });

  // Request timer sync (for clients that need to resync) - rate limited
  socket.on('request_timer_sync', (data, ack) => {
    try {
      if (!checkRateLimit('request_timer_sync')) {
        if (typeof ack === 'function') ack({ ok: false, error: 'Too many requests' });
        return;
      }

      const { pin } = data || {};

      const timerSync = timerService.getTimerSync(pin);

      if (timerSync) {
        socket.emit('timer_sync', timerSync);
        if (typeof ack === 'function') ack(timerSync);
      } else {
        const payload = { active: false };
        socket.emit('timer_sync', payload);
        if (typeof ack === 'function') ack(payload);
      }
    } catch (error) {
      if (typeof ack === 'function') ack({ ok: false, error: error.message });
      handleSocketError(socket, error);
    }
  });

  // ==================== POWER-UP EVENTS ====================

  socket.on('use_power_up', async (data, ack) => {
    try {
      if (!checkRateLimit('use_power_up')) {
        sendAck(ack, { ok: false, error: 'Too many requests' });
        return;
      }

      const { pin, powerUpType } = data || {};

      // Pre-check: reject TIME_EXTENSION if timer can't be extended further
      if (powerUpType === 'TIME_EXTENSION') {
        const remaining = timerService.getRemainingExtensionBudget(pin);
        if (remaining <= 0) {
          sendAck(ack, { ok: false, error: 'Time extension limit reached for this question' });
          return;
        }
      }

      const { result, emitActions } = await gameUseCases.usePowerUp({
        pin,
        socketId: socket.id,
        powerUpType
      });

      // Execute emit actions from strategy — no if/else needed
      if (emitActions.playerEmits) {
        emitActions.playerEmits.forEach(e => socket.emit(e.event, e.data));
      }
      if (emitActions.roomEmits) {
        emitActions.roomEmits.forEach(e => io.to(pin).emit(e.event, e.data));
      }
      let timerActionFailed = false;
      if (emitActions.timerAction) {
        const { method, args } = emitActions.timerAction;
        const allowedTimerMethods = ['extendTimer', 'stopTimer'];
        if (allowedTimerMethods.includes(method) && Array.isArray(args)) {
          const safeArgs = args
            .filter(a => typeof a === 'number')
            .map(a => Math.min(Math.max(0, a), MAX_TIMER_EXTENSION_MS));
          try {
            const timerResult = timerService[method](pin, ...safeArgs);
            if (method === 'extendTimer' && timerResult === 0) {
              timerActionFailed = true;
            }
          } catch (timerErr) {
            timerActionFailed = true;
            console.error(`Timer action '${method}' failed for pin ${pin}:`, timerErr.message);
          }
        }
      }

      if (timerActionFailed) {
        // Refund the consumed power-up since timer action failed
        let refundSuccess = false;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            await gameUseCases.refundPowerUp({ pin, socketId: socket.id, powerUpType });
            refundSuccess = true;
            break;
          } catch (refundErr) {
            console.error(`Refund attempt ${attempt + 1} failed for pin ${pin}:`, refundErr.message);
          }
        }
        if (!refundSuccess) {
          console.error(`CRITICAL: Power-up refund permanently failed for pin ${pin}, socket ${socket.id}, type ${powerUpType}`);
        }
        sendAck(ack, { ok: false, error: 'Time extension limit reached for this question' });
        return;
      }

      io.to(pin).emit('power_up_used', {
        nickname: result.nickname,
        powerUpType
      });
      sendAck(ack, { ok: true, powerUpType });
    } catch (error) {
      sendAck(ack, { ok: false, error: error.message });
      handleSocketError(socket, error);
    }
  });

  // ==================== PAUSE/RESUME EVENTS ====================

  // Host pauses the game (only from LEADERBOARD state)
  socket.on('pause_game', async (data, ack) => {
    try {
      if (!checkRateLimit('pause_game')) {
        sendAck(ack, { ok: false, error: 'Too many requests' });
        return;
      }
      requireAuth();

      const { pin } = data || {};

      const result = await gameUseCases.pauseGame({
        pin,
        requesterId: socket.id
      });

      // Stop timer only after pause succeeds to prevent desync on failure
      timerService.stopTimer(pin);

      io.to(pin).emit('game_paused', {
        pausedAt: result.pausedAt
      });
      sendAck(ack, { ok: true });
    } catch (error) {
      sendAck(ack, { ok: false, error: error.message });
      handleSocketError(socket, error);
    }
  });

  // Host resumes the game
  socket.on('resume_game', async (data, ack) => {
    try {
      if (!checkRateLimit('resume_game')) {
        sendAck(ack, { ok: false, error: 'Too many requests' });
        return;
      }
      requireAuth();

      const { pin } = data || {};

      const result = await gameUseCases.resumeGame({
        pin,
        requesterId: socket.id
      });

      io.to(pin).emit('game_resumed', {
        state: result.resumedState,
        pauseDuration: result.pauseDuration
      });
      sendAck(ack, { ok: true });
    } catch (error) {
      sendAck(ack, { ok: false, error: error.message });
      handleSocketError(socket, error);
    }
  });

  // ==================== LIVE REACTIONS ====================

  const ALLOWED_REACTIONS = ['\u{1F44F}', '\u{1F389}', '\u{1F62E}', '\u{1F602}', '\u{1F525}', '\u{2764}\u{FE0F}', '\u{1F44D}', '\u{1F4AF}'];

  socket.on('send_reaction', async (data) => {
    try {
      if (!checkRateLimit('send_reaction')) return;

      const { pin, reaction } = data || {};

      if (!pin || !reaction) return;
      if (!ALLOWED_REACTIONS.includes(reaction)) return;

      // Verify socket is in the room
      const rooms = socket.rooms;
      if (!rooms || !rooms.has(pin)) return;

      // Look up nickname from room (player, spectator, or host)
      let nickname = 'Anonymous';
      try {
        const resolved = await gameUseCases.getNicknameForSocket(pin, socket.id);
        if (resolved) {
          nickname = resolved;
        }
      } catch (err) {
        console.warn(`[send_reaction] Failed to resolve nickname for socket ${socket.id}:`, err.message);
      }

      // Broadcast to entire room (including sender)
      io.to(pin).emit('reaction_received', {
        nickname,
        reaction,
        timestamp: Date.now()
      });
    } catch (error) {
      handleSocketError(socket, error);
    }
  });
};

module.exports = { createGameHandler, endAnsweringLocks };
