const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { generateToken } = require('../../api/middlewares/authMiddleware');
const { sanitizeEmail } = require('../../shared/utils/sanitize');
const {
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  InternalError
} = require('../../shared/errors');

class AuthUseCases {
  constructor(userRepository, quizRepository, gameSessionRepository, emailService) {
    this.userRepository = userRepository;
    this.quizRepository = quizRepository;
    this.gameSessionRepository = gameSessionRepository;
    this.emailService = emailService;
  }

  /**
   * Register a new user
   * @param {Object} params
   * @param {string} params.email
   * @param {string} params.password
   * @param {string} params.username
   * @returns {Promise<{message: string, user: Object, token: string}>}
   */
  async register({ email, password, username }) {
    if (!email || !password || !username) {
      throw new ValidationError('Email, password, and username are required');
    }

    if (password.length < 6) {
      throw new ValidationError('Password must be at least 6 characters');
    }

    // Check if user already exists
    const existingUser = await this.userRepository.findByEmailOrUsername(email, username);

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
      user = await this.userRepository.create({
        email,
        password: hashedPassword,
        username
      });
    } catch (error) {
      // Handle MongoDB duplicate key error (race condition)
      if (error.code === 11000 || error.message?.includes('duplicate key')) {
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
    this.emailService.sendWelcome(user.email, user.username).catch(err => {
      console.error('Failed to send welcome email:', err.message);
    });

    return {
      message: 'User registered successfully',
      user: {
        id: user.id,
        email: user.email,
        username: user.username
      },
      token
    };
  }

  /**
   * Login user
   * @param {Object} params
   * @param {string} params.email
   * @param {string} params.password
   * @returns {Promise<{message: string, user: Object, token: string}>}
   */
  async login({ email, password }) {
    if (!email || !password) {
      throw new ValidationError('Email and password are required');
    }

    // Find user with password for authentication
    const user = await this.userRepository.findByEmail(email, { includePassword: true });

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

    return {
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        username: user.username
      },
      token
    };
  }

  /**
   * Get user profile by ID
   * @param {string} userId
   * @returns {Promise<{id: string, email: string, username: string, role: string}>}
   */
  async getProfile(userId) {
    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new NotFoundError('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role
    };
  }

  /**
   * Update user profile (username)
   * @param {string} userId
   * @param {Object} params
   * @param {string} params.username
   * @returns {Promise<{message: string, user: Object}>}
   */
  async updateProfile(userId, { username }) {
    if (!username) {
      throw new ValidationError('Username is required');
    }

    if (username.length < 2 || username.length > 30) {
      throw new ValidationError('Username must be between 2 and 30 characters');
    }

    // Check if username is already taken by another user
    const existingUser = await this.userRepository.findByUsernameExcluding(username, userId);
    if (existingUser) {
      throw new ConflictError('Username already taken');
    }

    const user = await this.userRepository.updateById(userId, { username });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    return {
      message: 'Profile updated successfully',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role
      }
    };
  }

  /**
   * Change user password
   * @param {string} userId
   * @param {Object} params
   * @param {string} params.currentPassword
   * @param {string} params.newPassword
   * @returns {Promise<{message: string, warning?: string}>}
   */
  async changePassword(userId, { currentPassword, newPassword }) {
    if (!currentPassword || !newPassword) {
      throw new ValidationError('Current password and new password are required');
    }

    if (newPassword.length < 6) {
      throw new ValidationError('New password must be at least 6 characters');
    }

    const user = await this.userRepository.findById(userId, { includePassword: true });
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

    await this.userRepository.updateById(userId, { password: hashedPassword });

    // Send password changed notification
    let emailWarning = null;
    try {
      const emailResult = await this.emailService.sendPasswordChanged(user.email);
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
    return response;
  }

  /**
   * Request password reset (generates token and sends email)
   * @param {string} email
   * @returns {Promise<{message: string}>}
   */
  async forgotPassword(email) {
    if (!email) {
      throw new ValidationError('Email is required');
    }

    const sanitizedEmail = sanitizeEmail(email);
    if (!sanitizedEmail) {
      throw new ValidationError('Invalid email format');
    }

    const user = await this.userRepository.findByEmail(sanitizedEmail);

    // Always return success to prevent email enumeration
    if (!user) {
      return { message: 'If an account with that email exists, a password reset link has been sent' };
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Set token and expiration (1 hour)
    await this.userRepository.updateById(user.id, {
      passwordResetToken: hashedToken,
      passwordResetExpires: new Date(Date.now() + 60 * 60 * 1000)
    });

    // Send password reset email
    const emailResult = await this.emailService.sendPasswordReset(user.email, resetToken);

    // Log email failures for monitoring (but don't expose to user for security)
    if (emailResult && (emailResult.failed || emailResult.skipped)) {
      console.error('Password reset email failed:', {
        reason: emailResult.reason || emailResult.error,
        email: user.email
      });
    }

    return {
      message: 'If an account with that email exists, a password reset link has been sent'
    };
  }

  /**
   * Reset password using token
   * @param {Object} params
   * @param {string} params.token
   * @param {string} params.newPassword
   * @returns {Promise<{message: string}>}
   */
  async resetPassword({ token, newPassword }) {
    if (!token || !newPassword) {
      throw new ValidationError('Token and new password are required');
    }

    if (newPassword.length < 6) {
      throw new ValidationError('Password must be at least 6 characters');
    }

    // Hash the provided token to compare with stored hash
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await this.userRepository.findByResetToken(hashedToken);

    if (!user) {
      throw new UnauthorizedError('Invalid or expired reset token');
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password and clear reset token
    await this.userRepository.updateById(user.id, {
      password: hashedPassword,
      passwordResetToken: null,
      passwordResetExpires: null
    });

    return { message: 'Password reset successfully' };
  }

  /**
   * Delete user account and all associated data
   * @param {string} userId
   * @param {string} password
   * @returns {Promise<{message: string, deletedQuizzes: number, deletedSessions: number}>}
   */
  async deleteAccount(userId, password) {
    if (!password) {
      throw new ValidationError('Password is required to delete account');
    }

    // Verify password
    const user = await this.userRepository.findById(userId, { includePassword: true });
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new UnauthorizedError('Invalid password');
    }

    // Delete user's quizzes
    const deletedQuizzes = await this.quizRepository.deleteByCreator(userId);

    // Delete user's game sessions
    let deletedSessions = 0;
    if (this.gameSessionRepository && this.gameSessionRepository.deleteByHost) {
      deletedSessions = await this.gameSessionRepository.deleteByHost(userId);
    }

    // Delete user account
    const deleted = await this.userRepository.deleteById(userId);

    if (!deleted) {
      throw new InternalError('Failed to delete account');
    }

    return {
      message: 'Account deleted successfully',
      deletedQuizzes,
      deletedSessions
    };
  }
}

module.exports = { AuthUseCases };
