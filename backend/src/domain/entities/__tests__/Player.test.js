const { Player } = require('../Player');

describe('Player', () => {
  let player;

  beforeEach(() => {
    player = new Player({
      id: 'player-1',
      socketId: 'socket-1',
      nickname: 'TestPlayer',
      roomPin: '123456'
    });
  });

  describe('constructor', () => {
    it('should create player with default values', () => {
      expect(player.id).toBe('player-1');
      expect(player.socketId).toBe('socket-1');
      expect(player.nickname).toBe('TestPlayer');
      expect(player.roomPin).toBe('123456');
      expect(player.score).toBe(0);
      expect(player.streak).toBe(0);
      expect(player.correctAnswers).toBe(0);
      expect(player.longestStreak).toBe(0);
      expect(player.answerAttempt).toBeNull();
    });
  });

  describe('addScore', () => {
    it('should add points to score', () => {
      player.addScore(500);
      expect(player.score).toBe(500);

      player.addScore(300);
      expect(player.score).toBe(800);
    });
  });

  describe('streak management', () => {
    it('should increment streak and track correctAnswers', () => {
      player.incrementStreak();
      expect(player.streak).toBe(1);
      expect(player.correctAnswers).toBe(1);
      expect(player.longestStreak).toBe(1);

      player.incrementStreak();
      expect(player.streak).toBe(2);
      expect(player.correctAnswers).toBe(2);
      expect(player.longestStreak).toBe(2);
    });

    it('should reset streak but keep correctAnswers and longestStreak', () => {
      player.incrementStreak();
      player.incrementStreak();
      player.resetStreak();

      expect(player.streak).toBe(0);
      expect(player.correctAnswers).toBe(2);
      expect(player.longestStreak).toBe(2);
    });

    it('should track longestStreak across multiple streaks', () => {
      // First streak of 3
      player.incrementStreak();
      player.incrementStreak();
      player.incrementStreak();
      expect(player.longestStreak).toBe(3);

      // Reset and new streak of 2
      player.resetStreak();
      player.incrementStreak();
      player.incrementStreak();

      expect(player.streak).toBe(2);
      expect(player.correctAnswers).toBe(5);
      expect(player.longestStreak).toBe(3); // Still 3, not 2
    });
  });

  describe('submitAnswer', () => {
    it('should store answer attempt', () => {
      player.submitAnswer(2, 1500);

      expect(player.answerAttempt).not.toBeNull();
      expect(player.answerAttempt.answerIndex).toBe(2);
      expect(player.answerAttempt.elapsedTimeMs).toBe(1500);
      expect(player.answerAttempt.submittedAt).toBeInstanceOf(Date);
    });
  });

  describe('hasAnswered', () => {
    it('should return false when no answer submitted', () => {
      expect(player.hasAnswered()).toBe(false);
    });

    it('should return true when answer submitted', () => {
      player.submitAnswer(2, 1500);
      expect(player.hasAnswered()).toBe(true);
    });
  });

  describe('clearAnswerAttempt', () => {
    it('should clear answer attempt', () => {
      player.submitAnswer(2, 1500);
      player.clearAnswerAttempt();

      expect(player.answerAttempt).toBeNull();
      expect(player.hasAnswered()).toBe(false);
    });
  });

  describe('disconnect and reconnect', () => {
    it('should track disconnection', () => {
      expect(player.isDisconnected()).toBe(false);

      player.setDisconnected();

      expect(player.isDisconnected()).toBe(true);
      expect(player.getDisconnectedDuration()).toBeGreaterThanOrEqual(0);
    });

    it('should reconnect with new socket id', () => {
      player.setDisconnected();
      player.reconnect('new-socket-id');

      expect(player.isDisconnected()).toBe(false);
      expect(player.socketId).toBe('new-socket-id');
    });

    it('should rotate token on reconnect', () => {
      player.playerToken = 'old-token';
      player.setDisconnected();
      player.reconnect('new-socket-id', 'new-token');

      expect(player.playerToken).toBe('new-token');
    });
  });

  describe('addScore validation', () => {
    it('should throw error for non-number points', () => {
      expect(() => player.addScore('100')).toThrow('Points must be a valid number');
      expect(() => player.addScore(null)).toThrow('Points must be a valid number');
      expect(() => player.addScore(undefined)).toThrow('Points must be a valid number');
    });

    it('should throw error for Infinity', () => {
      expect(() => player.addScore(Infinity)).toThrow('Points must be a valid number');
      expect(() => player.addScore(-Infinity)).toThrow('Points must be a valid number');
    });

    it('should throw error for NaN', () => {
      expect(() => player.addScore(NaN)).toThrow('Points must be a valid number');
    });

    it('should throw error for negative points', () => {
      expect(() => player.addScore(-100)).toThrow('Points cannot be negative');
      expect(() => player.addScore(-1)).toThrow('Points cannot be negative');
    });
  });

  describe('playerToken property', () => {
    it('should get and set playerToken', () => {
      expect(player.playerToken).toBeNull();

      player.playerToken = 'test-token';
      expect(player.playerToken).toBe('test-token');
    });

    it('should initialize with token', () => {
      const tokenPlayer = new Player({
        id: 'p-1',
        socketId: 's-1',
        nickname: 'TokenPlayer',
        roomPin: '123456',
        playerToken: 'initial-token'
      });

      expect(tokenPlayer.playerToken).toBe('initial-token');
    });
  });

  describe('submitAnswer when disconnected', () => {
    it('should throw error when submitting while disconnected', () => {
      player.setDisconnected();

      expect(() => player.submitAnswer(0, 1000))
        .toThrow('Cannot submit answer while disconnected');
    });
  });

  describe('streak cap', () => {
    it('should cap streak at MAX_STREAK (1000)', () => {
      // Set streak near cap
      player.streak = 999;
      player.incrementStreak();
      expect(player.streak).toBe(1000);

      // Should not increment beyond 1000
      player.incrementStreak();
      expect(player.streak).toBe(1000);

      // But correctAnswers should still increment
      expect(player.correctAnswers).toBe(2);
    });

    it('should cap longestStreak at MAX_STREAK (1000)', () => {
      // Set streak and longestStreak near cap
      player.streak = 999;
      player.longestStreak = 999;
      player.incrementStreak();

      expect(player.longestStreak).toBe(1000);

      // Should not increment longestStreak beyond 1000
      player.incrementStreak();
      expect(player.longestStreak).toBe(1000);
    });
  });

  describe('toJSON', () => {
    beforeEach(() => {
      player.addScore(500);
      player.incrementStreak();
      player.incrementStreak();
    });

    it('should return basic info with score by default', () => {
      const json = player.toJSON();

      expect(json).toEqual({
        id: 'player-1',
        nickname: 'TestPlayer',
        score: 500
      });
    });

    it('should exclude score when includeScore is false', () => {
      const json = player.toJSON({ includeScore: false });

      expect(json).toEqual({
        id: 'player-1',
        nickname: 'TestPlayer'
      });
      expect(json.score).toBeUndefined();
    });

    it('should include stats when includeStats is true', () => {
      const json = player.toJSON({ includeStats: true });

      expect(json).toEqual({
        id: 'player-1',
        nickname: 'TestPlayer',
        score: 500,
        streak: 2,
        correctAnswers: 2,
        longestStreak: 2
      });
    });

    it('should include stats without score', () => {
      const json = player.toJSON({ includeScore: false, includeStats: true });

      expect(json).toEqual({
        id: 'player-1',
        nickname: 'TestPlayer',
        streak: 2,
        correctAnswers: 2,
        longestStreak: 2
      });
    });
  });

  describe('token validation (inherited from BaseParticipant)', () => {
    it('should return false for hasValidToken when no token', () => {
      expect(player.hasValidToken()).toBe(false);
    });

    it('should return true for hasValidToken when token exists and not expired', () => {
      player.playerToken = 'valid-token';
      player.tokenCreatedAt = new Date();
      expect(player.hasValidToken()).toBe(true);
    });

    it('should return true for isTokenExpired when no token', () => {
      expect(player.isTokenExpired()).toBe(true);
    });

    it('should return true for isTokenExpired when token is old', () => {
      player.playerToken = 'old-token';
      player.tokenCreatedAt = new Date(Date.now() - (25 * 60 * 60 * 1000)); // 25 hours ago
      expect(player.isTokenExpired()).toBe(true);
    });
  });

  describe('nickname methods (inherited from BaseParticipant)', () => {
    it('should check nickname case-insensitively', () => {
      expect(player.hasNickname('TestPlayer')).toBe(true);
      expect(player.hasNickname('testplayer')).toBe(true);
      expect(player.hasNickname('TESTPLAYER')).toBe(true);
      expect(player.hasNickname('Other')).toBe(false);
    });

    it('should return normalized nickname', () => {
      expect(player.getNormalizedNickname()).toBe('testplayer');
    });
  });

  describe('constructor with initial values', () => {
    it('should accept initial score, streak, and stats', () => {
      const existingPlayer = new Player({
        id: 'p-1',
        socketId: 's-1',
        nickname: 'Existing',
        roomPin: '123456',
        score: 1500,
        streak: 5,
        correctAnswers: 10,
        longestStreak: 7
      });

      expect(existingPlayer.score).toBe(1500);
      expect(existingPlayer.streak).toBe(5);
      expect(existingPlayer.correctAnswers).toBe(10);
      expect(existingPlayer.longestStreak).toBe(7);
    });
  });

  describe('static constants', () => {
    it('should have TOKEN_EXPIRATION_MS defined', () => {
      expect(Player.TOKEN_EXPIRATION_MS).toBe(24 * 60 * 60 * 1000);
    });
  });
});
