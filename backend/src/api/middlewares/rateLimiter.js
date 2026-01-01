const rateLimit = require('express-rate-limit');
const { RateLimitError } = require('../../shared/errors');

/**
 * Create a rate limiter with custom options
 * @param {object} options - Rate limiter options
 * @returns {Function} Express middleware
 */
const createRateLimiter = (options = {}) => {
  return rateLimit({
    windowMs: options.windowMs || 15 * 60 * 1000, // Default: 15 minutes
    max: options.max || 100, // Default: 100 requests per window
    message: options.message || 'Too many requests, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      const error = new RateLimitError(options.message || 'Too many requests, please try again later');
      res.status(error.statusCode).json({ error: error.message });
    },
    skip: (req) => {
      // Skip rate limiting in test environment
      return process.env.NODE_ENV === 'test';
    }
  });
};

/**
 * General API rate limiter
 * 100 requests per 15 minutes
 */
const generalLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests, please try again later'
});

/**
 * Authentication rate limiter (stricter)
 * 10 attempts per 15 minutes for login/register
 */
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many authentication attempts, please try again later'
});

/**
 * Password reset rate limiter (very strict)
 * 3 attempts per hour
 */
const passwordResetLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: 'Too many password reset attempts, please try again later'
});

/**
 * Quiz creation rate limiter
 * 20 quizzes per hour
 */
const quizCreationLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: 'Quiz creation limit reached, please try again later'
});

/**
 * Game creation rate limiter
 * 30 games per hour
 */
const gameCreationLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: 'Game creation limit reached, please try again later'
});

module.exports = {
  createRateLimiter,
  generalLimiter,
  authLimiter,
  passwordResetLimiter,
  quizCreationLimiter,
  gameCreationLimiter
};
