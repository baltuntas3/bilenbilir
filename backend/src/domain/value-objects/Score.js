class Score {
  constructor(value = 0) {
    if (typeof value !== 'number' || isNaN(value)) {
      throw new Error('Score must be a number');
    }
    if (value < 0) {
      throw new Error('Score cannot be negative');
    }
    this.value = Math.round(value);
    Object.freeze(this);
  }

  add(points) {
    return new Score(this.value + points);
  }

  subtract(points) {
    const newValue = this.value - points;
    return new Score(Math.max(0, newValue));
  }

  isGreaterThan(other) {
    if (!(other instanceof Score)) {
      throw new Error('Can only compare with another Score');
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
