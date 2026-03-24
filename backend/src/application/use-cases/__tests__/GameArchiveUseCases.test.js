const { GameArchiveUseCases } = require('../GameArchiveUseCases');

function createMocks() {
  const room = {
    pin: '123456',
    quizId: 'q1',
    hostUserId: 'h1',
    state: 'PODIUM',
    currentQuestionIndex: 2,
    createdAt: new Date(),
    getLeaderboard: jest.fn().mockReturnValue([
      { nickname: 'Alice', score: 500, correctAnswers: 3, longestStreak: 2 },
      { nickname: 'Bob', score: 300, correctAnswers: 2, longestStreak: 1 }
    ]),
    getAnswerHistory: jest.fn().mockReturnValue([
      { playerNickname: 'Alice', isCorrect: true, elapsedTimeMs: 2000, questionIndex: 0, answerIndex: 1, score: 500, streak: 1 },
      { playerNickname: 'Bob', isCorrect: false, elapsedTimeMs: 3000, questionIndex: 0, answerIndex: 2, score: 0, streak: 0 }
    ]),
    getPlayerCount: jest.fn().mockReturnValue(2),
    getGameStartedAt: jest.fn().mockReturnValue(new Date()),
    isTeamMode: jest.fn().mockReturnValue(false),
    getTeamLeaderboard: jest.fn().mockReturnValue([]),
    hasQuizSnapshot: jest.fn().mockReturnValue(true)
  };

  return {
    roomRepo: {
      findByPin: jest.fn().mockResolvedValue(room),
      save: jest.fn(),
      delete: jest.fn(),
      getAll: jest.fn().mockResolvedValue([room])
    },
    quizRepo: { findById: jest.fn() },
    sessionRepo: { save: jest.fn().mockResolvedValue({ id: 'session-1' }) },
    room
  };
}

