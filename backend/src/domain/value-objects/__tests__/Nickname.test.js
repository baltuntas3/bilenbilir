const { Nickname } = require('../Nickname');

describe('Nickname', () => {
  describe('constructor', () => {
    it('should create Nickname with valid value', () => {
      const nickname = new Nickname('Player1');

      expect(nickname.value).toBe('Player1');
    });

    it('should trim whitespace', () => {
      const nickname = new Nickname('  Player1  ');

      expect(nickname.value).toBe('Player1');
    });

    it('should allow underscores and hyphens', () => {
      const nickname1 = new Nickname('Player_1');
      const nickname2 = new Nickname('Player-1');

      expect(nickname1.value).toBe('Player_1');
      expect(nickname2.value).toBe('Player-1');
    });

    it('should be immutable', () => {
      const nickname = new Nickname('Player1');
      nickname.value = 'Changed';

      expect(nickname.value).toBe('Player1'); // Value unchanged
    });

    it('should throw error for empty value', () => {
      expect(() => new Nickname('')).toThrow('Nickname is required');
      expect(() => new Nickname('   ')).toThrow('Nickname is required');
      expect(() => new Nickname(null)).toThrow('Nickname is required');
    });

    it('should throw error for too short value', () => {
      expect(() => new Nickname('A')).toThrow('Nickname must be at least 2 characters');
    });

    it('should throw error for too long value', () => {
      expect(() => new Nickname('ThisIsAVeryLongNickname'))
        .toThrow('Nickname must be at most 15 characters');
    });

    it('should throw error for invalid characters', () => {
      expect(() => new Nickname('Player 1')).toThrow('Nickname can only contain letters, numbers, underscores and hyphens');
      expect(() => new Nickname('Player@1')).toThrow('Nickname can only contain letters, numbers, underscores and hyphens');
      expect(() => new Nickname('Плейер')).toThrow('Nickname can only contain letters, numbers, underscores and hyphens');
    });
  });

  describe('isValid', () => {
    it('should return true for valid nicknames', () => {
      expect(Nickname.isValid('Player1')).toBe(true);
      expect(Nickname.isValid('ab')).toBe(true);
      expect(Nickname.isValid('Player_Name-1')).toBe(true);
    });

    it('should return false for invalid nicknames', () => {
      expect(Nickname.isValid('')).toBe(false);
      expect(Nickname.isValid('A')).toBe(false);
      expect(Nickname.isValid('Player 1')).toBe(false);
      expect(Nickname.isValid('ThisIsAVeryLongNickname')).toBe(false);
    });
  });

  describe('equals', () => {
    it('should return true for same nickname (case insensitive)', () => {
      const nickname1 = new Nickname('Player1');
      const nickname2 = new Nickname('player1');

      expect(nickname1.equals(nickname2)).toBe(true);
    });

    it('should return false for different nicknames', () => {
      const nickname1 = new Nickname('Player1');
      const nickname2 = new Nickname('Player2');

      expect(nickname1.equals(nickname2)).toBe(false);
    });

    it('should return false for non-Nickname object', () => {
      const nickname = new Nickname('Player1');

      expect(nickname.equals('Player1')).toBe(false);
    });
  });

  describe('toString', () => {
    it('should return nickname value', () => {
      const nickname = new Nickname('Player1');

      expect(nickname.toString()).toBe('Player1');
    });
  });
});
