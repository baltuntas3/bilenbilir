const { ValidationError } = require('../../shared/errors');

// Maximum score to prevent integer overflow (10 million points)
const MAX_SCORE = 10000000;

class Score {
  static MAX_SCORE = MAX_SCORE;

  constructor(value = 0) {
    if (typeof value !== 'number' || isNaN(value)) {
      throw new ValidationError('Score must be a number');
    }
    if (value < 0) {
      throw new ValidationError('Score cannot be negative');
    }
    if (value > MAX_SCORE) {
      throw new ValidationError(`Score cannot exceed ${MAX_SCORE}`);
    }
    this.value = Math.round(value);
    Object.freeze(this);
  }

  add(points) {
    if (typeof points !== 'number' || isNaN(points)) {
      throw new ValidationError('Points must be a number');
    }
    const newValue = this.value + points;
    if (newValue < 0) {
      throw new ValidationError('Resulting score cannot be negative');
    }
    // Cap at MAX_SCORE with warning for tracking purposes
    if (newValue > MAX_SCORE) {
      console.warn(`[Score] Score capped at MAX_SCORE: attempted ${newValue}, capped to ${MAX_SCORE}`);
      return new Score(MAX_SCORE);
    }
    return new Score(newValue);
  }

  isGreaterThan(other) {
    if (!(other instanceof Score)) {
      throw new ValidationError('Can only compare with another Score');
    }
    return this.value > other.value;
  }

  equals(other) {
    if (!(other instanceof Score)) return false;
    return this.value === other.value;
  }

  toString() {
    return this.value.toString();
  }

  toNumber() {
    return this.value;
  }
}

module.exports = { Score };