describe('GameArchiveUseCases', () => {
  let uc, mocks;

  beforeEach(() => {
    mocks = createMocks();
    uc = new GameArchiveUseCases(mocks.roomRepo, mocks.quizRepo, mocks.sessionRepo);
  });

  describe('_calculatePlayerStats', () => {
    it('should aggregate stats from answer history', () => {
      const stats = uc._calculatePlayerStats([
        { playerNickname: 'Alice', isCorrect: true, elapsedTimeMs: 2000 },
        { playerNickname: 'Alice', isCorrect: false, elapsedTimeMs: 3000 },
        { playerNickname: 'Bob', isCorrect: true, elapsedTimeMs: 1000 }
      ]);
      expect(stats.get('Alice').correctCount).toBe(1);
      expect(stats.get('Alice').wrongCount).toBe(1);
      expect(stats.get('Bob').correctCount).toBe(1);
    });

    it('should skip invalid entries', () => {
      const stats = uc._calculatePlayerStats([null, { playerNickname: null }, { playerNickname: 123 }]);
      expect(stats.size).toBe(0);
    });

    it('should use responseTimeMs fallback when elapsedTimeMs is missing', () => {
      const stats = uc._calculatePlayerStats([
        { playerNickname: 'Alice', isCorrect: true, responseTimeMs: 1500 }
      ]);
      expect(stats.get('Alice').totalResponseTime).toBe(1500);
      expect(stats.get('Alice').answerCount).toBe(1);
    });
  });

  describe('_buildPlayerResults', () => {
    it('should build results with stats', () => {
      const leaderboard = [{ nickname: 'Alice', score: 500, correctAnswers: 3, longestStreak: 2 }];
      const stats = new Map([['Alice', { correctCount: 3, wrongCount: 1, totalResponseTime: 5000, answerCount: 4 }]]);
      const results = uc._buildPlayerResults(leaderboard, stats);
      expect(results[0].rank).toBe(1);
      expect(results[0].wrongAnswers).toBe(1);
      expect(results[0].averageResponseTime).toBe(1250);
    });

    it('should handle missing stats', () => {
      const results = uc._buildPlayerResults([{ nickname: 'X', score: 0, correctAnswers: 0, longestStreak: 0 }], new Map());
      expect(results[0].wrongAnswers).toBe(0);
    });
  });

  describe('_mapAnswersToSessionFormat', () => {
    it('should map answer fields', () => {
      const mapped = uc._mapAnswersToSessionFormat([
        { playerNickname: 'A', questionIndex: 0, answerIndex: 1, isCorrect: true, elapsedTimeMs: 2000, score: 500 }
      ]);
      expect(mapped[0].nickname).toBe('A');
      expect(mapped[0].responseTimeMs).toBe(2000);
    });
  });

  describe('_buildSessionData', () => {
    it('should build session data', () => {
      const data = uc._buildSessionData(mocks.room, 'completed');
      expect(data.pin).toBe('123456');
      expect(data.status).toBe('completed');
    });

    it('should include team data when team mode', () => {
      mocks.room.isTeamMode.mockReturnValue(true);
      mocks.room.getTeamLeaderboard.mockReturnValue([{ name: 'Alpha', score: 500 }]);
      const data = uc._buildSessionData(mocks.room, 'completed');
      expect(data.teamMode).toBe(true);
      expect(data.teamResults).toHaveLength(1);
    });

    it('should use createdAt when gameStartedAt is null', () => {
      mocks.room.getGameStartedAt.mockReturnValue(null);
      const data = uc._buildSessionData(mocks.room, 'completed');
      expect(data.startedAt).toBe(mocks.room.createdAt);
    });
  });

  describe('archiveGame', () => {
    it('should archive game and keep room in PODIUM state', async () => {
      const result = await uc.archiveGame({ pin: '123456' });
      expect(result.session.id).toBe('session-1');
      // Room stays in PODIUM for late reconnects/get_results — cleanup service handles deletion
      expect(mocks.roomRepo.delete).not.toHaveBeenCalled();
    });

    it('should return null if no session repo', async () => {
      uc = new GameArchiveUseCases(mocks.roomRepo, mocks.quizRepo, null);
      const result = await uc.archiveGame({ pin: '123456' });
      expect(result).toBeNull();
    });

    it('should handle room delete failure', async () => {
      mocks.roomRepo.delete.mockRejectedValue(new Error('fail'));
      const spy = jest.spyOn(console, 'error').mockImplementation();
      const result = await uc.archiveGame({ pin: '123456' });
      expect(result.session).toBeDefined();
      spy.mockRestore();
    });

    it('should clear pending answers', async () => {
      const pendingAnswers = { clearByPrefix: jest.fn() };
      await uc.archiveGame({ pin: '123456', pendingAnswers });
      expect(pendingAnswers.clearByPrefix).toHaveBeenCalledWith('123456:');
    });
  });

  describe('saveInterruptedGame', () => {
    it('should save interrupted game', async () => {
      const result = await uc.saveInterruptedGame({ pin: '123456', reason: 'host_disconnect' });
      expect(result.session).toBeDefined();
    });

    it('should return null if no session repo', async () => {
      uc = new GameArchiveUseCases(mocks.roomRepo, mocks.quizRepo, null);
      const result = await uc.saveInterruptedGame({ pin: '123456' });
      expect(result).toBeNull();
    });

    it('should return null if room not found', async () => {
      mocks.roomRepo.findByPin.mockResolvedValue(null);
      const result = await uc.saveInterruptedGame({ pin: '123456' });
      expect(result).toBeNull();
    });

    it('should return null if no quiz snapshot', async () => {
      mocks.room.hasQuizSnapshot.mockReturnValue(false);
      const result = await uc.saveInterruptedGame({ pin: '123456' });
      expect(result).toBeNull();
    });

    it('should handle room delete failure', async () => {
      mocks.roomRepo.delete.mockRejectedValue(new Error('fail'));
      const spy = jest.spyOn(console, 'error').mockImplementation();
      await uc.saveInterruptedGame({ pin: '123456' });
      spy.mockRestore();
    });
  });

  describe('saveAllInterruptedGames', () => {
    it('should save all games with snapshots', async () => {
      const result = await uc.saveAllInterruptedGames('server_shutdown');
      expect(result.saved).toBe(1);
    });

    it('should handle failures', async () => {
      mocks.roomRepo.getAll.mockResolvedValue([
        { ...mocks.room, pin: '111111', hasQuizSnapshot: () => true },
        { ...mocks.room, pin: '222222', hasQuizSnapshot: () => true }
      ]);
      // First save succeeds, second fails
      let callCount = 0;
      const originalSaveInterrupted = uc.saveInterruptedGame.bind(uc);
      jest.spyOn(uc, 'saveInterruptedGame').mockImplementation(async (params) => {
        callCount++;
        if (callCount === 2) throw new Error('fail');
        return { session: {} };
      });
      const spy = jest.spyOn(console, 'error').mockImplementation();
      const result = await uc.saveAllInterruptedGames('shutdown');
      expect(result.saved).toBe(1);
      expect(result.failed).toBe(1);
      spy.mockRestore();
    });

    it('should skip rooms without snapshots', async () => {
      mocks.roomRepo.getAll.mockResolvedValue([
        { pin: '111111', hasQuizSnapshot: () => false }
      ]);
      const result = await uc.saveAllInterruptedGames();
      expect(result.saved).toBe(0);
    });
  });
});
