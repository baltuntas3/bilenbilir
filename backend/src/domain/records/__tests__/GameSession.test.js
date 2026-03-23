const { GameSession, GameSessionStatus, PlayerResult, AnswerRecord } = require('../GameSession');

describe('PlayerResult', () => {
  const validData = { nickname: 'Alice', rank: 1, score: 500, correctAnswers: 4, wrongAnswers: 1, averageResponseTime: 2500, longestStreak: 3 };

  it('should create with valid data', () => {
    const pr = new PlayerResult(validData);
    expect(pr.nickname).toBe('Alice');
    expect(pr.rank).toBe(1);
    expect(pr.score).toBe(500);
    expect(Object.isFrozen(pr)).toBe(true);
  });

  it('should clamp negative values to 0', () => {
    const pr = new PlayerResult({ nickname: 'Bob', rank: 1, score: -10, correctAnswers: -1, wrongAnswers: -1, averageResponseTime: -5, longestStreak: -2 });
    expect(pr.score).toBe(0);
    expect(pr.correctAnswers).toBe(0);
    expect(pr.wrongAnswers).toBe(0);
    expect(pr.averageResponseTime).toBe(0);
    expect(pr.longestStreak).toBe(0);
  });

  it('should throw if nickname is missing', () => {
    expect(() => new PlayerResult({ rank: 1 })).toThrow('Player nickname is required');
  });

  it('should throw if rank is invalid', () => {
    expect(() => new PlayerResult({ nickname: 'A', rank: 0 })).toThrow('Valid rank is required');
    expect(() => new PlayerResult({ nickname: 'A', rank: -1 })).toThrow('Valid rank is required');
    expect(() => new PlayerResult({ nickname: 'A', rank: 'x' })).toThrow('Valid rank is required');
  });

  describe('getAccuracy', () => {
    it('should calculate accuracy', () => {
      const pr = new PlayerResult({ nickname: 'A', rank: 1, correctAnswers: 3, wrongAnswers: 1 });
      expect(pr.getAccuracy()).toBe(75);
    });

    it('should return 0 when no answers', () => {
      const pr = new PlayerResult({ nickname: 'A', rank: 1 });
      expect(pr.getAccuracy()).toBe(0);
    });
  });
});

describe('AnswerRecord', () => {
  const validData = { nickname: 'Alice', questionIndex: 0, answerIndex: 1, isCorrect: true, responseTimeMs: 2000, score: 800, streak: 2 };

  it('should create with valid data', () => {
    const ar = new AnswerRecord(validData);
    expect(ar.nickname).toBe('Alice');
    expect(ar.isCorrect).toBe(true);
    expect(Object.isFrozen(ar)).toBe(true);
  });

  it('should convert isCorrect to boolean', () => {
    const ar = new AnswerRecord({ ...validData, isCorrect: 1 });
    expect(ar.isCorrect).toBe(true);
  });

  it('should clamp negative values to 0', () => {
    const ar = new AnswerRecord({ ...validData, responseTimeMs: -100, score: -50, streak: -1 });
    expect(ar.responseTimeMs).toBe(0);
    expect(ar.score).toBe(0);
    expect(ar.streak).toBe(0);
  });

  it('should default responseTimeMs to 0 when null', () => {
    const ar = new AnswerRecord({ ...validData, responseTimeMs: null });
    expect(ar.responseTimeMs).toBe(0);
  });

  it('should throw if nickname is missing', () => {
    expect(() => new AnswerRecord({ ...validData, nickname: '' })).toThrow('Nickname is required');
  });

  it('should throw if questionIndex is invalid', () => {
    expect(() => new AnswerRecord({ ...validData, questionIndex: -1 })).toThrow('Valid question index');
    expect(() => new AnswerRecord({ ...validData, questionIndex: 'x' })).toThrow('Valid question index');
  });

  it('should throw if answerIndex is invalid', () => {
    expect(() => new AnswerRecord({ ...validData, answerIndex: -1 })).toThrow('Valid answer index');
    expect(() => new AnswerRecord({ ...validData, answerIndex: 'x' })).toThrow('Valid answer index');
  });
});

