const { UnauthorizedError } = require('../../shared/errors');
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
  if (!socket.isAuthenticated || !socket.user) {
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
  totalPlayers: endResult.totalPlayers,
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

module.exports = { createRateLimiter, createAuthChecker, toPlayerDTO, toPlayerQuestionDTO, toShowResultsDTO, validateToken };
