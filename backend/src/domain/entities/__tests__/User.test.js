const { User } = require('../User');

describe('User', () => {
  let user;

  beforeEach(() => {
    user = new User({
      id: 'user-1',
      email: 'test@example.com',
      username: 'testuser'
    });
  });

  describe('constructor', () => {
    it('should create user with default values', () => {
      expect(user.id).toBe('user-1');
      expect(user.email).toBe('test@example.com');
      expect(user.username).toBe('testuser');
      expect(user.role).toBe('user');
      expect(user.isActive).toBe(true);
      expect(user.password).toBeNull();
      expect(user.passwordResetToken).toBeNull();
      expect(user.passwordResetExpires).toBeNull();
      expect(user.createdAt).toBeInstanceOf(Date);
      expect(user.updatedAt).toBeInstanceOf(Date);
    });

    it('should normalize email to lowercase', () => {
      const upperUser = new User({
        id: 'u-1',
        email: 'TEST@EXAMPLE.COM',
        username: 'test'
      });
      expect(upperUser.email).toBe('test@example.com');
    });

    it('should trim email and username', () => {
      const spacedUser = new User({
        id: 'u-1',
        email: '  test@example.com  ',
        username: '  testuser  '
      });
      expect(spacedUser.email).toBe('test@example.com');
      expect(spacedUser.username).toBe('testuser');
    });

    it('should throw error for missing id', () => {
      expect(() => new User({
        email: 'test@example.com',
        username: 'test'
      })).toThrow('User id is required');
    });

    it('should throw error for missing email', () => {
      expect(() => new User({
        id: 'u-1',
        username: 'test'
      })).toThrow('Email is required');
    });

    it('should throw error for missing username', () => {
      expect(() => new User({
        id: 'u-1',
        email: 'test@example.com'
      })).toThrow('Username is required');
    });

    it('should throw error for invalid email format', () => {
      expect(() => new User({
        id: 'u-1',
        email: 'invalid-email',
        username: 'test'
      })).toThrow('Invalid email format');
    });

    it('should throw error for username too short', () => {
      expect(() => new User({
        id: 'u-1',
        email: 'test@example.com',
        username: 'a'
      })).toThrow('Username must be at least 2 characters');
    });

    it('should throw error for username too long', () => {
      const longUsername = 'a'.repeat(31);
      expect(() => new User({
        id: 'u-1',
        email: 'test@example.com',
        username: longUsername
      })).toThrow('Username must be at most 30 characters');
    });

    it('should default invalid role to user', () => {
      const invalidRoleUser = new User({
        id: 'u-1',
        email: 'test@example.com',
        username: 'test',
        role: 'superadmin'
      });
      expect(invalidRoleUser.role).toBe('user');
    });

    it('should accept admin role', () => {
      const adminUser = new User({
        id: 'u-1',
        email: 'admin@example.com',
        username: 'admin',
        role: 'admin'
      });
      expect(adminUser.role).toBe('admin');
    });
  });

  describe('updateUsername', () => {
    it('should update username', () => {
      const oldUpdatedAt = user.updatedAt;
      user.updateUsername('newname');
      expect(user.username).toBe('newname');
      expect(user.updatedAt.getTime()).toBeGreaterThanOrEqual(oldUpdatedAt.getTime());
    });

    it('should trim new username', () => {
      user.updateUsername('  spacedname  ');
      expect(user.username).toBe('spacedname');
    });

    it('should throw error for empty username', () => {
      expect(() => user.updateUsername('')).toThrow('Username is required');
      expect(() => user.updateUsername('   ')).toThrow('Username is required');
    });

    it('should throw error for invalid length', () => {
      expect(() => user.updateUsername('a')).toThrow('Username must be between 2 and 30 characters');
      expect(() => user.updateUsername('a'.repeat(31))).toThrow('Username must be between 2 and 30 characters');
    });
  });

  describe('password reset token', () => {
    it('should set password reset token', () => {
      const hashedToken = 'hashed-token-123';
      user.setPasswordResetToken(hashedToken);

      expect(user.passwordResetToken).toBe(hashedToken);
      expect(user.passwordResetExpires).toBeInstanceOf(Date);
      expect(user.passwordResetExpires.getTime()).toBeGreaterThan(Date.now());
    });

    it('should set token with custom expiry', () => {
      const hashedToken = 'hashed-token-123';
      const expiryMs = 30 * 60 * 1000; // 30 minutes
      user.setPasswordResetToken(hashedToken, expiryMs);

      const expectedExpiry = Date.now() + expiryMs;
      expect(user.passwordResetExpires.getTime()).toBeLessThanOrEqual(expectedExpiry + 100);
      expect(user.passwordResetExpires.getTime()).toBeGreaterThanOrEqual(expectedExpiry - 100);
    });

    it('should clear password reset token', () => {
      user.setPasswordResetToken('token');
      user.clearPasswordResetToken();

      expect(user.passwordResetToken).toBeNull();
      expect(user.passwordResetExpires).toBeNull();
    });

    it('should validate token expiry', () => {
      expect(user.isPasswordResetTokenValid()).toBe(false);

      user.setPasswordResetToken('token');
      expect(user.isPasswordResetTokenValid()).toBe(true);
    });

    it('should return false for expired token', () => {
      user.passwordResetToken = 'expired-token';
      user.passwordResetExpires = new Date(Date.now() - 1000); // 1 second ago

      expect(user.isPasswordResetTokenValid()).toBe(false);
    });
  });

  describe('account activation', () => {
    it('should deactivate account', () => {
      user.deactivate();
      expect(user.isActive).toBe(false);
    });

    it('should activate account', () => {
      user.deactivate();
      user.activate();
      expect(user.isActive).toBe(true);
    });
  });

  describe('isAdmin', () => {
    it('should return false for regular user', () => {
      expect(user.isAdmin()).toBe(false);
    });

    it('should return true for admin', () => {
      const admin = new User({
        id: 'a-1',
        email: 'admin@example.com',
        username: 'admin',
        role: 'admin'
      });
      expect(admin.isAdmin()).toBe(true);
    });
  });

  describe('toPublicJSON', () => {
    it('should return public fields only', () => {
      const json = user.toPublicJSON();

      expect(json).toEqual({
        id: 'user-1',
        email: 'test@example.com',
        username: 'testuser',
        role: 'user',
        isActive: true,
        createdAt: user.createdAt
      });
      expect(json.password).toBeUndefined();
      expect(json.passwordResetToken).toBeUndefined();
    });
  });

  describe('toJWTPayload', () => {
    it('should return JWT payload fields', () => {
      const payload = user.toJWTPayload();

      expect(payload).toEqual({
        userId: 'user-1',
        email: 'test@example.com',
        username: 'testuser',
        role: 'user'
      });
    });
  });

  describe('static constants', () => {
    it('should have correct username length constraints', () => {
      expect(User.MIN_USERNAME_LENGTH).toBe(2);
      expect(User.MAX_USERNAME_LENGTH).toBe(30);
    });

    it('should have correct password length constraint', () => {
      expect(User.MIN_PASSWORD_LENGTH).toBe(6);
    });

    it('should have correct roles', () => {
      expect(User.ROLES).toEqual(['user', 'admin']);
    });
  });
});