describe('GameSession', () => {
  const now = new Date();
  const later = new Date(now.getTime() + 60000);
  const validData = {
    id: 'gs-1',
    pin: '123456',
    quizId: 'q1',
    hostId: 'h1',
    playerCount: 3,
    playerResults: [
      { nickname: 'Alice', rank: 1, score: 1000, correctAnswers: 5, wrongAnswers: 0 },
      { nickname: 'Bob', rank: 2, score: 500, correctAnswers: 3, wrongAnswers: 2 }
    ],
    answers: [
      { nickname: 'Alice', questionIndex: 0, answerIndex: 1, isCorrect: true, responseTimeMs: 2000, score: 500 },
      { nickname: 'Alice', questionIndex: 1, answerIndex: 0, isCorrect: true, responseTimeMs: 3000, score: 500 },
      { nickname: 'Bob', questionIndex: 0, answerIndex: 2, isCorrect: false, responseTimeMs: 4000, score: 0 }
    ],
    startedAt: now,
    endedAt: later
  };

  describe('constructor', () => {
    it('should create with valid data', () => {
      const gs = new GameSession(validData);
      expect(gs.pin).toBe('123456');
      expect(gs.playerResults).toHaveLength(2);
      expect(gs.answers).toHaveLength(3);
      expect(Object.isFrozen(gs)).toBe(true);
    });

    it('should accept string dates', () => {
      const gs = new GameSession({ ...validData, startedAt: now.toISOString(), endedAt: later.toISOString() });
      expect(gs.startedAt).toBeInstanceOf(Date);
    });

    it('should accept PlayerResult/AnswerRecord instances', () => {
      const gs = new GameSession({
        ...validData,
        playerResults: [new PlayerResult({ nickname: 'A', rank: 1 })],
        answers: [new AnswerRecord({ nickname: 'A', questionIndex: 0, answerIndex: 0, isCorrect: true })]
      });
      expect(gs.playerResults).toHaveLength(1);
    });

    it('should default status to completed for invalid values', () => {
      const gs = new GameSession({ ...validData, status: 'invalid' });
      expect(gs.status).toBe('completed');
    });

    it('should set interruption fields', () => {
      const gs = new GameSession({
        ...validData,
        status: GameSessionStatus.INTERRUPTED,
        interruptionReason: 'host_disconnect',
        lastQuestionIndex: 3,
        lastState: 'ANSWERING_PHASE'
      });
      expect(gs.interruptionReason).toBe('host_disconnect');
      expect(gs.lastQuestionIndex).toBe(3);
      expect(gs.lastState).toBe('ANSWERING_PHASE');
    });

    it('should set lastQuestionIndex to null for non-number values', () => {
      const gs = new GameSession({ ...validData, lastQuestionIndex: 'x' });
      expect(gs.lastQuestionIndex).toBeNull();
    });

    it('should set quiz and host fields', () => {
      const gs = new GameSession({
        ...validData,
        quiz: { id: 'q1', title: 'Test', description: 'Desc' },
        host: { id: 'h1', username: 'admin' }
      });
      expect(gs.quiz.title).toBe('Test');
      expect(gs.host.username).toBe('admin');
      expect(Object.isFrozen(gs.quiz)).toBe(true);
      expect(Object.isFrozen(gs.host)).toBe(true);
    });

    it('should throw for invalid PIN', () => {
      expect(() => new GameSession({ ...validData, pin: '12345' })).toThrow('Valid 6-digit PIN');
      expect(() => new GameSession({ ...validData, pin: '' })).toThrow('Valid 6-digit PIN');
    });

    it('should throw for missing quizId', () => {
      expect(() => new GameSession({ ...validData, quizId: '' })).toThrow('Quiz ID is required');
    });

    it('should throw for missing hostId', () => {
      expect(() => new GameSession({ ...validData, hostId: '' })).toThrow('Host ID is required');
    });

    it('should throw for missing startedAt', () => {
      expect(() => new GameSession({ ...validData, startedAt: null })).toThrow('Start time is required');
    });

    it('should throw for missing endedAt', () => {
      expect(() => new GameSession({ ...validData, endedAt: null })).toThrow('End time is required');
    });
  });

  describe('getDurationSeconds', () => {
    it('should calculate duration', () => {
      const gs = new GameSession(validData);
      expect(gs.getDurationSeconds()).toBe(60);
    });
  });

  describe('getPodium', () => {
    it('should return top 3 by rank', () => {
      const gs = new GameSession(validData);
      const podium = gs.getPodium();
      expect(podium[0].nickname).toBe('Alice');
      expect(podium).toHaveLength(2);
    });
  });

  describe('getWinner', () => {
    it('should return rank 1 player', () => {
      const gs = new GameSession(validData);
      expect(gs.getWinner().nickname).toBe('Alice');
    });

    it('should return null if no rank 1', () => {
      const gs = new GameSession({
        ...validData,
        playerResults: [{ nickname: 'A', rank: 2, score: 100 }]
      });
      expect(gs.getWinner()).toBeNull();
    });
  });

  describe('getAnswersForQuestion', () => {
    it('should filter answers by question index', () => {
      const gs = new GameSession(validData);
      expect(gs.getAnswersForQuestion(0)).toHaveLength(2);
      expect(gs.getAnswersForQuestion(1)).toHaveLength(1);
    });
  });

  describe('getAnswersByPlayer', () => {
    it('should filter answers by nickname', () => {
      const gs = new GameSession(validData);
      expect(gs.getAnswersByPlayer('Alice')).toHaveLength(2);
      expect(gs.getAnswersByPlayer('Bob')).toHaveLength(1);
    });
  });

  describe('getOverallAccuracy', () => {
    it('should calculate accuracy', () => {
      const gs = new GameSession(validData);
      expect(gs.getOverallAccuracy()).toBe(67); // 2/3
    });

    it('should return 0 when no answers', () => {
      const gs = new GameSession({ ...validData, answers: [] });
      expect(gs.getOverallAccuracy()).toBe(0);
    });
  });

  describe('isCompleted/isInterrupted', () => {
    it('should detect completed', () => {
      const gs = new GameSession(validData);
      expect(gs.isCompleted()).toBe(true);
      expect(gs.isInterrupted()).toBe(false);
    });

    it('should detect interrupted', () => {
      const gs = new GameSession({ ...validData, status: GameSessionStatus.INTERRUPTED });
      expect(gs.isInterrupted()).toBe(true);
      expect(gs.isCompleted()).toBe(false);
    });
  });

  describe('toSummaryJSON', () => {
    it('should return summary', () => {
      const gs = new GameSession(validData);
      const summary = gs.toSummaryJSON();
      expect(summary.pin).toBe('123456');
      expect(summary.durationSeconds).toBe(60);
      expect(summary.winner).toBe('Alice');
    });

    it('should include interruption info', () => {
      const gs = new GameSession({ ...validData, status: GameSessionStatus.INTERRUPTED, interruptionReason: 'timeout' });
      const summary = gs.toSummaryJSON();
      expect(summary.interruptionReason).toBe('timeout');
    });

    it('should handle no winner', () => {
      const gs = new GameSession({ ...validData, playerResults: [] });
      expect(gs.toSummaryJSON().winner).toBeNull();
    });
  });

  describe('toDetailedJSON', () => {
    it('should return detailed info', () => {
      const gs = new GameSession(validData);
      const detail = gs.toDetailedJSON();
      expect(detail.overallAccuracy).toBe(67);
      expect(detail.durationSeconds).toBe(60);
    });

    it('should include interruption metadata', () => {
      const gs = new GameSession({
        ...validData,
        status: GameSessionStatus.INTERRUPTED,
        interruptionReason: 'host_disconnect',
        lastQuestionIndex: 2,
        lastState: 'ANSWERING_PHASE'
      });
      const detail = gs.toDetailedJSON();
      expect(detail.interruptionReason).toBe('host_disconnect');
      expect(detail.lastQuestionIndex).toBe(2);
      expect(detail.lastState).toBe('ANSWERING_PHASE');
    });
  });
});

describe('GameSessionStatus', () => {
  it('should have all statuses', () => {
    expect(GameSessionStatus.COMPLETED).toBe('completed');
    expect(GameSessionStatus.CANCELLED).toBe('cancelled');
    expect(GameSessionStatus.ABANDONED).toBe('abandoned');
    expect(GameSessionStatus.ERROR).toBe('error');
    expect(GameSessionStatus.INTERRUPTED).toBe('interrupted');
  });
});
