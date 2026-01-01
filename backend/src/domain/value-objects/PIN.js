class PIN {
  static LENGTH = 6;
  static ALLOWED_CHARS = '0123456789';

  constructor(value) {
    if (!PIN.isValid(value)) {
      throw new Error(`PIN must be ${PIN.LENGTH} digits`);
    }
    this.value = value;
    Object.freeze(this);
  }

  static isValid(value) {
    if (typeof value !== 'string') return false;
    if (value.length !== PIN.LENGTH) return false;
    return [...value].every(char => PIN.ALLOWED_CHARS.includes(char));
  }

  static generate() {
    let pin = '';
    for (let i = 0; i < PIN.LENGTH; i++) {
      const randomIndex = Math.floor(Math.random() * PIN.ALLOWED_CHARS.length);
      pin += PIN.ALLOWED_CHARS[randomIndex];
    }
    return new PIN(pin);
  }

  equals(other) {
    if (!(other instanceof PIN)) return false;
    return this.value === other.value;
  }

  toString() {
    return this.value;
  }
}

module.exports = { PIN };
