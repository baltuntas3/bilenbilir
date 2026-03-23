jest.mock('bcryptjs', () => ({
  genSalt: jest.fn().mockResolvedValue('salt'),
  hash: jest.fn().mockResolvedValue('hashedPwd'),
  compare: jest.fn()
}));
jest.mock('../../../api/middlewares/authMiddleware', () => ({
  generateToken: jest.fn().mockReturnValue('mock-token')
}));
jest.mock('../../../shared/utils/sanitize', () => ({
  sanitizeEmail: jest.fn(e => e ? e.toLowerCase().trim() : null)
}));
jest.mock('../../../shared/utils/validators', () => ({
  validatePassword: jest.fn(),
  validateUsername: jest.fn(),
  validateEmail: jest.fn(),
  validateRequired: jest.fn()
}));

const bcrypt = require('bcryptjs');
const { AuthUseCases } = require('../AuthUseCases');

function createMocks() {
  return {
    userRepo: {
      findByEmailOrUsername: jest.fn(),
      findByEmail: jest.fn(),
      findById: jest.fn(),
      findByUsernameExcluding: jest.fn(),
      findByResetToken: jest.fn(),
      create: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn()
    },
    quizRepo: { deleteByCreator: jest.fn().mockResolvedValue(2) },
    sessionRepo: { deleteByHost: jest.fn().mockResolvedValue(1) },
    emailService: {
      sendWelcome: jest.fn().mockResolvedValue({}),
      sendPasswordChanged: jest.fn().mockResolvedValue({}),
      sendPasswordReset: jest.fn().mockResolvedValue({})
    }
  };
}

