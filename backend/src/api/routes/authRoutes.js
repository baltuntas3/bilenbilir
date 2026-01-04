const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { generateToken, authenticate } = require('../middlewares/authMiddleware');
const { authLimiter, passwordResetLimiter } = require('../middlewares/rateLimiter');
const { ValidationError, UnauthorizedError, ForbiddenError, NotFoundError, ConflictError, InternalError } = require('../../shared/errors');
const { sanitizeEmail } = require('../../shared/utils/sanitize');
const { emailService } = require('../../infrastructure/services');
const { mongoUserRepository, mongoQuizRepository, gameSessionRepository } = require('../../infrastructure/repositories');

const router = express.Router();

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const { email, password, username } = req.body;

    if (!email || !password || !username) {
      throw new ValidationError('Email, password, and username are required');
    }

    if (password.length < 6) {
      throw new ValidationError('Password must be at least 6 characters');
    }

    // Check if user already exists
    const existingUser = await mongoUserRepository.findByEmailOrUsername(email, username);

    if (existingUser) {
      if (existingUser.email === email.toLowerCase()) {
        throw new ConflictError('Email already registered');
      }
      throw new ConflictError('Username already taken');
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user - handle race condition with duplicate key error
    let user;
    try {
      user = await mongoUserRepository.create({
        email,
        password: hashedPassword,
        username
      });
    } catch (error) {
      // Handle MongoDB duplicate key error (race condition)
      if (error.code === 11000 || error.message?.includes('duplicate key')) {
        // Determine which field caused the conflict
        if (error.keyPattern?.email || error.message?.includes('email')) {
          throw new ConflictError('Email already registered');
        }
        if (error.keyPattern?.username || error.message?.includes('username')) {
          throw new ConflictError('Username already taken');
        }
        throw new ConflictError('Email or username already in use');
      }
      throw error;
    }

    // Generate token
    const token = generateToken(user);

    // Send welcome email (non-blocking)
    emailService.sendWelcome(user.email, user.username).catch(err => {
      console.error('Failed to send welcome email:', err.message);
    });

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user.id,
        email: user.email,
        username: user.username
      },
      token
    });
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

    if (!email || !password) {
      throw new ValidationError('Email and password are required');
    }

    // Find user with password for authentication
    const user = await mongoUserRepository.findByEmail(email, { includePassword: true });

    if (!user) {
      throw new UnauthorizedError('Invalid credentials');
    }

    // Check password first to prevent timing attacks that could reveal account existence
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      throw new UnauthorizedError('Invalid credentials');
    }

    // Check account status after password verification
    if (!user.isActive) {
      throw new ForbiddenError('Account is deactivated');
    }

    // Generate token
    const token = generateToken(user);

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        username: user.username
      },
      token
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await mongoUserRepository.findById(req.user.id);

    if (!user) {
      throw new NotFoundError('User not found');
    }

    res.json({
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role
    });
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
    const userId = req.user.id;

    if (!username) {
      throw new ValidationError('Username is required');
    }

    if (username.length < 2 || username.length > 30) {
      throw new ValidationError('Username must be between 2 and 30 characters');
    }

    // Check if username is already taken by another user
    const existingUser = await mongoUserRepository.findByUsernameExcluding(username, userId);
    if (existingUser) {
      throw new ConflictError('Username already taken');
    }

    const user = await mongoUserRepository.updateById(userId, { username });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role
      }
    });
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

    if (!currentPassword || !newPassword) {
      throw new ValidationError('Current password and new password are required');
    }

    if (newPassword.length < 6) {
      throw new ValidationError('New password must be at least 6 characters');
    }

    const user = await mongoUserRepository.findById(req.user.id, { includePassword: true });
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      throw new UnauthorizedError('Current password is incorrect');
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await mongoUserRepository.updateById(req.user.id, { password: hashedPassword });

    // Send password changed notification
    let emailWarning = null;
    try {
      const emailResult = await emailService.sendPasswordChanged(user.email);
      if (emailResult && (emailResult.failed || emailResult.skipped)) {
        emailWarning = 'Password changed but notification email could not be sent';
        console.error('Failed to send password changed email:', emailResult.reason || emailResult.error);
      }
    } catch (err) {
      emailWarning = 'Password changed but notification email could not be sent';
      console.error('Failed to send password changed email:', err.message);
    }

    const response = { message: 'Password changed successfully' };
    if (emailWarning) {
      response.warning = emailWarning;
    }
    res.json(response);
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

    if (!email) {
      throw new ValidationError('Email is required');
    }

    const sanitizedEmail = sanitizeEmail(email);
    if (!sanitizedEmail) {
      throw new ValidationError('Invalid email format');
    }

    const user = await mongoUserRepository.findByEmail(sanitizedEmail);

    // Always return success to prevent email enumeration
    if (!user) {
      res.json({ message: 'If an account with that email exists, a password reset link has been sent' });
      return;
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Set token and expiration (1 hour)
    await mongoUserRepository.updateById(user.id, {
      passwordResetToken: hashedToken,
      passwordResetExpires: new Date(Date.now() + 60 * 60 * 1000)
    });

    // Send password reset email
    const emailResult = await emailService.sendPasswordReset(user.email, resetToken);

    // Log email failures for monitoring (but don't expose to user for security)
    if (emailResult && (emailResult.failed || emailResult.skipped)) {
      console.error('Password reset email failed:', {
        reason: emailResult.reason || emailResult.error,
        email: user.email
      });
      // Note: We still return success to prevent email enumeration
      // In production, consider alerting admins about email delivery issues
    }

    res.json({
      message: 'If an account with that email exists, a password reset link has been sent'
    });
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

    if (!token || !newPassword) {
      throw new ValidationError('Token and new password are required');
    }

    if (newPassword.length < 6) {
      throw new ValidationError('Password must be at least 6 characters');
    }

    // Hash the provided token to compare with stored hash
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await mongoUserRepository.findByResetToken(hashedToken);

    if (!user) {
      throw new UnauthorizedError('Invalid or expired reset token');
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password and clear reset token
    await mongoUserRepository.updateById(user.id, {
      password: hashedPassword,
      passwordResetToken: null,
      passwordResetExpires: null
    });

    res.json({ message: 'Password reset successfully' });
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

    if (!password) {
      throw new ValidationError('Password is required to delete account');
    }

    // Verify password
    const user = await mongoUserRepository.findById(req.user.id, { includePassword: true });
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new UnauthorizedError('Invalid password');
    }

    // Delete user's quizzes
    const deletedQuizzes = await mongoQuizRepository.deleteByCreator(req.user.id);

    // Delete user's game sessions
    let deletedSessions = 0;
    if (gameSessionRepository && gameSessionRepository.deleteByHost) {
      deletedSessions = await gameSessionRepository.deleteByHost(req.user.id);
    }

    // Delete user account
    const deleted = await mongoUserRepository.deleteById(req.user.id);

    if (!deleted) {
      throw new InternalError('Failed to delete account');
    }

    res.json({
      message: 'Account deleted successfully',
      deletedQuizzes,
      deletedSessions
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
