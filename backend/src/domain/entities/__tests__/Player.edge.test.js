const { Player } = require('../Player');

describe('Player edge cases', () => {
  let player;

  beforeEach(() => {
    player = new Player({ id: 'p1', socketId: 's1', nickname: 'Test', roomPin: '123456', token: 'tok1' });
  });

  describe('submitAnswer edge cases', () => {
    it('should throw if already answered', () => {
      player.submitAnswer(0, 1000);
      expect(() => player.submitAnswer(1, 2000)).toThrow('Already answered');
    });

    it('should throw for negative answer index', () => {
      expect(() => player.submitAnswer(-1, 1000)).toThrow('non-negative integer');
    });

    it('should throw for non-integer answer index', () => {
      expect(() => player.submitAnswer(1.5, 1000)).toThrow('non-negative integer');
    });

    it('should throw for string answer index', () => {
      expect(() => player.submitAnswer('0', 1000)).toThrow('non-negative integer');
    });

    it('should throw for invalid elapsed time (NaN)', () => {
      expect(() => player.submitAnswer(0, NaN)).toThrow('non-negative number');
    });

    it('should throw for negative elapsed time', () => {
      expect(() => player.submitAnswer(0, -100)).toThrow('non-negative number');
    });

    it('should throw for Infinity elapsed time', () => {
      expect(() => player.submitAnswer(0, Infinity)).toThrow('non-negative number');
    });

    it('should throw for string elapsed time', () => {
      expect(() => player.submitAnswer(0, '1000')).toThrow('non-negative number');
    });
  });

  describe('power-up methods', () => {
    it('getPowerUpCount should throw for invalid type', () => {
      expect(() => player.getPowerUpCount('INVALID')).toThrow('Invalid power-up type');
    });

    it('getPowerUpCount should return 0 for missing type', () => {
      player.powerUps = {};
      expect(player.getPowerUpCount('FIFTY_FIFTY')).toBe(0);
    });

    it('getPowerUpCount should return count for valid type', () => {
      expect(player.getPowerUpCount('FIFTY_FIFTY')).toBe(1);
    });

    it('getAllPowerUps should return a copy', () => {
      const pus = player.getAllPowerUps();
      pus.FIFTY_FIFTY = 99;
      expect(player.powerUps.FIFTY_FIFTY).toBe(1);
    });

    it('usePowerUp should throw for invalid type', () => {
      expect(() => player.usePowerUp('INVALID')).toThrow('Invalid power-up type');
    });

    it('usePowerUp should throw when no remaining', () => {
      player.powerUps.FIFTY_FIFTY = 0;
      expect(() => player.usePowerUp('FIFTY_FIFTY')).toThrow('No FIFTY_FIFTY power-up remaining');
    });

    it('usePowerUp should decrement without setting activePowerUp', () => {
      const type = player.usePowerUp('FIFTY_FIFTY');
      expect(type).toBe('FIFTY_FIFTY');
      expect(player.powerUps.FIFTY_FIFTY).toBe(0);
      // usePowerUp no longer sets activePowerUp — strategies handle that
      expect(player.activePowerUp).toBeNull();
    });

    it('setActivePowerUp should set the active power-up for scoring', () => {
      player.setActivePowerUp('DOUBLE_POINTS');
      expect(player.activePowerUp).toBe('DOUBLE_POINTS');
      expect(player.hasActivePowerUp('DOUBLE_POINTS')).toBe(true);
    });

    it('setActivePowerUp should reject invalid type', () => {
      expect(() => player.setActivePowerUp('INVALID')).toThrow('Invalid power-up type');
    });

    it('hasActivePowerUp should check type', () => {
      player.activePowerUp = 'DOUBLE_POINTS';
      expect(player.hasActivePowerUp('DOUBLE_POINTS')).toBe(true);
      expect(player.hasActivePowerUp('FIFTY_FIFTY')).toBe(false);
    });

    it('clearActivePowerUp should clear', () => {
      player.activePowerUp = 'FIFTY_FIFTY';
      player.clearActivePowerUp();
      expect(player.activePowerUp).toBeNull();
    });
  });

  describe('toJSON', () => {
    it('should include stats when requested', () => {
      player.incrementStreak();
      player.addScore(500);
      const json = player.toJSON({ includeStats: true });
      expect(json.streak).toBe(1);
      expect(json.correctAnswers).toBe(1);
      expect(json.longestStreak).toBe(1);
    });

    it('should exclude score when not requested', () => {
      const json = player.toJSON({ includeScore: false });
      expect(json.score).toBeUndefined();
    });

    it('should include score by default', () => {
      const json = player.toJSON();
      expect(json.score).toBe(0);
    });
  });

  describe('playerToken alias', () => {
    it('should get playerToken', () => {
      expect(player.playerToken).toBe('tok1');
    });

    it('should set playerToken', () => {
      player.playerToken = 'new-token';
      expect(player.token).toBe('new-token');
    });
  });

  describe('clearAnswerAttempt', () => {
    it('should clear answer, active power-up and eliminated options', () => {
      player.submitAnswer(0, 1000);
      player.activePowerUp = 'FIFTY_FIFTY';
      player.eliminatedOptions = [0, 2];
      player.clearAnswerAttempt();
      expect(player.answerAttempt).toBeNull();
      expect(player.activePowerUp).toBeNull();
      expect(player.eliminatedOptions).toEqual([]);
    });
  });
});
