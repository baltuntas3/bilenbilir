const { PIN } = require('../PIN');

describe('PIN', () => {
  describe('constructor', () => {
    it('should create PIN with valid 6 digit value', () => {
      const pin = new PIN('123456');

      expect(pin.value).toBe('123456');
    });

    it('should be immutable', () => {
      const pin = new PIN('123456');
      pin.value = '654321';

      expect(pin.value).toBe('123456'); // Value unchanged
    });

    it('should throw error for non-string value', () => {
      expect(() => new PIN(123456)).toThrow('PIN must be 6 digits');
    });

    it('should throw error for wrong length', () => {
      expect(() => new PIN('12345')).toThrow('PIN must be 6 digits');
      expect(() => new PIN('1234567')).toThrow('PIN must be 6 digits');
    });

    it('should throw error for non-digit characters', () => {
      expect(() => new PIN('12345a')).toThrow('PIN must be 6 digits');
      expect(() => new PIN('abcdef')).toThrow('PIN must be 6 digits');
    });
  });

  describe('isValid', () => {
    it('should return true for valid PIN', () => {
      expect(PIN.isValid('123456')).toBe(true);
      expect(PIN.isValid('000000')).toBe(true);
      expect(PIN.isValid('999999')).toBe(true);
    });

    it('should return false for invalid PIN', () => {
      expect(PIN.isValid('12345')).toBe(false);
      expect(PIN.isValid('1234567')).toBe(false);
      expect(PIN.isValid('abcdef')).toBe(false);
      expect(PIN.isValid(123456)).toBe(false);
      expect(PIN.isValid(null)).toBe(false);
    });
  });

  describe('generate', () => {
    it('should generate valid 6 digit PIN', () => {
      const pin = PIN.generate();

      expect(pin).toBeInstanceOf(PIN);
      expect(pin.value).toHaveLength(6);
      expect(PIN.isValid(pin.value)).toBe(true);
    });

    it('should generate different PINs', () => {
      const pins = new Set();
      for (let i = 0; i < 100; i++) {
        pins.add(PIN.generate().value);
      }

      expect(pins.size).toBeGreaterThan(90);
    });
  });

  describe('equals', () => {
    it('should return true for same PIN value', () => {
      const pin1 = new PIN('123456');
      const pin2 = new PIN('123456');

      expect(pin1.equals(pin2)).toBe(true);
    });

    it('should return false for different PIN value', () => {
      const pin1 = new PIN('123456');
      const pin2 = new PIN('654321');

      expect(pin1.equals(pin2)).toBe(false);
    });

    it('should return false for non-PIN object', () => {
      const pin = new PIN('123456');

      expect(pin.equals('123456')).toBe(false);
      expect(pin.equals({ value: '123456' })).toBe(false);
    });
  });

  describe('toString', () => {
    it('should return PIN value as string', () => {
      const pin = new PIN('123456');

      expect(pin.toString()).toBe('123456');
    });
  });
});
