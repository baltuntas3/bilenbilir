const express = require('express');
const { authenticate } = require('../middlewares/authMiddleware');
const { authLimiter, passwordResetLimiter } = require('../middlewares/rateLimiter');
const { AuthUseCases } = require('../../application/use-cases');
const { emailService } = require('../../infrastructure/services');
const { mongoUserRepository, mongoQuizRepository, gameSessionRepository } = require('../../infrastructure/repositories');
const { setTokenCookie, clearTokenCookie } = require('../helpers/cookieHelper');

const router = express.Router();

const authUseCases = new AuthUseCases(
  mongoUserRepository,
  mongoQuizRepository,
  gameSessionRepository,
  emailService
);

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const { email, password, username } = req.body;
    const result = await authUseCases.register({ email, password, username });
    setTokenCookie(res, result.token);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/login
 * Login user
 */
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await authUseCases.login({ email, password });
    setTokenCookie(res, result.token);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/logout
 * Clear auth cookie
 */
router.post('/logout', (req, res) => {
  clearTokenCookie(res);
  res.json({ message: 'Logged out' });
});

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const result = await authUseCases.getProfile(req.user.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/auth/profile
 * Update user profile (username)
 */
router.put('/profile', authenticate, async (req, res, next) => {
  try {
    const { username } = req.body;
    const result = await authUseCases.updateProfile(req.user.id, { username });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/auth/change-password
 * Change password (requires current password)
 */
router.put('/change-password', authenticate, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const result = await authUseCases.changePassword(req.user.id, { currentPassword, newPassword });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/forgot-password
 * Request password reset (generates token)
 */
router.post('/forgot-password', passwordResetLimiter, async (req, res, next) => {
  try {
    const { email } = req.body;
    const result = await authUseCases.forgotPassword(email);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/reset-password
 * Reset password using token
 */
router.post('/reset-password', passwordResetLimiter, async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;
    const result = await authUseCases.resetPassword({ token, newPassword });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/auth/account
 * Delete user account and all associated data
 * Requires password confirmation for security
 */
router.delete('/account', authenticate, async (req, res, next) => {
  try {
    const { password } = req.body;
    const result = await authUseCases.deleteAccount(req.user.id, password);
    clearTokenCookie(res);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
