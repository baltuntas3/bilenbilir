const { GameStatsUseCases } = require('../GameStatsUseCases');

function createMockRepo() {
  return {
    getStatsByHost: jest.fn(),
    getDetailedSession: jest.fn(),
    findByHost: jest.fn(),
    findByQuizAndHost: jest.fn()
  };
}

function mockSession(overrides = {}) {
  return {
    id: 's1',
    hostId: 'h1',
    playerCount: 3,
    startedAt: new Date('2024-01-01'),
    endedAt: new Date('2024-01-01T00:01:00'),
    status: 'completed',
    quiz: { id: 'q1', title: 'Quiz 1' },
    playerResults: [
      { nickname: 'Alice', score: 500, rank: 1, correctAnswers: 3, wrongAnswers: 1, averageResponseTime: 2000 },
      { nickname: 'Bob', score: 300, rank: 2, correctAnswers: 2, wrongAnswers: 2, averageResponseTime: 3000 }
    ],
    answers: [
      { questionIndex: 0, isCorrect: true, responseTimeMs: 2000 },
      { questionIndex: 0, isCorrect: false, responseTimeMs: 3000 },
      { questionIndex: 1, isCorrect: true, responseTimeMs: 1500 }
    ],
    getDurationSeconds: () => 60,
    getWinner: () => ({ nickname: 'Alice' }),
    ...overrides
  };
}

describe('GameStatsUseCases', () => {
  let uc, repo;

  beforeEach(() => {
    repo = createMockRepo();
    uc = new GameStatsUseCases(repo);
  });

  describe('getDashboardStats', () => {
    it('should return stats', async () => {
      repo.getStatsByHost.mockResolvedValue({ totalGames: 5 });
      const result = await uc.getDashboardStats({ hostId: 'h1' });
      expect(result.stats.totalGames).toBe(5);
    });
  });

  describe('getSessionDetail', () => {
    it('should return session', async () => {
      repo.getDetailedSession.mockResolvedValue({ id: 's1', hostId: 'h1' });
      const result = await uc.getSessionDetail({ sessionId: 's1', requesterId: 'h1' });
      expect(result.session).toBeDefined();
    });

    it('should throw if not found', async () => {
      repo.getDetailedSession.mockResolvedValue(null);
      await expect(uc.getSessionDetail({ sessionId: 's1', requesterId: 'h1' })).rejects.toThrow('not found');
    });

    it('should throw if not authorized', async () => {
      repo.getDetailedSession.mockResolvedValue({ id: 's1', hostId: 'other' });
      await expect(uc.getSessionDetail({ sessionId: 's1', requesterId: 'h1' })).rejects.toThrow('Not authorized');
    });
  });

  describe('getSessionsByHost', () => {
    it('should return sessions', async () => {
      repo.findByHost.mockResolvedValue({ sessions: [], pagination: {} });
      const result = await uc.getSessionsByHost({ hostId: 'h1' });
      expect(result).toBeDefined();
    });
  });

  describe('getPlayerAnalytics', () => {
    it('should return analytics for known player', async () => {
      repo.findByHost.mockResolvedValue({ sessions: [mockSession()] });
      const result = await uc.getPlayerAnalytics({ hostId: 'h1', nickname: 'Alice' });
      expect(result.gamesPlayed).toBe(1);
      expect(result.totalScore).toBe(500);
      expect(result.bestRank).toBe(1);
    });

    it('should return empty for unknown player', async () => {
      repo.findByHost.mockResolvedValue({ sessions: [mockSession()] });
      const result = await uc.getPlayerAnalytics({ hostId: 'h1', nickname: 'Unknown' });
      expect(result.gamesPlayed).toBe(0);
      expect(result.bestRank).toBeNull();
    });

    it('should handle player with no response time', async () => {
      const session = mockSession({
        playerResults: [{ nickname: 'Alice', score: 100, rank: 1, correctAnswers: 0, wrongAnswers: 0, averageResponseTime: 0 }]
      });
      repo.findByHost.mockResolvedValue({ sessions: [session] });
      const result = await uc.getPlayerAnalytics({ hostId: 'h1', nickname: 'Alice' });
      expect(result.averageResponseTime).toBe(0);
    });
  });

  describe('getQuestionAnalytics', () => {
    it('should return per-question stats', async () => {
      repo.findByQuizAndHost.mockResolvedValue({ sessions: [mockSession()] });
      const result = await uc.getQuestionAnalytics({ hostId: 'h1', quizId: 'q1' });
      expect(result.questions.length).toBeGreaterThan(0);
    });

    it('should handle empty sessions', async () => {
      repo.findByQuizAndHost.mockResolvedValue({ sessions: [] });
      const result = await uc.getQuestionAnalytics({ hostId: 'h1', quizId: 'q1' });
      expect(result.questions).toEqual([]);
    });
  });

  describe('getWeakTopics', () => {
    it('should return topics sorted by accuracy', async () => {
      repo.findByHost.mockResolvedValue({ sessions: [mockSession()] });
      const result = await uc.getWeakTopics({ hostId: 'h1' });
      expect(result.topics).toHaveLength(1);
      expect(result.topics[0].quizId).toBe('q1');
    });

    it('should handle session with no quiz info', async () => {
      const session = mockSession({ quiz: null });
      repo.findByHost.mockResolvedValue({ sessions: [session] });
      const result = await uc.getWeakTopics({ hostId: 'h1' });
      expect(result.topics).toHaveLength(1);
    });
  });

  describe('getQuizPerformance', () => {
    it('should return performance data', async () => {
      repo.findByQuizAndHost.mockResolvedValue({ sessions: [mockSession()] });
      const result = await uc.getQuizPerformance({ hostId: 'h1', quizId: 'q1' });
      expect(result.totalGames).toBe(1);
      expect(result.totalPlayers).toBe(3);
      expect(result.questionBreakdown).toBeDefined();
    });

    it('should throw for no sessions', async () => {
      repo.findByQuizAndHost.mockResolvedValue({ sessions: [] });
      await expect(uc.getQuizPerformance({ hostId: 'h1', quizId: 'q1' })).rejects.toThrow('No game sessions');
    });
  });

  describe('_calculateAccuracy', () => {
    it('should return 0 for 0 total', () => {
      expect(uc._calculateAccuracy(0, 0)).toBe(0);
    });

    it('should calculate correctly', () => {
      expect(uc._calculateAccuracy(3, 4)).toBe(75);
    });
  });
});
