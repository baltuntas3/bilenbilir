const { handleSocketError } = require('../middlewares/errorHandler');
const { createRateLimiter, createAuthChecker, toLeaderboardPlayerDTO, toPlayerQuestionDTO, toShowResultsDTO, autoAdvanceToResults, isValidPin } = require('./socketHandlerUtils');
const { MAX_TIMER_EXTENSION_MS, GAME_FLOW_LOCK_TIMEOUT_MS, MAX_EXTENDED_TIMER_SECONDS } = require('../../shared/config/constants');
const { RoomState } = require('../../domain/entities');
const { LockManager } = require('../../shared/utils/LockManager');
const { DEFAULT_POWER_UPS } = require('../../domain/value-objects/PowerUp');

/**
 * Game WebSocket Handler
 * Handles game flow: start, questions, answers, results
 */
// Per-room lock to prevent concurrent endAnsweringPhase calls (timer expiry vs all-answered race)
const endAnsweringLocks = new LockManager(GAME_FLOW_LOCK_TIMEOUT_MS);
// Per-room lock to prevent concurrent nextQuestion calls (double-click race)
const nextQuestionLocks = new LockManager(GAME_FLOW_LOCK_TIMEOUT_MS);

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
      if (!isValidPin(pin)) { sendAck(ack, { ok: false, error: 'Valid PIN is required' }); return; }

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

      const gameStartedBase = {
        totalQuestions: result.totalQuestions,
        questionIndex: 0,
        powerUps: DEFAULT_POWER_UPS,
        teamMode: result.room.isTeamMode()
      };

      // Send to host with full question data
      socket.emit('game_started', {
        ...gameStartedBase,
        currentQuestion: result.currentQuestion
      });

      // Send to players without answer
      socket.to(pin).emit('game_started', {
        ...gameStartedBase,
        currentQuestion: toPlayerQuestionDTO(result.currentQuestion)
      });
      sendAck(ack, { ok: true });
    } catch (error) {
      sendAck(ack, { ok: false, error: error.message });
      handleSocketError(socket, error, { hasAck: true });
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
      if (!isValidPin(pin)) { sendAck(ack, { ok: false, error: 'Valid PIN is required' }); return; }

      const result = await gameUseCases.startAnsweringPhase({
        pin,
        requesterId: socket.id
      });
      // Start server-side timer silently �� emit timer_started AFTER answering_started
      // to guarantee clients receive state transition before timer data.
      let timerInfo;
      try {
        timerInfo = timerService.startTimer(pin, result.timeLimit, async () => {
          // Timer expired — emit time_expired before auto-advancing
          io.to(pin).emit('time_expired');
          await autoAdvanceToResults({ io, pin, endAnsweringLocks, timerService, gameUseCases });
        }, { silent: true });
      } catch (timerErr) {
        // Timer failed — rollback state to prevent stuck ANSWERING_PHASE without timer
        await gameUseCases.rollbackAnsweringPhase({ pin });
        throw timerErr;
      }

      io.to(pin).emit('answering_started', {
        timeLimit: result.timeLimit,
        optionCount: result.optionCount,
        isLightning: result.isLightning || false,
        fiftyFiftyAvailable: result.optionCount > 2,
        connectedPlayerCount: result.room.getConnectedPlayerCount()
      });
      io.to(pin).emit('timer_started', timerInfo);
      sendAck(ack, { ok: true });
    } catch (error) {
      sendAck(ack, { ok: false, error: error.message });
      handleSocketError(socket, error, { hasAck: true });
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
      if (!isValidPin(pin)) { if (typeof ack === 'function') ack({ ok: false, error: 'Valid PIN is required' }); return; }

      // Verify socket is a member of the room
      if (!socket.rooms.has(pin)) {
        if (typeof ack === 'function') ack({ ok: false, error: 'Not a member of this room' });
        return;
      }

      // SECURITY: Only use pin and answerIndex from client
      // Elapsed time MUST be calculated server-side to prevent manipulation
      // Client could send fake elapsedTimeMs to get maximum score

      let elapsedTimeMs;
      try {
        elapsedTimeMs = gameUseCases.getServerElapsedTime(timerService, pin);
      } catch (err) {
        if (typeof ack === 'function') ack({ ok: false, error: err.message });
        return;
      }

      // Use ORIGINAL timer duration (before extensions) for fair scoring.
      // TIME_EXTENSION gives more time to answer but should not inflate scores.
      const effectiveTimeLimitMs = timerService.getOriginalDuration(pin);

      const result = await gameUseCases.submitAnswer({
        pin,
        socketId: socket.id,
        answerIndex,
        elapsedTimeMs,
        effectiveTimeLimitMs
      });

      const answerPayload = {
        isCorrect: result.answer.isCorrect,
        score: result.actualScore,
        totalScore: result.player.score,
        streak: result.player.streak,
        streakBonus: result.answer.streakBonus,
        doublePointsRefunded: result.doublePointsRefunded || false
      };
      socket.emit('answer_received', answerPayload);
      if (typeof ack === 'function') {
        ack(answerPayload);
      }

      io.to(pin).emit('answer_count_updated', {
        answeredCount: result.answeredCount,
        totalPlayersInPhase: result.totalPlayers,
        connectedPlayerCount: result.connectedPlayerCount,
        disconnectedPlayerCount: result.disconnectedPlayerCount
      });

      if (result.allAnswered) {
        await autoAdvanceToResults({ io, pin, endAnsweringLocks, timerService, gameUseCases });
      }
    } catch (error) {
      if (typeof ack === 'function') ack({ ok: false, error: error.message });
      handleSocketError(socket, error, { hasAck: true });
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
      if (!isValidPin(pin)) { sendAck(ack, { ok: false, error: 'Valid PIN is required' }); return; }

      // Try to shorten the timer to 5 seconds first — gives players a last chance
      const SHORTEN_TO_SECONDS = 5;
      const wasShortened = timerService.shortenTimer(pin, SHORTEN_TO_SECONDS);
      if (wasShortened) {
        // Timer was shortened — it will expire naturally and trigger endAnsweringPhase
        sendAck(ack, { ok: true, shortened: true });
        return;
      }

      // Remaining time is already ≤ 5s (or no timer) — end immediately
      if (!endAnsweringLocks.acquire(pin)) {
        sendAck(ack, { ok: true, alreadyEnding: true });
        return;
      }

      try {
        timerService.stopTimer(pin);

        const result = await gameUseCases.endAnsweringPhase({
          pin,
          requesterId: socket.id
        });

        io.to(pin).emit('show_results', toShowResultsDTO(result));
        sendAck(ack, { ok: true });
      } catch (error) {
        sendAck(ack, { ok: false, error: error.message });
        handleSocketError(socket, error, { hasAck: true });
      } finally {
        endAnsweringLocks.release(pin);
      }
    } catch (error) {
      sendAck(ack, { ok: false, error: error.message });
      handleSocketError(socket, error, { hasAck: true });
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
      if (!isValidPin(pin)) { sendAck(ack, { ok: false, error: 'Valid PIN is required' }); return; }

      const result = await gameUseCases.showLeaderboard({
        pin,
        requesterId: socket.id
      });

      const leaderboardPayload = {
        leaderboard: result.leaderboard.map(toLeaderboardPlayerDTO)
      };
      if (result.teamLeaderboard) {
        leaderboardPayload.teamLeaderboard = result.teamLeaderboard;
      }
      io.to(pin).emit('leaderboard', leaderboardPayload);
      sendAck(ack, { ok: true });
    } catch (error) {
      sendAck(ack, { ok: false, error: error.message });
      handleSocketError(socket, error, { hasAck: true });
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
      if (!isValidPin(pin)) { sendAck(ack, { ok: false, error: 'Valid PIN is required' }); return; }

      // Check lock to prevent double-call race (rapid next_question clicks)
      if (!nextQuestionLocks.acquire(pin)) {
        sendAck(ack, { ok: true, alreadyAdvancing: true });
        return;
      }

      try {
        const result = await gameUseCases.nextQuestion({
          pin,
          requesterId: socket.id
        });

        if (result.isGameOver) {
          const gameOverPayload = {
            podium: result.podium.map(toLeaderboardPlayerDTO),
            leaderboard: result.room.getLeaderboard().map(toLeaderboardPlayerDTO)
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
      } finally {
        nextQuestionLocks.release(pin);
      }
    } catch (error) {
      sendAck(ack, { ok: false, error: error.message });
      handleSocketError(socket, error, { hasAck: true });
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
      if (!socket.rooms.has(pin)) {
        if (typeof ack === 'function') ack({ ok: false, error: 'Not a member of this room' });
        return;
      }

      const result = await gameUseCases.getResults({ pin });

      const finalResultsPayload = {
        leaderboard: result.leaderboard.map(toLeaderboardPlayerDTO),
        podium: result.podium.map(toLeaderboardPlayerDTO)
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
      handleSocketError(socket, error, { hasAck: true });
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
      if (!socket.rooms.has(pin)) {
        if (typeof ack === 'function') ack({ ok: false, error: 'Not a member of this room' });
        return;
      }

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
      handleSocketError(socket, error, { hasAck: true });
    }
  });

  // Host ends game early (when all players leave) - requires authentication
  socket.on('end_game_early', async (data, ack) => {
    try {
      if (!checkRateLimit('end_game_early')) {
        sendAck(ack, { ok: false, error: 'Too many requests' });
        return;
      }
      requireAuth();
      const { pin } = data || {};
      if (!isValidPin(pin)) { sendAck(ack, { ok: false, error: 'Valid PIN is required' }); return; }

      // Stop any running timer
      timerService.stopTimer(pin);

      const result = await gameUseCases.endGameEarly({
        pin,
        requesterId: socket.id
      });

      const gameOverPayload = {
        podium: result.podium.map(toLeaderboardPlayerDTO),
        leaderboard: result.leaderboard.map(toLeaderboardPlayerDTO)
      };
      if (result.teamPodium) gameOverPayload.teamPodium = result.teamPodium;
      if (result.teamLeaderboard) gameOverPayload.teamLeaderboard = result.teamLeaderboard;
      io.to(pin).emit('game_over', gameOverPayload);

      // Archive the game
      try {
        await gameUseCases.archiveGame({ pin });
      } catch (archiveError) {
        console.error('Failed to archive early-ended game:', archiveError.message);
      }

      sendAck(ack, { ok: true, isGameOver: true });
    } catch (error) {
      sendAck(ack, { ok: false, error: error.message });
      handleSocketError(socket, error, { hasAck: true });
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
      if (!isValidPin(pin)) { sendAck(ack, { ok: false, error: 'Valid PIN is required' }); return; }

      if (!socket.rooms.has(pin)) {
        sendAck(ack, { ok: false, error: 'Not a member of this room' });
        return;
      }

      // Pre-check: reject TIME_EXTENSION if timer is inactive or budget exhausted
      if (powerUpType === 'TIME_EXTENSION') {
        if (!timerService.isTimerActive(pin)) {
          sendAck(ack, { ok: false, error: 'No active timer to extend' });
          return;
        }
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

      // Resolve timer action FIRST before emitting to clients
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
          socket.emit('power_up_refund_failed', { powerUpType });
        }
        sendAck(ack, { ok: false, error: 'Time extension limit reached for this question' });
        return;
      }

      // Timer action succeeded (or not needed) — now emit to clients
      if (emitActions.playerEmits) {
        emitActions.playerEmits.forEach(e => socket.emit(e.event, e.data));
      }
      if (emitActions.roomEmits) {
        emitActions.roomEmits.forEach(e => io.to(pin).emit(e.event, e.data));
      }

      io.to(pin).emit('power_up_used', {
        nickname: result.nickname,
        powerUpType
      });
      sendAck(ack, { ok: true, powerUpType });
    } catch (error) {
      sendAck(ack, { ok: false, error: error.message });
      handleSocketError(socket, error, { hasAck: true });
    }
  });

  // ==================== PAUSE/RESUME EVENTS ====================

  // Host pauses the game (from LEADERBOARD, SHOW_RESULTS, or ANSWERING_PHASE)
  socket.on('pause_game', async (data, ack) => {
    try {
      if (!checkRateLimit('pause_game')) {
        sendAck(ack, { ok: false, error: 'Too many requests' });
        return;
      }
      requireAuth();

      const { pin } = data || {};
      if (!isValidPin(pin)) { sendAck(ack, { ok: false, error: 'Valid PIN is required' }); return; }

      // Acquire endAnsweringLocks to prevent race with concurrent answer submissions
      // that trigger auto-advance. This ensures pause and end-answering are mutually exclusive.
      if (!endAnsweringLocks.acquire(pin)) {
        sendAck(ack, { ok: false, error: 'Game state transition in progress' });
        return;
      }

      try {
        // Capture timer state BEFORE pause — needed for ANSWERING_PHASE resume
        const timerRemainingMs = timerService.getRemainingTime(pin);
        const originalDurationMs = timerService.getOriginalDuration(pin);
        const elapsedBeforePauseMs = timerService.getElapsedTime(pin) || 0;

        // Pause FIRST — if pause fails (wrong state), timer stays intact
        const result = await gameUseCases.pauseGame({
          pin,
          requesterId: socket.id,
          timerRemainingMs,
          originalDurationMs,
          elapsedBeforePauseMs
        });

        // Only stop timer after successful state transition
        timerService.stopTimer(pin);

        io.to(pin).emit('game_paused', {
          pausedAt: result.pausedAt,
          pausedFromState: result.pausedFromState
        });
        sendAck(ack, { ok: true });
      } finally {
        endAnsweringLocks.release(pin);
      }
    } catch (error) {
      sendAck(ack, { ok: false, error: error.message });
      handleSocketError(socket, error, { hasAck: true });
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
      if (!isValidPin(pin)) { sendAck(ack, { ok: false, error: 'Valid PIN is required' }); return; }

      // Acquire endAnsweringLocks to prevent race with concurrent answer submissions
      // that trigger auto-advance. Same pattern as pause_game handler.
      if (!endAnsweringLocks.acquire(pin)) {
        sendAck(ack, { ok: false, error: 'Game state transition in progress' });
        return;
      }

      try {
        const result = await gameUseCases.resumeGame({
          pin,
          requesterId: socket.id
        });

        // If resuming to ANSWERING_PHASE, check if we can actually continue
        // or need to auto-advance immediately. This prevents a brief ANSWERING_PHASE
        // flash on clients before the inevitable transition to SHOW_RESULTS.
        if (result.resumedState === RoomState.ANSWERING_PHASE) {
          const needsAutoAdvance = result.shouldAutoAdvance
            || !result.timerState || result.timerState.remainingMs <= 0;

          if (needsAutoAdvance) {
            // Skip emitting game_resumed with ANSWERING_PHASE — clients will receive
            // show_results directly, avoiding a flash of the answering UI.
            if (!result.shouldAutoAdvance) {
              io.to(pin).emit('time_expired');
            }
            // Auto-advance inline since we already hold the lock
            try {
              timerService.stopTimer(pin);
              io.to(pin).emit('all_players_answered');
              const endResult = await gameUseCases.endAnsweringPhase({ pin, isSystemTriggered: true });
              if (endResult) {
                io.to(pin).emit('show_results', toShowResultsDTO(endResult));
              }
            } catch (err) {
              console.warn(`Auto-advance on resume skipped for ${pin}: ${err.message}`);
            }
          } else {
            // Emit state transition FIRST, then start timer — clients must know they're
            // in ANSWERING_PHASE before receiving timer data.
            const timerSync = result.timerState;
            io.to(pin).emit('game_resumed', {
              state: result.resumedState,
              pauseDuration: result.pauseDuration,
              timerSync
            });

            // Start timer after emitting state transition
            const remainingSeconds = Math.max(1, Math.round(result.timerState.remainingMs / 1000));
            let timerInfo;
            try {
              timerInfo = timerService.startTimer(pin, remainingSeconds, async () => {
                io.to(pin).emit('time_expired');
                await autoAdvanceToResults({ io, pin, endAnsweringLocks, timerService, gameUseCases });
              }, {
                silent: true,
                minDuration: 1,
                maxDuration: MAX_EXTENDED_TIMER_SECONDS,
                originalDurationMs: result.timerState.originalDurationMs,
                preElapsedMs: result.timerState.elapsedBeforePauseMs || 0
              });
            } catch (timerErr) {
              // Timer failed after resume — auto-advance to prevent stuck state
              io.to(pin).emit('time_expired');
              try {
                io.to(pin).emit('all_players_answered');
                const endResult = await gameUseCases.endAnsweringPhase({ pin, isSystemTriggered: true });
                if (endResult) {
                  io.to(pin).emit('show_results', toShowResultsDTO(endResult));
                }
              } catch (err) {
                console.warn(`Auto-advance on resume timer failure for ${pin}: ${err.message}`);
              }
              sendAck(ack, { ok: true });
              return;
            }
            io.to(pin).emit('timer_started', timerInfo);
          }
        } else {
          // Non-ANSWERING_PHASE resume (LEADERBOARD, SHOW_RESULTS) — always emit
          io.to(pin).emit('game_resumed', {
            state: result.resumedState,
            pauseDuration: result.pauseDuration
          });
        }

        sendAck(ack, { ok: true });
      } finally {
        endAnsweringLocks.release(pin);
      }
    } catch (error) {
      sendAck(ack, { ok: false, error: error.message });
      handleSocketError(socket, error, { hasAck: true });
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

module.exports = { createGameHandler, endAnsweringLocks, nextQuestionLocks };
