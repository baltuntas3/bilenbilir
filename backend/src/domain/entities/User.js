const { ValidationError } = require('../../shared/errors');

/**
 * User Domain Entity
 * Represents an authenticated user in the system
 */
class User {
  static MIN_USERNAME_LENGTH = 2;
  static MAX_USERNAME_LENGTH = 30;
  static MIN_PASSWORD_LENGTH = 6;
  static ROLES = ['user', 'admin'];

  constructor({
    id,
    email,
    username,
    password = null, // Only included when needed for auth
    role = 'user',
    isActive = true,
    passwordResetToken = null,
    passwordResetExpires = null,
    createdAt = new Date(),
    updatedAt = new Date()
  }) {
    if (!id) {
      throw new ValidationError('User id is required');
    }
    if (!email) {
      throw new ValidationError('Email is required');
    }
    if (!username) {
      throw new ValidationError('Username is required');
    }

    this.id = id;
    this.email = email.toLowerCase().trim();
    this.username = username.trim();
    this.password = password;
    this.role = User.ROLES.includes(role) ? role : 'user';
    this.isActive = Boolean(isActive);
    this.passwordResetToken = passwordResetToken;
    this.passwordResetExpires = passwordResetExpires;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;

    this._validateUsername();
  }

  /**
   * Validate username constraints
   * @private
   */
  _validateUsername() {
    if (this.username.length < User.MIN_USERNAME_LENGTH) {
      throw new ValidationError(`Username must be at least ${User.MIN_USERNAME_LENGTH} characters`);
    }
    if (this.username.length > User.MAX_USERNAME_LENGTH) {
      throw new ValidationError(`Username must be at most ${User.MAX_USERNAME_LENGTH} characters`);
    }
  }

  /**
   * Update username
   * @param {string} newUsername
   */
  updateUsername(newUsername) {
    if (!newUsername || !newUsername.trim()) {
      throw new ValidationError('Username is required');
    }
    const trimmed = newUsername.trim();
    if (trimmed.length < User.MIN_USERNAME_LENGTH || trimmed.length > User.MAX_USERNAME_LENGTH) {
      throw new ValidationError(`Username must be between ${User.MIN_USERNAME_LENGTH} and ${User.MAX_USERNAME_LENGTH} characters`);
    }
    this.username = trimmed;
    this.updatedAt = new Date();
  }

  /**
   * Set password reset token
   * @param {string} hashedToken - SHA256 hashed token
   * @param {number} expiresInMs - Expiration time in milliseconds (default 1 hour)
   */
  setPasswordResetToken(hashedToken, expiresInMs = 60 * 60 * 1000) {
    this.passwordResetToken = hashedToken;
    this.passwordResetExpires = new Date(Date.now() + expiresInMs);
    this.updatedAt = new Date();
  }

  /**
   * Clear password reset token
   */
  clearPasswordResetToken() {
    this.passwordResetToken = null;
    this.passwordResetExpires = null;
    this.updatedAt = new Date();
  }

  /**
   * Check if password reset token is valid (not expired)
   * @returns {boolean}
   */
  isPasswordResetTokenValid() {
    if (!this.passwordResetToken || !this.passwordResetExpires) {
      return false;
    }
    return this.passwordResetExpires.getTime() > Date.now();
  }

  /**
   * Deactivate user account
   */
  deactivate() {
    this.isActive = false;
    this.updatedAt = new Date();
  }

  /**
   * Activate user account
   */
  activate() {
    this.isActive = true;
    this.updatedAt = new Date();
  }

  /**
   * Check if user is admin
   * @returns {boolean}
   */
  isAdmin() {
    return this.role === 'admin';
  }

  /**
   * Convert to public JSON (excludes sensitive fields)
   * @returns {Object}
   */
  toPublicJSON() {
    return {
      id: this.id,
      email: this.email,
      username: this.username,
      role: this.role,
      isActive: this.isActive,
      createdAt: this.createdAt
    };
  }

  /**
   * Convert to JSON for JWT payload
   * @returns {Object}
   */
  toJWTPayload() {
    return {
      userId: this.id,
      email: this.email,
      username: this.username,
      role: this.role
    };
  }
}

module.exports = { User };
