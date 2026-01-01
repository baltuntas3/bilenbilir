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
    it('should increment streak', () => {
      player.incrementStreak();
      expect(player.streak).toBe(1);

      player.incrementStreak();
      expect(player.streak).toBe(2);
    });

    it('should reset streak', () => {
      player.incrementStreak();
      player.incrementStreak();
      player.resetStreak();

      expect(player.streak).toBe(0);
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

  describe('updateSocketId', () => {
    it('should update socket id', () => {
      player.updateSocketId('new-socket-id');

      expect(player.socketId).toBe('new-socket-id');
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
  });
});