describe('AuthUseCases', () => {
  let auth, mocks;

  beforeEach(() => {
    jest.clearAllMocks();
    mocks = createMocks();
    auth = new AuthUseCases(mocks.userRepo, mocks.quizRepo, mocks.sessionRepo, mocks.emailService);
  });

  describe('register', () => {
    it('should register new user', async () => {
      mocks.userRepo.findByEmailOrUsername.mockResolvedValue(null);
      mocks.userRepo.create.mockResolvedValue({ id: 'u1', email: 'a@b.com', username: 'user1' });
      const result = await auth.register({ email: 'a@b.com', password: 'Pass123!', username: 'user1' });
      expect(result.token).toBe('mock-token');
      expect(result.user.id).toBe('u1');
    });

    it('should throw if email exists', async () => {
      mocks.userRepo.findByEmailOrUsername.mockResolvedValue({ email: 'a@b.com' });
      await expect(auth.register({ email: 'a@b.com', password: 'Pass123!', username: 'user1' })).rejects.toThrow('Email already registered');
    });

    it('should throw if username exists', async () => {
      mocks.userRepo.findByEmailOrUsername.mockResolvedValue({ email: 'other@b.com' });
      await expect(auth.register({ email: 'a@b.com', password: 'Pass123!', username: 'user1' })).rejects.toThrow('Username already taken');
    });

    it('should handle mongo duplicate email error', async () => {
      mocks.userRepo.findByEmailOrUsername.mockResolvedValue(null);
      mocks.userRepo.create.mockRejectedValue({ code: 11000, keyPattern: { email: 1 } });
      await expect(auth.register({ email: 'a@b.com', password: 'p', username: 'u' })).rejects.toThrow('Email already registered');
    });

    it('should handle mongo duplicate username error', async () => {
      mocks.userRepo.findByEmailOrUsername.mockResolvedValue(null);
      mocks.userRepo.create.mockRejectedValue({ code: 11000, keyPattern: { username: 1 } });
      await expect(auth.register({ email: 'a@b.com', password: 'p', username: 'u' })).rejects.toThrow('Username already taken');
    });

    it('should handle generic duplicate key error', async () => {
      mocks.userRepo.findByEmailOrUsername.mockResolvedValue(null);
      mocks.userRepo.create.mockRejectedValue({ code: 11000, keyPattern: {} });
      await expect(auth.register({ email: 'a@b.com', password: 'p', username: 'u' })).rejects.toThrow('already in use');
    });

    it('should rethrow non-duplicate errors', async () => {
      mocks.userRepo.findByEmailOrUsername.mockResolvedValue(null);
      mocks.userRepo.create.mockRejectedValue(new Error('DB down'));
      await expect(auth.register({ email: 'a@b.com', password: 'p', username: 'u' })).rejects.toThrow('DB down');
    });

    it('should handle duplicate key from message', async () => {
      mocks.userRepo.findByEmailOrUsername.mockResolvedValue(null);
      mocks.userRepo.create.mockRejectedValue({ message: 'duplicate key email' });
      await expect(auth.register({ email: 'a@b.com', password: 'p', username: 'u' })).rejects.toThrow('Email already registered');
    });
  });

  describe('login', () => {
    it('should login successfully', async () => {
      mocks.userRepo.findByEmail.mockResolvedValue({ id: 'u1', email: 'a@b.com', username: 'u', password: 'hashed', isActive: true });
      bcrypt.compare.mockResolvedValue(true);
      const result = await auth.login({ email: 'a@b.com', password: 'pass' });
      expect(result.token).toBe('mock-token');
    });

    it('should throw for missing fields', async () => {
      await expect(auth.login({ email: '', password: '' })).rejects.toThrow('required');
    });

    it('should throw for user not found', async () => {
      mocks.userRepo.findByEmail.mockResolvedValue(null);
      await expect(auth.login({ email: 'a@b.com', password: 'pass' })).rejects.toThrow('Invalid credentials');
    });

    it('should throw for wrong password', async () => {
      mocks.userRepo.findByEmail.mockResolvedValue({ password: 'hashed', isActive: true });
      bcrypt.compare.mockResolvedValue(false);
      await expect(auth.login({ email: 'a@b.com', password: 'wrong' })).rejects.toThrow('Invalid credentials');
    });

    it('should throw for deactivated account', async () => {
      mocks.userRepo.findByEmail.mockResolvedValue({ password: 'hashed', isActive: false });
      bcrypt.compare.mockResolvedValue(true);
      await expect(auth.login({ email: 'a@b.com', password: 'pass' })).rejects.toThrow('deactivated');
    });
  });

  describe('getProfile', () => {
    it('should return profile', async () => {
      mocks.userRepo.findById.mockResolvedValue({ id: 'u1', email: 'a@b.com', username: 'u', role: 'user' });
      const result = await auth.getProfile('u1');
      expect(result.id).toBe('u1');
    });

    it('should throw if not found', async () => {
      mocks.userRepo.findById.mockResolvedValue(null);
      await expect(auth.getProfile('u1')).rejects.toThrow('not found');
    });
  });

  describe('updateProfile', () => {
    it('should update username', async () => {
      mocks.userRepo.findByUsernameExcluding.mockResolvedValue(null);
      mocks.userRepo.updateById.mockResolvedValue({ id: 'u1', email: 'a@b.com', username: 'newname', role: 'user' });
      const result = await auth.updateProfile('u1', { username: 'newname' });
      expect(result.user.username).toBe('newname');
    });

    it('should throw if username taken', async () => {
      mocks.userRepo.findByUsernameExcluding.mockResolvedValue({ id: 'other' });
      await expect(auth.updateProfile('u1', { username: 'taken' })).rejects.toThrow('already taken');
    });

    it('should throw if user not found', async () => {
      mocks.userRepo.findByUsernameExcluding.mockResolvedValue(null);
      mocks.userRepo.updateById.mockResolvedValue(null);
      await expect(auth.updateProfile('u1', { username: 'new' })).rejects.toThrow('not found');
    });
  });

  describe('changePassword', () => {
    it('should change password', async () => {
      mocks.userRepo.findById.mockResolvedValue({ id: 'u1', password: 'old', email: 'a@b.com' });
      bcrypt.compare.mockResolvedValue(true);
      mocks.userRepo.updateById.mockResolvedValue({});
      const result = await auth.changePassword('u1', { currentPassword: 'old', newPassword: 'New123!' });
      expect(result.message).toContain('changed');
    });

    it('should throw for missing current password', async () => {
      await expect(auth.changePassword('u1', { newPassword: 'new' })).rejects.toThrow('Current password is required');
    });

    it('should throw if user not found', async () => {
      mocks.userRepo.findById.mockResolvedValue(null);
      await expect(auth.changePassword('u1', { currentPassword: 'old', newPassword: 'new' })).rejects.toThrow('not found');
    });

    it('should throw for wrong current password', async () => {
      mocks.userRepo.findById.mockResolvedValue({ id: 'u1', password: 'hashed' });
      bcrypt.compare.mockResolvedValue(false);
      await expect(auth.changePassword('u1', { currentPassword: 'wrong', newPassword: 'new' })).rejects.toThrow('incorrect');
    });

    it('should warn when email fails', async () => {
      mocks.userRepo.findById.mockResolvedValue({ id: 'u1', password: 'old', email: 'a@b.com' });
      bcrypt.compare.mockResolvedValue(true);
      mocks.emailService.sendPasswordChanged.mockRejectedValue(new Error('fail'));
      const spy = jest.spyOn(console, 'error').mockImplementation();
      const result = await auth.changePassword('u1', { currentPassword: 'old', newPassword: 'New123!' });
      expect(result.warning).toBeDefined();
      spy.mockRestore();
    });

    it('should warn when email returns failed status', async () => {
      mocks.userRepo.findById.mockResolvedValue({ id: 'u1', password: 'old', email: 'a@b.com' });
      bcrypt.compare.mockResolvedValue(true);
      mocks.emailService.sendPasswordChanged.mockResolvedValue({ failed: true, reason: 'smtp error' });
      const spy = jest.spyOn(console, 'error').mockImplementation();
      const result = await auth.changePassword('u1', { currentPassword: 'old', newPassword: 'New123!' });
      expect(result.warning).toBeDefined();
      spy.mockRestore();
    });
  });

  describe('forgotPassword', () => {
    it('should return success even if user not found', async () => {
      mocks.userRepo.findByEmail.mockResolvedValue(null);
      const result = await auth.forgotPassword('a@b.com');
      expect(result.message).toContain('If an account');
    });

    it('should throw for missing email', async () => {
      await expect(auth.forgotPassword('')).rejects.toThrow('Email is required');
    });

    it('should throw for invalid email format', async () => {
      const { sanitizeEmail } = require('../../../shared/utils/sanitize');
      sanitizeEmail.mockReturnValueOnce(null);
      await expect(auth.forgotPassword('bad')).rejects.toThrow('Invalid email');
    });

    it('should send reset email', async () => {
      mocks.userRepo.findByEmail.mockResolvedValue({ id: 'u1', email: 'a@b.com' });
      const result = await auth.forgotPassword('a@b.com');
      expect(mocks.emailService.sendPasswordReset).toHaveBeenCalled();
      expect(result.message).toContain('If an account');
    });

    it('should log when reset email fails', async () => {
      mocks.userRepo.findByEmail.mockResolvedValue({ id: 'u1', email: 'a@b.com' });
      mocks.emailService.sendPasswordReset.mockResolvedValue({ failed: true, reason: 'err' });
      const spy = jest.spyOn(console, 'error').mockImplementation();
      await auth.forgotPassword('a@b.com');
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('resetPassword', () => {
    it('should reset password', async () => {
      mocks.userRepo.findByResetToken.mockResolvedValue({ id: 'u1' });
      const result = await auth.resetPassword({ token: 'tok', newPassword: 'New123!' });
      expect(result.message).toContain('reset');
    });

    it('should throw for missing token', async () => {
      await expect(auth.resetPassword({ newPassword: 'new' })).rejects.toThrow('Token is required');
    });

    it('should throw for invalid token', async () => {
      mocks.userRepo.findByResetToken.mockResolvedValue(null);
      await expect(auth.resetPassword({ token: 'bad', newPassword: 'New123!' })).rejects.toThrow('Invalid or expired');
    });
  });

  describe('deleteAccount', () => {
    it('should delete account and cleanup', async () => {
      mocks.userRepo.findById.mockResolvedValue({ id: 'u1', password: 'hashed' });
      bcrypt.compare.mockResolvedValue(true);
      mocks.userRepo.deleteById.mockResolvedValue(true);
      const result = await auth.deleteAccount('u1', 'password');
      expect(result.deletedQuizzes).toBe(2);
      expect(result.deletedSessions).toBe(1);
    });

    it('should throw for missing password', async () => {
      await expect(auth.deleteAccount('u1', '')).rejects.toThrow('Password is required');
    });

    it('should throw if user not found', async () => {
      mocks.userRepo.findById.mockResolvedValue(null);
      await expect(auth.deleteAccount('u1', 'pass')).rejects.toThrow('not found');
    });

    it('should throw for wrong password', async () => {
      mocks.userRepo.findById.mockResolvedValue({ id: 'u1', password: 'hashed' });
      bcrypt.compare.mockResolvedValue(false);
      await expect(auth.deleteAccount('u1', 'wrong')).rejects.toThrow('Invalid password');
    });

    it('should throw if delete fails', async () => {
      mocks.userRepo.findById.mockResolvedValue({ id: 'u1', password: 'hashed' });
      bcrypt.compare.mockResolvedValue(true);
      mocks.userRepo.deleteById.mockResolvedValue(false);
      await expect(auth.deleteAccount('u1', 'pass')).rejects.toThrow('Failed to delete');
    });

    it('should handle cleanup failures gracefully', async () => {
      mocks.userRepo.findById.mockResolvedValue({ id: 'u1', password: 'hashed' });
      bcrypt.compare.mockResolvedValue(true);
      mocks.userRepo.deleteById.mockResolvedValue(true);
      mocks.quizRepo.deleteByCreator.mockRejectedValue(new Error('fail'));
      mocks.sessionRepo.deleteByHost.mockRejectedValue(new Error('fail'));
      const spy = jest.spyOn(console, 'error').mockImplementation();
      const result = await auth.deleteAccount('u1', 'pass');
      expect(result.deletedQuizzes).toBe(0);
      expect(result.deletedSessions).toBe(0);
      spy.mockRestore();
    });

    it('should handle missing gameSessionRepository', async () => {
      const authNoSession = new AuthUseCases(mocks.userRepo, mocks.quizRepo, null, mocks.emailService);
      mocks.userRepo.findById.mockResolvedValue({ id: 'u1', password: 'hashed' });
      bcrypt.compare.mockResolvedValue(true);
      mocks.userRepo.deleteById.mockResolvedValue(true);
      const result = await authNoSession.deleteAccount('u1', 'pass');
      expect(result.deletedSessions).toBe(0);
    });
  });
});
