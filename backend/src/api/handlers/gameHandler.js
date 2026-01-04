const { handleSocketError } = require('../middlewares/errorHandler');
const { UnauthorizedError } = require('../../shared/errors');
const { socketRateLimiter } = require('../middlewares/socketRateLimiter');

/**
 * Game WebSocket Handler
 * Handles game flow: start, questions, answers, results
 */
const createGameHandler = (io, socket, gameUseCases, timerService) => {
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

  // Host starts the game (requires authentication)
  socket.on('start_game', async (data) => {
    try {
      // Rate limit check
      if (!checkRateLimit('start_game')) return;

      requireAuth(); // JWT required for host
      const { pin } = data || {};

      const result = await gameUseCases.startGame({
        pin,
        requesterId: socket.id
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
        currentQuestion: result.currentQuestion ? {
          text: result.currentQuestion.text,
          type: result.currentQuestion.type,
          options: result.currentQuestion.options,
          timeLimit: result.currentQuestion.timeLimit,
          points: result.currentQuestion.points,
          imageUrl: result.currentQuestion.imageUrl
        } : null,
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
        try {
          const roomExists = await gameUseCases.roomExists(pin);
          if (!roomExists) return;

          const endResult = await gameUseCases.endAnsweringPhase({
            pin,
            requesterId: 'server'
          });

          if (endResult) {
            io.to(pin).emit('time_expired');
            io.to(pin).emit('show_results', {
              correctAnswerIndex: endResult.correctAnswerIndex,
              distribution: endResult.distribution,
              correctCount: endResult.correctCount,
              totalPlayers: endResult.totalPlayers
            });
          }
        } catch (err) {
          // Ignore expected errors when room state has changed
          if (err.message !== 'Not in answering phase' && err.message !== 'Room not found') {
            console.error('Auto-end error:', err.message);
          }
        }
      });

      io.to(pin).emit('answering_started', {
        timeLimit: result.timeLimit,
        optionCount: result.optionCount
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

      // Check if timer has expired (server-side validation)
      if (timerService.isTimeExpired(pin)) {
        socket.emit('error', { error: 'Time expired' });
        return;
      }

      // Use server-side elapsed time (NEVER trust client-provided time)
      let elapsedTimeMs = timerService.getElapsedTime(pin);

      // Validate elapsed time - if null, timer doesn't exist
      if (elapsedTimeMs === null) {
        socket.emit('error', { error: 'No active timer for this room' });
        return;
      }

      // Cap elapsed time at timer's configured duration to handle edge cases
      // where submission comes in just as timer expires
      const timerSync = timerService.getTimerSync(pin);
      if (timerSync && timerSync.totalTimeMs) {
        elapsedTimeMs = Math.min(elapsedTimeMs, timerSync.totalTimeMs);
      }

      // Re-check timer expiration just before submission to minimize race window
      // This double-check reduces (but doesn't eliminate) the race condition window
      if (timerService.isTimeExpired(pin)) {
        socket.emit('error', { error: 'Time expired' });
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
        score: result.answer.getTotalScore(),
        totalScore: result.player.score,
        streak: result.player.streak
      });

      socket.to(pin).emit('answer_count_updated', {
        answeredCount: result.answeredCount,
        totalPlayers: result.totalPlayers
      });

      if (result.allAnswered) {
        timerService.stopTimer(pin);
        io.to(pin).emit('all_players_answered');

        // Auto-transition to results when all players have answered
        try {
          const endResult = await gameUseCases.endAnsweringPhase({
            pin,
            requesterId: 'server'
          });

          if (endResult) {
            io.to(pin).emit('show_results', {
              correctAnswerIndex: endResult.correctAnswerIndex,
              distribution: endResult.distribution,
              correctCount: endResult.correctCount,
              totalPlayers: endResult.totalPlayers
            });
          }
        } catch (err) {
          // Log but don't fail - host can still manually end
          console.error('Auto-end after all answered error:', err.message);
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

      const result = await gameUseCases.endAnsweringPhase({
        pin,
        requesterId: socket.id
      });

      socket.emit('show_results', {
        correctAnswerIndex: result.correctAnswerIndex,
        distribution: result.distribution,
        correctCount: result.correctCount,
        totalPlayers: result.totalPlayers
      });

      socket.to(pin).emit('round_ended', {
        correctAnswerIndex: result.correctAnswerIndex
      });
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

      io.to(pin).emit('leaderboard', {
        leaderboard: result.leaderboard.map(p => ({
          id: p.id,
          nickname: p.nickname,
          score: p.score
        }))
      });
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
        io.to(pin).emit('game_over', {
          podium: result.podium.map(p => ({
            id: p.id,
            nickname: p.nickname,
            score: p.score
          }))
        });

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
          currentQuestion: result.currentQuestion ? {
            text: result.currentQuestion.text,
            type: result.currentQuestion.type,
            options: result.currentQuestion.options,
            timeLimit: result.currentQuestion.timeLimit,
            points: result.currentQuestion.points,
            imageUrl: result.currentQuestion.imageUrl
          } : null
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

      socket.emit('final_results', {
        leaderboard: result.leaderboard.map(p => ({
          id: p.id,
          nickname: p.nickname,
          score: p.score
        })),
        podium: result.podium.map(p => ({
          id: p.id,
          nickname: p.nickname,
          score: p.score
        }))
      });
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

  // ==================== PAUSE/RESUME EVENTS ====================

  // Host pauses the game (only from LEADERBOARD state)
  socket.on('pause_game', async (data) => {
    try {
      if (!checkRateLimit('pause_game')) return;
      requireAuth();

      const { pin } = data || {};

      // Stop timer if any is running (safety measure to prevent desync)
      timerService.stopTimer(pin);

      const result = await gameUseCases.pauseGame({
        pin,
        requesterId: socket.id
      });

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
};

module.exports = { createGameHandler };
