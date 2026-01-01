const { Score } = require('../Score');

describe('Score', () => {
  describe('constructor', () => {
    it('should create Score with default value 0', () => {
      const score = new Score();

      expect(score.value).toBe(0);
    });

    it('should create Score with positive value', () => {
      const score = new Score(500);

      expect(score.value).toBe(500);
    });

    it('should round decimal values', () => {
      const score = new Score(500.7);

      expect(score.value).toBe(501);
    });

    it('should be immutable', () => {
      const score = new Score(500);
      score.value = 1000;

      expect(score.value).toBe(500); // Value unchanged
    });

    it('should throw error for negative value', () => {
      expect(() => new Score(-100)).toThrow('Score cannot be negative');
    });

    it('should throw error for non-number value', () => {
      expect(() => new Score('500')).toThrow('Score must be a number');
      expect(() => new Score(NaN)).toThrow('Score must be a number');
    });
  });

  describe('add', () => {
    it('should return new Score with added points', () => {
      const score = new Score(500);
      const newScore = score.add(300);

      expect(newScore.value).toBe(800);
      expect(score.value).toBe(500); // Original unchanged
    });

    it('should handle negative addition', () => {
      const score = new Score(500);
      const newScore = score.add(-200);

      expect(newScore.value).toBe(300);
    });
  });

  describe('isGreaterThan', () => {
    it('should return true when greater', () => {
      const score1 = new Score(500);
      const score2 = new Score(300);

      expect(score1.isGreaterThan(score2)).toBe(true);
    });

    it('should return false when less', () => {
      const score1 = new Score(300);
      const score2 = new Score(500);

      expect(score1.isGreaterThan(score2)).toBe(false);
    });

    it('should return false when equal', () => {
      const score1 = new Score(500);
      const score2 = new Score(500);

      expect(score1.isGreaterThan(score2)).toBe(false);
    });

    it('should throw error for non-Score comparison', () => {
      const score = new Score(500);

      expect(() => score.isGreaterThan(300)).toThrow('Can only compare with another Score');
    });
  });

  describe('equals', () => {
    it('should return true for equal scores', () => {
      const score1 = new Score(500);
      const score2 = new Score(500);

      expect(score1.equals(score2)).toBe(true);
    });

    it('should return false for different scores', () => {
      const score1 = new Score(500);
      const score2 = new Score(300);

      expect(score1.equals(score2)).toBe(false);
    });

    it('should return false for non-Score object', () => {
      const score = new Score(500);

      expect(score.equals(500)).toBe(false);
    });
  });

  describe('toString', () => {
    it('should return value as string', () => {
      const score = new Score(500);

      expect(score.toString()).toBe('500');
    });
  });

  describe('toNumber', () => {
    it('should return value as number', () => {
      const score = new Score(500);

      expect(score.toNumber()).toBe(500);
    });
  });
});
