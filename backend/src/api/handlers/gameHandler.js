const { handleSocketError } = require('../middlewares/errorHandler');
const { createRateLimiter, createAuthChecker, toPlayerDTO, toPlayerQuestionDTO, toShowResultsDTO } = require('./socketHandlerUtils');
const { ValidationError, NotFoundError, ConflictError } = require('../../shared/errors');

/**
 * Game WebSocket Handler
 * Handles game flow: start, questions, answers, results
 */
// Per-room lock to prevent concurrent endAnsweringPhase calls (timer expiry vs all-answered race)
const endAnsweringLocks = new Set();

const createGameHandler = (io, socket, gameUseCases, timerService) => {
  const checkRateLimit = createRateLimiter(socket);
  const requireAuth = createAuthChecker(socket);

  // Host starts the game (requires authentication)
  socket.on('start_game', async (data) => {
    try {
      // Rate limit check
      if (!checkRateLimit('start_game')) return;

      requireAuth(); // JWT required for host
      const { pin, questionCount } = data || {};

      const result = await gameUseCases.startGame({
        pin,
        requesterId: socket.id,
        questionCount: questionCount ? parseInt(questionCount, 10) : undefined
      });

      // Send to host with full question data
      socket.emit('game_started', {
        totalQuestions: result.totalQuestions,
        currentQuestion: result.currentQuestion,
        questionIndex: 0
      });

      // Send to players without answer
      socket.to(pin).emit('game_started', {
        totalQuestions: result.totalQuestions,
        currentQuestion: toPlayerQuestionDTO(result.currentQuestion),
        questionIndex: 0
      });
    } catch (error) {
      handleSocketError(socket, error);
    }
  });

  // Host triggers answering phase (after intro countdown) - requires authentication
  socket.on('start_answering', async (data) => {
    try {
      // Rate limit check
      if (!checkRateLimit('start_answering')) return;

      requireAuth(); // JWT required for host
      const { pin } = data || {};

      const result = await gameUseCases.startAnsweringPhase({
        pin,
        requesterId: socket.id
      });
      // Start server-side timer
      timerService.startTimer(pin, result.timeLimit, async () => {
        // Lock prevents race with all-answered auto-transition
        if (endAnsweringLocks.has(pin)) return;
        endAnsweringLocks.add(pin);
        try {
          const roomExists = await gameUseCases.roomExists(pin);
          if (!roomExists) return;

          const endResult = await gameUseCases.endAnsweringPhase({
            pin,
            requesterId: 'server'
          });

          if (endResult) {
            io.to(pin).emit('time_expired');
            io.to(pin).emit('show_results', toShowResultsDTO(endResult));
          }
        } catch (err) {
          // Expected errors when room state has changed (e.g. host already ended, room deleted)
          const isExpected = err instanceof ValidationError || err instanceof NotFoundError;
          if (!isExpected) {
            console.error('Auto-end error:', err.message);
          }
        } finally {
          endAnsweringLocks.delete(pin);
        }
      });

      io.to(pin).emit('answering_started', {
        timeLimit: result.timeLimit,
        optionCount: result.optionCount,
        isLightning: result.isLightning || false
      });
    } catch (error) {
      handleSocketError(socket, error);
    }
  });

  // Player submits answer
  socket.on('submit_answer', async (data) => {
    try {
      // Rate limit check
      if (!checkRateLimit('submit_answer')) return;

      const { pin, answerIndex } = data || {};

      // SECURITY: Only use pin and answerIndex from client
      // Elapsed time MUST be calculated server-side to prevent manipulation
      // Client could send fake elapsedTimeMs to get maximum score

      let elapsedTimeMs;
      try {
        elapsedTimeMs = gameUseCases.getServerElapsedTime(timerService, pin);
      } catch (err) {
        socket.emit('error', { error: err.message });
        return;
      }

      const result = await gameUseCases.submitAnswer({
        pin,
        socketId: socket.id,
        answerIndex,
        elapsedTimeMs
      });

      socket.emit('answer_received', {
        isCorrect: result.answer.isCorrect,
        score: result.actualScore,
        totalScore: result.player.score,
        streak: result.player.streak,
        streakBonus: result.answer.streakBonus
      });

      socket.to(pin).emit('answer_count_updated', {
        answeredCount: result.answeredCount,
        totalPlayers: result.totalPlayers
      });

      if (result.allAnswered) {
        timerService.stopTimer(pin);
        io.to(pin).emit('all_players_answered');

        // Lock prevents race with timer expiry auto-transition
        if (endAnsweringLocks.has(pin)) return;
        endAnsweringLocks.add(pin);

        // Auto-transition to results when all players have answered
        try {
          const endResult = await gameUseCases.endAnsweringPhase({
            pin,
            requesterId: 'server'
          });

          if (endResult) {
            io.to(pin).emit('show_results', toShowResultsDTO(endResult));
          }
        } catch (err) {
          // ConflictError/ValidationError/NotFoundError are expected if host already ended or room changed
          const isExpected = err instanceof ValidationError || err instanceof NotFoundError || err instanceof ConflictError;
          if (!isExpected) {
            console.error('Auto-end after all answered error:', err.message);
          }
        } finally {
          endAnsweringLocks.delete(pin);
        }
      }
    } catch (error) {
      handleSocketError(socket, error);
    }
  });

  // Host ends answering phase (timer expired or manual) - requires authentication
  socket.on('end_answering', async (data) => {
    try {
      // Rate limit check
      if (!checkRateLimit('end_answering')) return;

      requireAuth(); // JWT required for host
      const { pin } = data || {};

      timerService.stopTimer(pin);

      // Check lock to prevent race with timer callback auto-transition
      if (endAnsweringLocks.has(pin)) return;
      endAnsweringLocks.add(pin);

      try {
        const result = await gameUseCases.endAnsweringPhase({
          pin,
          requesterId: socket.id
        });

        io.to(pin).emit('show_results', toShowResultsDTO(result));
      } finally {
        endAnsweringLocks.delete(pin);
      }
    } catch (error) {
      handleSocketError(socket, error);
    }
  });

  // Host shows leaderboard - requires authentication
  socket.on('show_leaderboard', async (data) => {
    try {
      // Rate limit check
      if (!checkRateLimit('show_leaderboard')) return;

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
    } catch (error) {
      handleSocketError(socket, error);
    }
  });

  // Host moves to next question - requires authentication
  socket.on('next_question', async (data) => {
    try {
      // Rate limit check
      if (!checkRateLimit('next_question')) return;

      requireAuth(); // JWT required for host
      const { pin } = data || {};

      const result = await gameUseCases.nextQuestion({
        pin,
        requesterId: socket.id
      });

      if (result.isGameOver) {
        const gameOverPayload = {
          podium: result.podium.map(toPlayerDTO)
        };
        if (result.teamPodium) {
          gameOverPayload.teamPodium = result.teamPodium;
        }
        io.to(pin).emit('game_over', gameOverPayload);

        try {
          await gameUseCases.archiveGame({ pin });
        } catch (archiveError) {
          console.error('Failed to archive game:', archiveError.message);
        }
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
      }
    } catch (error) {
      handleSocketError(socket, error);
    }
  });

  // Get final results
  socket.on('get_results', async (data) => {
    try {
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
    } catch (error) {
      handleSocketError(socket, error);
    }
  });

  // Request timer sync (for clients that need to resync)
  socket.on('request_timer_sync', (data) => {
    try {
      const { pin } = data || {};

      const timerSync = timerService.getTimerSync(pin);

      if (timerSync) {
        socket.emit('timer_sync', timerSync);
      } else {
        socket.emit('timer_sync', { active: false });
      }
    } catch (error) {
      handleSocketError(socket, error);
    }
  });

  // ==================== POWER-UP EVENTS ====================

  socket.on('use_power_up', async (data) => {
    try {
      if (!checkRateLimit('use_power_up')) return;

      const { pin, powerUpType } = data || {};

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
      if (emitActions.timerAction) {
        const { method, args } = emitActions.timerAction;
        const allowedTimerMethods = ['extendTimer', 'stopTimer'];
        if (allowedTimerMethods.includes(method) && Array.isArray(args)) {
          // Validate args are safe primitives (numbers/strings only)
          const safeArgs = args.filter(a => typeof a === 'number' || typeof a === 'string');
          try {
            timerService[method](pin, ...safeArgs);
          } catch (timerErr) {
            console.error(`Timer action '${method}' failed for pin ${pin}:`, timerErr.message);
          }
        }
      }

      // Broadcast to room that a player used a power-up
      io.to(pin).emit('power_up_used', {
        nickname: result.nickname,
        powerUpType
      });
    } catch (error) {
      handleSocketError(socket, error);
    }
  });

  // ==================== PAUSE/RESUME EVENTS ====================

  // Host pauses the game (only from LEADERBOARD state)
  socket.on('pause_game', async (data) => {
    try {
      if (!checkRateLimit('pause_game')) return;
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
    } catch (error) {
      handleSocketError(socket, error);
    }
  });

  // Host resumes the game
  socket.on('resume_game', async (data) => {
    try {
      if (!checkRateLimit('resume_game')) return;
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
    } catch (error) {
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
