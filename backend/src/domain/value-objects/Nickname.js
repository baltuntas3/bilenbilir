const { ValidationError } = require('../../shared/errors');

class Nickname {
  static MIN_LENGTH = 2;
  static MAX_LENGTH = 15;
  static ALLOWED_PATTERN = /^[a-zA-Z0-9_-]+$/;

  constructor(value) {
    const trimmed = value?.trim();

    if (!trimmed) {
      throw new ValidationError('Nickname is required');
    }
    if (trimmed.length < Nickname.MIN_LENGTH) {
      throw new ValidationError(`Nickname must be at least ${Nickname.MIN_LENGTH} characters`);
    }
    if (trimmed.length > Nickname.MAX_LENGTH) {
      throw new ValidationError(`Nickname must be at most ${Nickname.MAX_LENGTH} characters`);
    }
    if (!Nickname.ALLOWED_PATTERN.test(trimmed)) {
      throw new ValidationError('Nickname can only contain letters, numbers, underscores and hyphens');
    }

    this.value = trimmed;
    // Store normalized (lowercase) version for consistent comparisons
    this._normalized = trimmed.toLowerCase();
    Object.freeze(this);
  }

  static isValid(value) {
    try {
      new Nickname(value);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the display value (preserves original casing)
   */
  toString() {
    return this.value;
  }

  /**
   * Get normalized (lowercase) value for case-insensitive comparisons
   * Use this for collision detection
   */
  normalized() {
    return this._normalized;
  }

  /**
   * Check if two nicknames are equal (case-insensitive)
   */
  equalsIgnoreCase(other) {
    if (other instanceof Nickname) {
      return this._normalized === other._normalized;
    }
    if (typeof other === 'string') {
      return this._normalized === other.toLowerCase();
    }
    return false;
  }
}

module.exports = { Nickname };
