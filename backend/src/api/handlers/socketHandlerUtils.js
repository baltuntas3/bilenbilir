const { UnauthorizedError, ValidationError, NotFoundError, ConflictError } = require('../../shared/errors');
const { socketRateLimiter } = require('../middlewares/socketRateLimiter');

/**
 * Create rate limit checker for a socket
 * @param {Socket} socket - Socket.IO socket instance
 * @returns {Function} Rate limit check function
 */
const createRateLimiter = (socket) => (eventName) => {
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
 * Create auth checker for a socket
 * @param {Socket} socket - Socket.IO socket instance
 * @returns {Function} Auth check function that returns user or throws
 */
const createAuthChecker = (socket) => () => {
  if (!socket.isAuthenticated || !socket.user || !socket.user.userId) {
    throw new UnauthorizedError('Authentication required for this action');
  }
  return socket.user;
};

/**
 * Map player data for client consumption (strips internal details)
 * @param {Player} player - Player entity
 * @returns {Object} Sanitized player data
 */
const toPlayerDTO = (player) => ({
  id: player.id,
  nickname: player.nickname,
  score: player.score
});

/**
 * Map player data with extended stats for leaderboard/podium contexts
 * @param {Player} player - Player entity
 * @returns {Object} Player data with scoring stats
 */
const toLeaderboardPlayerDTO = (player) => ({
  id: player.id,
  nickname: player.nickname,
  score: player.score,
  streak: player.streak,
  correctAnswers: player.correctAnswers,
  longestStreak: player.longestStreak
});

/**
 * Strip correct answer info from question data for players
 * @param {Object} questionData - Host question data
 * @returns {Object|null} Player-safe question data
 */
const toPlayerQuestionDTO = (questionData) => {
  if (!questionData) return null;
  return {
    text: questionData.text,
    type: questionData.type,
    options: questionData.options,
    timeLimit: questionData.timeLimit,
    points: questionData.points,
    imageUrl: questionData.imageUrl
  };
};

/**
 * Map endAnsweringPhase result to show_results event payload
 * @param {Object} endResult - Result from gameUseCases.endAnsweringPhase
 * @returns {Object} Payload for show_results emit
 */
const toShowResultsDTO = (endResult) => ({
  correctAnswerIndex: endResult.correctAnswerIndex,
  distribution: endResult.distribution,
  correctCount: endResult.correctCount,
  skippedCount: endResult.skippedCount || 0,
  answeredCount: endResult.answeredCount,
  totalPlayersInPhase: endResult.totalPlayers,
  connectedPlayerCount: endResult.connectedPlayerCount,
  explanation: endResult.explanation || null
});

/**
 * Validate token format and emit error if invalid
 * @param {Socket} socket - Socket.IO socket instance
 * @param {*} token - Token value to validate
 * @param {string} tokenName - Human-readable token name for error message
 * @returns {boolean} true if token is valid, false if invalid (error already emitted)
 */
const validateToken = (socket, token, tokenName) => {
  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    socket.emit('error', { error: `${tokenName} is required` });
    return false;
  }
  return true;
};

/**
 * Auto-transition from ANSWERING_PHASE to SHOW_RESULTS.
 * Acquires endAnsweringLocks, stops the timer, ends the phase, and emits results.
 * Silently returns if lock is already held (another path is handling it).
 *
 * @param {Object} params
 * @param {Object} params.io - Socket.IO server
 * @param {string} params.pin - Room PIN
 * @param {Object} params.endAnsweringLocks - LockManager for end-answering locks
 * @param {Object} params.timerService - GameTimerService (optional)
 * @param {Object} params.gameUseCases - GameUseCases instance
 */
const autoAdvanceToResults = async ({ io, pin, endAnsweringLocks, timerService, gameUseCases }) => {
  if (!endAnsweringLocks.acquire(pin)) return;
  try {
    // Stop timer FIRST to prevent timer callback from firing concurrently.
    // This eliminates the race where time_expired is emitted after all players answered.
    if (timerService) timerService.stopTimer(pin);
    io.to(pin).emit('all_players_answered');
    const endResult = await gameUseCases.endAnsweringPhase({ pin, isSystemTriggered: true });
    if (endResult) {
      io.to(pin).emit('show_results', toShowResultsDTO(endResult));
    }
  } catch (err) {
    // Expected errors: state already transitioned (race with manual end/pause), room deleted, etc.
    // Only "Not in answering phase" and "not found" are truly benign — log others at warn level.
    if (err instanceof NotFoundError) {
      // Room was deleted — nothing to do
    } else if (err instanceof ValidationError || err instanceof ConflictError) {
      console.warn(`Auto-advance skipped for ${pin}: ${err.message}`);
    } else {
      console.error('Auto-advance to results error:', err.message);
    }
  } finally {
    endAnsweringLocks.release(pin);
  }
};

/**
 * Build SHOW_RESULTS phase data from room and quiz snapshot.
 * Single source of truth for reconnect, spectator snapshot, and PAUSED-from-SHOW_RESULTS.
 */
const buildShowResultsPayload = (room, snapshot) => {
  const question = snapshot.getQuestion(room.currentQuestionIndex);
  if (!question) return null;
  const { distribution, correctCount, skippedCount } = room.getAnswerDistribution(
    question.options.length,
    (idx) => question.isCorrect(idx)
  );
  return {
    correctAnswerIndex: question.correctAnswerIndex,
    distribution,
    correctCount,
    skippedCount,
    explanation: question.explanation || null,
    answeredCount: room.getTotalAnsweredCount(),
    totalPlayersInPhase: room.answeringPhasePlayerCount,
    connectedPlayerCount: room.getConnectedPlayerCount()
  };
};

/**
 * Build LEADERBOARD phase data from room.
 */
const buildLeaderboardPayload = (room) => {
  const payload = { leaderboard: room.getLeaderboard().map(toLeaderboardPlayerDTO) };
  if (room.isTeamMode()) payload.teamLeaderboard = room.getTeamLeaderboard();
  return payload;
};

/**
 * Build PODIUM phase data from room.
 */
const buildPodiumPayload = (room) => {
  const payload = {
    podium: room.getPodium().map(toLeaderboardPlayerDTO),
    leaderboard: room.getLeaderboard().map(toLeaderboardPlayerDTO)
  };
  if (room.isTeamMode()) payload.teamPodium = room.getTeamPodium();
  return payload;
};

/**
 * Validate PIN format from client data.
 * @param {*} pin - PIN value to validate
 * @returns {boolean} true if PIN is a non-empty string
 */
const isValidPin = (pin) => !!pin && typeof pin === 'string' && pin.trim().length > 0;

module.exports = {
  createRateLimiter, createAuthChecker, toPlayerDTO, toLeaderboardPlayerDTO, toPlayerQuestionDTO, toShowResultsDTO, validateToken, autoAdvanceToResults,
  buildShowResultsPayload, buildLeaderboardPayload, buildPodiumPayload, isValidPin
};
