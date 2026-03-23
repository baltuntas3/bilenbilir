const { AdminUseCases } = require('../AdminUseCases');

function createMocks() {
  const admin = { id: 'admin1', email: 'admin@x.com', role: 'admin' };
  return {
    userRepo: {
      findById: jest.fn().mockResolvedValue(admin),
      findAll: jest.fn().mockResolvedValue({ users: [], pagination: { total: 0 } }),
      updateById: jest.fn().mockResolvedValue({ ...admin, toPublicJSON: () => admin }),
      deleteById: jest.fn().mockResolvedValue(true)
    },
    quizRepo: {
      findById: jest.fn(),
      getAll: jest.fn().mockResolvedValue({ quizzes: [], pagination: { total: 0 } }),
      delete: jest.fn(),
      deleteByCreator: jest.fn().mockResolvedValue(0)
    },
    roomRepo: {
      findByPin: jest.fn(),
      getAll: jest.fn().mockResolvedValue([]),
      delete: jest.fn()
    },
    sessionRepo: {
      getRecent: jest.fn().mockResolvedValue({ sessions: [], pagination: { total: 0 } }),
      findById: jest.fn(),
      delete: jest.fn(),
      deleteByHost: jest.fn().mockResolvedValue(0),
      deleteByQuiz: jest.fn().mockResolvedValue(0)
    },
    auditRepo: { create: jest.fn(), find: jest.fn() },
    admin
  };
}

