const { ForbiddenError } = require('../../shared/errors');

/**
 * Parse pagination params from request query.
 * @param {Object} query - req.query object
 * @param {Object} [options]
 * @param {number} [options.maxLimit=100] - Upper bound for limit
 * @param {number} [options.defaultLimit=20] - Default limit when not provided
 * @returns {{ page: number, limit: number }}
 */
function parsePagination(query, { maxLimit = 100, defaultLimit = 20 } = {}) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit) || defaultLimit));
  return { page, limit };
}

/**
 * Check whether a user may access a quiz.
 * Public quizzes are open to everyone; private quizzes are restricted to their owner.
 * @param {Object} quiz - Quiz entity
 * @param {string|undefined} userId - Authenticated user's ID (may be undefined)
 * @throws {ForbiddenError} When the quiz is private and the user is not the owner
 */
function checkQuizAccess(quiz, userId) {
  if (!quiz.isPublic) {
    if (!userId || userId !== quiz.createdBy) {
      throw new ForbiddenError('Access denied to private quiz');
    }
  }
}

module.exports = { parsePagination, checkQuizAccess };
