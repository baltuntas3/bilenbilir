const { handleSocketError } = require('../middlewares/errorHandler');
const { UnauthorizedError } = require('../../shared/errors');

/**
 * Game WebSocket Handler
 * Handles game flow: start, questions, answers, results
 */
const createGameHandler = (io, socket, gameUseCases, timerService) => {
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
      requireAuth(); // JWT required for host
      const { pin } = data || {};

      const result = await gameUseCases.startGame({
        pin,
        requesterId: socket.id
      });

      socket.emit('game_started', {
        totalQuestions: result.totalQuestions,
        currentQuestion: result.currentQuestion
      });

      socket.to(pin).emit('game_started', {
        totalQuestions: result.totalQuestions,
        questionIndex: 0
      });
    } catch (error) {
      handleSocketError(socket, error);
    }
  });

  // Host triggers answering phase (after intro countdown) - requires authentication
  socket.on('start_answering', async (data) => {
    try {
      requireAuth(); // JWT required for host
      const { pin } = data || {};

      const result = await gameUseCases.startAnsweringPhase({
        pin,
        requesterId: socket.id
      });

      // Start server-side timer with race condition protection
      timerService.startTimer(pin, result.timeLimit, async () => {
        try {
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
          if (err.message !== 'Not in answering phase') {
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
      const { pin, answerIndex } = data || {};

      // Check if timer has expired (server-side validation)
      if (timerService.isTimeExpired(pin)) {
        socket.emit('error', { message: 'Time expired' });
        return;
      }

      // Use server-side elapsed time
      const elapsedTimeMs = timerService.getElapsedTime(pin);

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
      }
    } catch (error) {
      handleSocketError(socket, error);
    }
  });

  // Host ends answering phase (timer expired or manual) - requires authentication
  socket.on('end_answering', async (data) => {
    try {
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
        socket.emit('question_intro', {
          questionIndex: result.questionIndex,
          totalQuestions: result.totalQuestions,
          currentQuestion: result.currentQuestion
        });

        socket.to(pin).emit('question_intro', {
          questionIndex: result.questionIndex,
          totalQuestions: result.totalQuestions
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
};

module.exports = { createGameHandler };
