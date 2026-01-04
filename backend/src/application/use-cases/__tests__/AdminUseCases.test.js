const { AdminUseCases } = require('../AdminUseCases');
const { User } = require('../../../domain/entities/User');

describe('AdminUseCases', () => {
  let adminUseCases;
  let mockUserRepository;
  let mockQuizRepository;
  let mockRoomRepository;
  let mockGameSessionRepository;
  let mockAuditLogRepository;
  let adminUser;
  let regularUser;

  beforeEach(() => {
    // Create test users
    adminUser = new User({
      id: 'admin-1',
      email: 'admin@example.com',
      username: 'admin',
      role: 'admin'
    });

    regularUser = new User({
      id: 'user-1',
      email: 'user@example.com',
      username: 'regularuser',
      role: 'user'
    });

    // Mock repositories
    mockUserRepository = {
      findById: jest.fn(),
      findAll: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn()
    };

    mockQuizRepository = {
      findById: jest.fn(),
      getAll: jest.fn(),
      delete: jest.fn(),
      deleteByCreator: jest.fn()
    };

    mockRoomRepository = {
      findByPin: jest.fn(),
      getAll: jest.fn(),
      delete: jest.fn()
    };

    mockGameSessionRepository = {
      findById: jest.fn(),
      getRecent: jest.fn(),
      delete: jest.fn(),
      deleteByQuiz: jest.fn(),
      deleteByHost: jest.fn()
    };

    mockAuditLogRepository = {
      create: jest.fn(),
      find: jest.fn()
    };

    adminUseCases = new AdminUseCases(
      mockUserRepository,
      mockQuizRepository,
      mockRoomRepository,
      mockGameSessionRepository,
      mockAuditLogRepository
    );
  });

  describe('_validateAdmin', () => {
    it('should throw error for non-admin user', async () => {
      mockUserRepository.findById.mockResolvedValue(regularUser);

      await expect(adminUseCases.getSystemStats({ requesterId: 'user-1' }))
        .rejects.toThrow('Admin access required');
    });

    it('should throw error for non-existent user', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(adminUseCases.getSystemStats({ requesterId: 'non-existent' }))
        .rejects.toThrow('Admin access required');
    });

    it('should allow admin user', async () => {
      mockUserRepository.findById.mockResolvedValue(adminUser);
      mockUserRepository.findAll.mockResolvedValue({ users: [], pagination: { total: 0 } });
      mockQuizRepository.getAll.mockResolvedValue({ quizzes: [], pagination: { total: 0 } });
      mockRoomRepository.getAll.mockResolvedValue([]);
      mockGameSessionRepository.getRecent.mockResolvedValue({ sessions: [], pagination: { total: 0 } });

      const result = await adminUseCases.getSystemStats({ requesterId: 'admin-1' });
      expect(result.stats).toBeDefined();
    });
  });

  describe('getSystemStats', () => {
    beforeEach(() => {
      mockUserRepository.findById.mockResolvedValue(adminUser);
    });

    it('should return system statistics', async () => {
      mockUserRepository.findAll.mockResolvedValue({ users: [{}, {}], pagination: { total: 2 } });
      mockQuizRepository.getAll.mockResolvedValue({ quizzes: [{}], pagination: { total: 5 } });
      mockRoomRepository.getAll.mockResolvedValue([
        { getPlayerCount: () => 3 },
        { getPlayerCount: () => 2 }
      ]);
      mockGameSessionRepository.getRecent.mockResolvedValue({ sessions: [], pagination: { total: 10 } });

      const result = await adminUseCases.getSystemStats({ requesterId: 'admin-1' });

      expect(result.stats.users.total).toBe(2);
      expect(result.stats.quizzes.total).toBe(5);
      expect(result.stats.rooms.active).toBe(2);
      expect(result.stats.rooms.totalPlayers).toBe(5);
      expect(result.stats.sessions.total).toBe(10);
    });
  });

  describe('getAllUsers', () => {
    beforeEach(() => {
      mockUserRepository.findById.mockResolvedValue(adminUser);
    });

    it('should return paginated users', async () => {
      const mockUsers = [regularUser];
      mockUserRepository.findAll.mockResolvedValue({
        users: mockUsers,
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
      });

      const result = await adminUseCases.getAllUsers({ requesterId: 'admin-1' });

      expect(result.users).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
    });
  });

  describe('getUserById', () => {
    beforeEach(() => {
      mockUserRepository.findById.mockImplementation((id) => {
        if (id === 'admin-1') return Promise.resolve(adminUser);
        if (id === 'user-1') return Promise.resolve(regularUser);
        return Promise.resolve(null);
      });
    });

    it('should return user by id', async () => {
      const result = await adminUseCases.getUserById({
        requesterId: 'admin-1',
        userId: 'user-1'
      });

      expect(result.user.id).toBe('user-1');
    });

    it('should throw error for non-existent user', async () => {
      await expect(adminUseCases.getUserById({
        requesterId: 'admin-1',
        userId: 'non-existent'
      })).rejects.toThrow('User not found');
    });
  });

  describe('updateUserRole', () => {
    beforeEach(() => {
      mockUserRepository.findById.mockImplementation((id) => {
        if (id === 'admin-1') return Promise.resolve(adminUser);
        if (id === 'user-1') return Promise.resolve(regularUser);
        return Promise.resolve(null);
      });
    });

    it('should update user role', async () => {
      const updatedUser = new User({
        id: 'user-1',
        email: 'user@example.com',
        username: 'regularuser',
        role: 'admin'
      });
      mockUserRepository.updateById.mockResolvedValue(updatedUser);

      const result = await adminUseCases.updateUserRole({
        requesterId: 'admin-1',
        userId: 'user-1',
        role: 'admin'
      });

      expect(result.user.role).toBe('admin');
      expect(mockAuditLogRepository.create).toHaveBeenCalled();
    });

    it('should throw error for invalid role', async () => {
      await expect(adminUseCases.updateUserRole({
        requesterId: 'admin-1',
        userId: 'user-1',
        role: 'superadmin'
      })).rejects.toThrow('Invalid role');
    });

    it('should prevent admin from demoting themselves', async () => {
      await expect(adminUseCases.updateUserRole({
        requesterId: 'admin-1',
        userId: 'admin-1',
        role: 'user'
      })).rejects.toThrow('Cannot demote yourself');
    });
  });

  describe('updateUserStatus', () => {
    beforeEach(() => {
      mockUserRepository.findById.mockImplementation((id) => {
        if (id === 'admin-1') return Promise.resolve(adminUser);
        if (id === 'user-1') return Promise.resolve(regularUser);
        return Promise.resolve(null);
      });
    });

    it('should update user status', async () => {
      const updatedUser = new User({
        id: 'user-1',
        email: 'user@example.com',
        username: 'regularuser',
        isActive: false
      });
      mockUserRepository.updateById.mockResolvedValue(updatedUser);

      const result = await adminUseCases.updateUserStatus({
        requesterId: 'admin-1',
        userId: 'user-1',
        isActive: false
      });

      expect(result.user.isActive).toBe(false);
      expect(mockAuditLogRepository.create).toHaveBeenCalled();
    });

    it('should throw error for invalid isActive', async () => {
      await expect(adminUseCases.updateUserStatus({
        requesterId: 'admin-1',
        userId: 'user-1',
        isActive: 'yes'
      })).rejects.toThrow('isActive must be a boolean');
    });

    it('should prevent admin from deactivating themselves', async () => {
      await expect(adminUseCases.updateUserStatus({
        requesterId: 'admin-1',
        userId: 'admin-1',
        isActive: false
      })).rejects.toThrow('Cannot deactivate yourself');
    });
  });

  describe('deleteUser', () => {
    beforeEach(() => {
      mockUserRepository.findById.mockImplementation((id) => {
        if (id === 'admin-1') return Promise.resolve(adminUser);
        if (id === 'user-1') return Promise.resolve(regularUser);
        return Promise.resolve(null);
      });
    });

    it('should delete user and their quizzes', async () => {
      mockQuizRepository.deleteByCreator.mockResolvedValue(3);
      mockGameSessionRepository.deleteByHost.mockResolvedValue(2);
      mockRoomRepository.getAll.mockResolvedValue([]);
      mockUserRepository.deleteById.mockResolvedValue(true);

      const result = await adminUseCases.deleteUser({
        requesterId: 'admin-1',
        userId: 'user-1'
      });

      expect(result.success).toBe(true);
      expect(mockQuizRepository.deleteByCreator).toHaveBeenCalledWith('user-1');
      expect(mockUserRepository.deleteById).toHaveBeenCalledWith('user-1');
      expect(mockAuditLogRepository.create).toHaveBeenCalled();
    });

    it('should prevent admin from deleting themselves', async () => {
      await expect(adminUseCases.deleteUser({
        requesterId: 'admin-1',
        userId: 'admin-1'
      })).rejects.toThrow('Cannot delete yourself');
    });

    it('should throw error for non-existent user', async () => {
      await expect(adminUseCases.deleteUser({
        requesterId: 'admin-1',
        userId: 'non-existent'
      })).rejects.toThrow('User not found');
    });
  });

  describe('getAllQuizzes', () => {
    beforeEach(() => {
      mockUserRepository.findById.mockResolvedValue(adminUser);
    });

    it('should return all quizzes with pagination', async () => {
      mockQuizRepository.getAll.mockResolvedValue({
        quizzes: [{ id: 'quiz-1' }],
        pagination: { page: 1, limit: 20, total: 1 }
      });

      const result = await adminUseCases.getAllQuizzes({ requesterId: 'admin-1' });

      expect(result.quizzes).toHaveLength(1);
    });
  });

  describe('deleteQuiz', () => {
    beforeEach(() => {
      mockUserRepository.findById.mockResolvedValue(adminUser);
    });

    it('should delete quiz and related sessions', async () => {
      mockQuizRepository.findById.mockResolvedValue({ id: 'quiz-1', title: 'Test Quiz', createdBy: 'user-1' });
      mockRoomRepository.getAll.mockResolvedValue([]);
      mockGameSessionRepository.deleteByQuiz.mockResolvedValue(2);
      mockQuizRepository.delete.mockResolvedValue(true);

      const result = await adminUseCases.deleteQuiz({
        requesterId: 'admin-1',
        quizId: 'quiz-1'
      });

      expect(result.success).toBe(true);
      expect(mockGameSessionRepository.deleteByQuiz).toHaveBeenCalledWith('quiz-1');
      expect(mockAuditLogRepository.create).toHaveBeenCalled();
    });

    it('should throw error if quiz is in active game', async () => {
      mockQuizRepository.findById.mockResolvedValue({ id: 'quiz-1', title: 'Test Quiz' });
      mockRoomRepository.getAll.mockResolvedValue([{ quizId: 'quiz-1' }]);

      await expect(adminUseCases.deleteQuiz({
        requesterId: 'admin-1',
        quizId: 'quiz-1'
      })).rejects.toThrow('Cannot delete quiz while it is being used in an active game');
    });

    it('should throw error for non-existent quiz', async () => {
      mockQuizRepository.findById.mockResolvedValue(null);

      await expect(adminUseCases.deleteQuiz({
        requesterId: 'admin-1',
        quizId: 'non-existent'
      })).rejects.toThrow('Quiz not found');
    });
  });

  describe('getActiveRooms', () => {
    beforeEach(() => {
      mockUserRepository.findById.mockResolvedValue(adminUser);
    });

    it('should return active rooms', async () => {
      mockRoomRepository.getAll.mockResolvedValue([
        {
          pin: '123456',
          state: 'WAITING_PLAYERS',
          getPlayerCount: () => 3,
          getSpectatorCount: () => 1,
          createdAt: new Date(),
          quizId: 'quiz-1',
          isPaused: () => false
        }
      ]);

      const result = await adminUseCases.getActiveRooms({ requesterId: 'admin-1' });

      expect(result.rooms).toHaveLength(1);
      expect(result.rooms[0].pin).toBe('123456');
      expect(result.rooms[0].playerCount).toBe(3);
    });
  });

  describe('closeRoom', () => {
    beforeEach(() => {
      mockUserRepository.findById.mockResolvedValue(adminUser);
    });

    it('should close room', async () => {
      mockRoomRepository.findByPin.mockResolvedValue({
        pin: '123456',
        state: 'WAITING_PLAYERS',
        getPlayerCount: () => 3,
        getSpectatorCount: () => 1,
        quizId: 'quiz-1'
      });
      mockRoomRepository.delete.mockResolvedValue(true);

      const result = await adminUseCases.closeRoom({
        requesterId: 'admin-1',
        pin: '123456'
      });

      expect(result.success).toBe(true);
      expect(result.pin).toBe('123456');
      expect(mockAuditLogRepository.create).toHaveBeenCalled();
    });

    it('should throw error for non-existent room', async () => {
      mockRoomRepository.findByPin.mockResolvedValue(null);

      await expect(adminUseCases.closeRoom({
        requesterId: 'admin-1',
        pin: '999999'
      })).rejects.toThrow('Room not found');
    });
  });

  describe('getAllSessions', () => {
    beforeEach(() => {
      mockUserRepository.findById.mockResolvedValue(adminUser);
    });

    it('should return paginated sessions', async () => {
      mockGameSessionRepository.getRecent.mockResolvedValue({
        sessions: [{ id: 'session-1' }],
        pagination: { page: 1, limit: 20, total: 1 }
      });

      const result = await adminUseCases.getAllSessions({ requesterId: 'admin-1' });

      expect(result.sessions).toHaveLength(1);
    });
  });

  describe('deleteSession', () => {
    beforeEach(() => {
      mockUserRepository.findById.mockResolvedValue(adminUser);
    });

    it('should delete session', async () => {
      mockGameSessionRepository.findById.mockResolvedValue({
        id: 'session-1',
        pin: '123456',
        status: 'completed'
      });
      mockGameSessionRepository.delete.mockResolvedValue(true);

      const result = await adminUseCases.deleteSession({
        requesterId: 'admin-1',
        sessionId: 'session-1'
      });

      expect(result.success).toBe(true);
      expect(mockAuditLogRepository.create).toHaveBeenCalled();
    });

    it('should throw error for non-existent session', async () => {
      mockGameSessionRepository.findById.mockResolvedValue(null);

      await expect(adminUseCases.deleteSession({
        requesterId: 'admin-1',
        sessionId: 'non-existent'
      })).rejects.toThrow('Session not found');
    });
  });

  describe('getAuditLogs', () => {
    beforeEach(() => {
      mockUserRepository.findById.mockResolvedValue(adminUser);
    });

    it('should return audit logs', async () => {
      mockAuditLogRepository.find.mockResolvedValue({
        logs: [{ action: 'USER_DELETED' }],
        pagination: { page: 1, limit: 50, total: 1 }
      });

      const result = await adminUseCases.getAuditLogs({ requesterId: 'admin-1' });

      expect(result.logs).toHaveLength(1);
    });

    it('should filter by action', async () => {
      mockAuditLogRepository.find.mockResolvedValue({
        logs: [],
        pagination: { page: 1, limit: 50, total: 0 }
      });

      await adminUseCases.getAuditLogs({
        requesterId: 'admin-1',
        action: 'USER_DELETED'
      });

      expect(mockAuditLogRepository.find).toHaveBeenCalledWith(
        { action: 'USER_DELETED' },
        { page: 1, limit: 50 }
      );
    });

    it('should return empty when no audit repository', async () => {
      const useCasesWithoutAudit = new AdminUseCases(
        mockUserRepository,
        mockQuizRepository,
        mockRoomRepository,
        mockGameSessionRepository,
        null
      );

      const result = await useCasesWithoutAudit.getAuditLogs({ requesterId: 'admin-1' });

      expect(result.logs).toEqual([]);
    });
  });
});
