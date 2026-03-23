const { Nickname } = require('../Nickname');

describe('Nickname edge cases', () => {
  describe('equalsIgnoreCase', () => {
    it('should compare with another Nickname instance', () => {
      const n1 = new Nickname('TestUser');
      const n2 = new Nickname('testuser');
      expect(n1.equalsIgnoreCase(n2)).toBe(true);
    });

    it('should return false for non-string non-Nickname value', () => {
      const n = new Nickname('TestUser');
      expect(n.equalsIgnoreCase(123)).toBe(false);
      expect(n.equalsIgnoreCase(null)).toBe(false);
      expect(n.equalsIgnoreCase(undefined)).toBe(false);
      expect(n.equalsIgnoreCase({})).toBe(false);
    });
  });
});