describe('AdminUseCases edge cases', () => {
  let uc, mocks;

  beforeEach(() => {
    mocks = createMocks();
    uc = new AdminUseCases(mocks.userRepo, mocks.quizRepo, mocks.roomRepo, mocks.sessionRepo, mocks.auditRepo);
  });

  describe('_logAction failure', () => {
    it('should not throw when audit log fails', async () => {
      mocks.auditRepo.create.mockRejectedValue(new Error('DB fail'));
      const spy = jest.spyOn(console, 'error').mockImplementation();
      await uc._logAction(mocks.admin, 'TEST', 'test', 'id1');
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('should skip when no audit repo', async () => {
      uc = new AdminUseCases(mocks.userRepo, mocks.quizRepo, mocks.roomRepo, mocks.sessionRepo, null);
      await uc._logAction(mocks.admin, 'TEST', 'test', 'id1');
    });
  });

  describe('getAllUsers fallback', () => {
    it('should return empty when findAll not available', async () => {
      mocks.userRepo.findAll = null;
      const result = await uc.getAllUsers({ requesterId: 'admin1', page: 1, limit: 20 });
      expect(result.users).toEqual([]);
    });
  });

  describe('getUserById', () => {
    it('should throw if user not found', async () => {
      mocks.userRepo.findById.mockResolvedValueOnce(mocks.admin); // _validateAdmin
      mocks.userRepo.findById.mockResolvedValueOnce(null); // getUserById
      await expect(uc.getUserById({ requesterId: 'admin1', userId: 'u1' })).rejects.toThrow('not found');
    });
  });

  describe('updateUserRole', () => {
    it('should throw if target user not found', async () => {
      mocks.userRepo.findById
        .mockResolvedValueOnce(mocks.admin) // _validateAdmin
        .mockResolvedValueOnce(null); // findById target
      await expect(uc.updateUserRole({ requesterId: 'admin1', userId: 'u1', role: 'user' })).rejects.toThrow('not found');
    });
  });

  describe('updateUserStatus', () => {
    it('should throw if target user not found', async () => {
      mocks.userRepo.findById
        .mockResolvedValueOnce(mocks.admin) // _validateAdmin
        .mockResolvedValueOnce(null); // findById target
      await expect(uc.updateUserStatus({ requesterId: 'admin1', userId: 'u1', isActive: false })).rejects.toThrow('not found');
    });
  });

  describe('deleteUser', () => {
    it('should close rooms and cleanup on delete', async () => {
      const targetUser = { id: 'target', email: 't@x.com', username: 'tuser', role: 'user' };
      mocks.userRepo.findById
        .mockResolvedValueOnce(mocks.admin)
        .mockResolvedValueOnce(targetUser);
      mocks.roomRepo.getAll.mockResolvedValue([
        { hostUserId: 'target', pin: '123456', getPlayerCount: () => 2, getSpectatorCount: () => 1 }
      ]);
      const onRoomClosed = jest.fn().mockResolvedValue(undefined);
      uc.onRoomClosed = onRoomClosed;
      await uc.deleteUser({ requesterId: 'admin1', userId: 'target' });
      expect(onRoomClosed).toHaveBeenCalled();
      expect(mocks.roomRepo.delete).toHaveBeenCalledWith('123456');
    });

    it('should handle onRoomClosed failure', async () => {
      const targetUser = { id: 'target', email: 't@x.com', username: 'tuser', role: 'user' };
      mocks.userRepo.findById
        .mockResolvedValueOnce(mocks.admin)
        .mockResolvedValueOnce(targetUser);
      mocks.roomRepo.getAll.mockResolvedValue([
        { hostUserId: 'target', pin: '123456', getPlayerCount: () => 0, getSpectatorCount: () => 0 }
      ]);
      uc.onRoomClosed = jest.fn().mockRejectedValue(new Error('notify failed'));
      const spy = jest.spyOn(console, 'error').mockImplementation();
      await uc.deleteUser({ requesterId: 'admin1', userId: 'target' });
      spy.mockRestore();
    });

    it('should handle quiz cleanup failure', async () => {
      const targetUser = { id: 'target', email: 't@x.com', username: 'tuser', role: 'user' };
      mocks.userRepo.findById
        .mockResolvedValueOnce(mocks.admin)
        .mockResolvedValueOnce(targetUser);
      mocks.quizRepo.deleteByCreator.mockRejectedValue(new Error('fail'));
      const spy = jest.spyOn(console, 'error').mockImplementation();
      await uc.deleteUser({ requesterId: 'admin1', userId: 'target' });
      spy.mockRestore();
    });

    it('should handle session cleanup failure', async () => {
      const targetUser = { id: 'target', email: 't@x.com', username: 'tuser', role: 'user' };
      mocks.userRepo.findById
        .mockResolvedValueOnce(mocks.admin)
        .mockResolvedValueOnce(targetUser);
      mocks.sessionRepo.deleteByHost.mockRejectedValue(new Error('fail'));
      const spy = jest.spyOn(console, 'error').mockImplementation();
      await uc.deleteUser({ requesterId: 'admin1', userId: 'target' });
      spy.mockRestore();
    });
  });

  describe('closeRoom', () => {
    it('should throw if no room repo', async () => {
      uc = new AdminUseCases(mocks.userRepo, mocks.quizRepo, null, mocks.sessionRepo, mocks.auditRepo);
      await expect(uc.closeRoom({ requesterId: 'admin1', pin: '123456' })).rejects.toThrow('not available');
    });

    it('should handle onRoomClosed failure', async () => {
      const room = { pin: '123456', state: 'PLAYING', getPlayerCount: () => 1, getSpectatorCount: () => 0, quizId: 'q1' };
      mocks.roomRepo.findByPin.mockResolvedValue(room);
      uc.onRoomClosed = jest.fn().mockRejectedValue(new Error('fail'));
      const spy = jest.spyOn(console, 'error').mockImplementation();
      await uc.closeRoom({ requesterId: 'admin1', pin: '123456' });
      spy.mockRestore();
    });
  });

  describe('getAllSessions', () => {
    it('should return empty when no session repo', async () => {
      uc = new AdminUseCases(mocks.userRepo, mocks.quizRepo, mocks.roomRepo, null, mocks.auditRepo);
      const result = await uc.getAllSessions({ requesterId: 'admin1' });
      expect(result.sessions).toEqual([]);
    });
  });

  describe('deleteSession', () => {
    it('should throw if no session repo', async () => {
      uc = new AdminUseCases(mocks.userRepo, mocks.quizRepo, mocks.roomRepo, null, mocks.auditRepo);
      await expect(uc.deleteSession({ requesterId: 'admin1', sessionId: 's1' })).rejects.toThrow('not available');
    });

    it('should throw if session not found by findById', async () => {
      mocks.sessionRepo.findById.mockResolvedValue(null);
      await expect(uc.deleteSession({ requesterId: 'admin1', sessionId: 's1' })).rejects.toThrow('not found');
    });

    it('should throw if delete returns falsy', async () => {
      mocks.sessionRepo.findById.mockResolvedValue({ pin: '123456', status: 'completed' });
      mocks.sessionRepo.delete.mockResolvedValue(false);
      await expect(uc.deleteSession({ requesterId: 'admin1', sessionId: 's1' })).rejects.toThrow('not found');
    });
  });

  describe('getAuditLogs', () => {
    it('should return empty when no audit repo', async () => {
      uc = new AdminUseCases(mocks.userRepo, mocks.quizRepo, mocks.roomRepo, mocks.sessionRepo, null);
      const result = await uc.getAuditLogs({ requesterId: 'admin1' });
      expect(result.logs).toEqual([]);
    });

    it('should pass filters', async () => {
      mocks.auditRepo.find.mockResolvedValue({ logs: [] });
      await uc.getAuditLogs({ requesterId: 'admin1', action: 'TEST', targetType: 'user' });
      expect(mocks.auditRepo.find).toHaveBeenCalledWith({ action: 'TEST', targetType: 'user' }, expect.any(Object));
    });
  });
});
