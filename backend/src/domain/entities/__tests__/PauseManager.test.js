const { PauseManager } = require('../PauseManager');

describe('PauseManager', () => {
  let pm;

  beforeEach(() => {
    pm = new PauseManager();
  });

  describe('pause', () => {
    it('should pause from leaderboard state', () => {
      const result = pm.pause('LEADERBOARD', true, 'LEADERBOARD', 'PAUSED');
      expect(result).toBe('PAUSED');
      expect(pm.pausedAt).toBeInstanceOf(Date);
      expect(pm.pausedFromState).toBe('LEADERBOARD');
    });

    it('should throw if not host', () => {
      expect(() => pm.pause('LEADERBOARD', false, 'LEADERBOARD', 'PAUSED')).toThrow('Only host can pause');
    });

    it('should throw if not in leaderboard state', () => {
      expect(() => pm.pause('ANSWERING', true, 'LEADERBOARD', 'PAUSED')).toThrow('only be paused from leaderboard');
    });
  });

  describe('resume', () => {
    it('should resume to pausedFromState', () => {
      pm.pause('LEADERBOARD', true, 'LEADERBOARD', 'PAUSED');
      const result = pm.resume('PAUSED', true, 'PAUSED', 'LEADERBOARD');
      expect(result).toBe('LEADERBOARD');
      expect(pm.pausedAt).toBeNull();
      expect(pm.pausedFromState).toBeNull();
    });

    it('should fall back to defaultResumeState when pausedFromState is null', () => {
      // Directly set state without going through pause (simulates edge case)
      pm.pausedFromState = null;
      pm.pausedAt = new Date();
      const result = pm.resume('PAUSED', true, 'PAUSED', 'DEFAULT_STATE');
      expect(result).toBe('DEFAULT_STATE');
    });

    it('should throw if not host', () => {
      pm.pause('LEADERBOARD', true, 'LEADERBOARD', 'PAUSED');
      expect(() => pm.resume('PAUSED', false, 'PAUSED', 'LEADERBOARD')).toThrow('Only host can resume');
    });

    it('should throw if not in paused state', () => {
      expect(() => pm.resume('LEADERBOARD', true, 'PAUSED', 'LEADERBOARD')).toThrow('Game is not paused');
    });
  });

  describe('isPaused', () => {
    it('should return true when in paused state', () => {
      expect(pm.isPaused('PAUSED', 'PAUSED')).toBe(true);
    });

    it('should return false when not paused', () => {
      expect(pm.isPaused('LEADERBOARD', 'PAUSED')).toBe(false);
    });
  });

  describe('getDuration', () => {
    it('should return 0 when not paused', () => {
      expect(pm.getDuration()).toBe(0);
    });

    it('should return positive duration when paused', () => {
      pm.pausedAt = new Date(Date.now() - 5000);
      expect(pm.getDuration()).toBeGreaterThanOrEqual(4000);
    });
  });
});
