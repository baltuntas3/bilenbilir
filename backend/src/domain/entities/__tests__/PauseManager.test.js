const { PauseManager } = require('../PauseManager');

describe('PauseManager', () => {
  let pm;

  beforeEach(() => {
    pm = new PauseManager();
  });

  describe('pause', () => {
    it('should return pause transition info', () => {
      const result = pm.pause('LEADERBOARD', true, 'LEADERBOARD', 'PAUSED');
      expect(result).toEqual({ pausedState: 'PAUSED', fromState: 'LEADERBOARD' });
      // State should NOT be mutated yet — applyPause must be called after setState
      expect(pm.pausedAt).toBeNull();
      expect(pm.pausedFromState).toBeNull();
    });

    it('should throw if not host', () => {
      expect(() => pm.pause('LEADERBOARD', false, 'LEADERBOARD', 'PAUSED')).toThrow('Only host can pause');
    });

    it('should throw if not in allowed state', () => {
      expect(() => pm.pause('ANSWERING', true, 'LEADERBOARD', 'PAUSED')).toThrow('Game can only be paused from');
    });
  });

  describe('applyPause', () => {
    it('should set pause state after successful transition', () => {
      pm.applyPause('LEADERBOARD');
      expect(pm.pausedAt).toBeInstanceOf(Date);
      expect(pm.pausedFromState).toBe('LEADERBOARD');
    });
  });

  describe('resume', () => {
    it('should return the state to resume to', () => {
      pm.applyPause('LEADERBOARD');
      const result = pm.resume('PAUSED', true, 'PAUSED', 'LEADERBOARD');
      expect(result).toBe('LEADERBOARD');
      // State should NOT be cleared yet — applyResume must be called after setState
      expect(pm.pausedAt).toBeInstanceOf(Date);
    });

    it('should fall back to defaultResumeState when pausedFromState is null', () => {
      pm.pausedFromState = null;
      pm.pausedAt = new Date();
      const result = pm.resume('PAUSED', true, 'PAUSED', 'DEFAULT_STATE');
      expect(result).toBe('DEFAULT_STATE');
    });

    it('should throw if not host', () => {
      pm.applyPause('LEADERBOARD');
      expect(() => pm.resume('PAUSED', false, 'PAUSED', 'LEADERBOARD')).toThrow('Only host can resume');
    });

    it('should throw if not in paused state', () => {
      expect(() => pm.resume('LEADERBOARD', true, 'PAUSED', 'LEADERBOARD')).toThrow('Game is not paused');
    });
  });

  describe('applyResume', () => {
    it('should clear pause state after successful transition', () => {
      pm.applyPause('LEADERBOARD');
      pm.applyResume();
      expect(pm.pausedAt).toBeNull();
      expect(pm.pausedFromState).toBeNull();
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
