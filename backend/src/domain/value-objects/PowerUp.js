const { ValidationError } = require('../../shared/errors');
const { TIME_EXTENSION_MS } = require('../../shared/config/constants');

const PowerUpType = {
  FIFTY_FIFTY: 'FIFTY_FIFTY',
  DOUBLE_POINTS: 'DOUBLE_POINTS',
  TIME_EXTENSION: 'TIME_EXTENSION'
};

const POWER_UP_LABELS = {
  [PowerUpType.FIFTY_FIFTY]: '50:50',
  [PowerUpType.DOUBLE_POINTS]: 'Çift Puan',
  [PowerUpType.TIME_EXTENSION]: 'Süre Uzatma'
};

const DEFAULT_POWER_UPS = {
  [PowerUpType.FIFTY_FIFTY]: 1,
  [PowerUpType.DOUBLE_POINTS]: 1,
  [PowerUpType.TIME_EXTENSION]: 1
};

// Strategy interface for power-ups
const powerUpStrategies = {
  [PowerUpType.FIFTY_FIFTY]: {
    execute({ room, socketId, currentQuestion }) {
      const eliminatedOptions = room.getFiftyFiftyOptions(
        socketId,
        currentQuestion.correctAnswerIndex,
        currentQuestion.options.length
      );
      return { type: PowerUpType.FIFTY_FIFTY, eliminatedOptions };
    }
  },
  [PowerUpType.DOUBLE_POINTS]: {
    execute() {
      return { type: PowerUpType.DOUBLE_POINTS, activated: true };
    }
  },
  [PowerUpType.TIME_EXTENSION]: {
    execute() {
      return { type: PowerUpType.TIME_EXTENSION, extraTimeMs: TIME_EXTENSION_MS };
    }
  }
};

function executePowerUp(type, context) {
  const strategy = powerUpStrategies[type];
  if (!strategy) {
    throw new ValidationError(`Unknown power-up type: ${type}`);
  }
  return strategy.execute(context);
}

class PowerUp {
  constructor(type, count = 1) {
    if (!PowerUpType[type]) {
      throw new ValidationError(`Invalid power-up type: ${type}`);
    }
    this.type = type;
    this.count = Math.max(0, count);
    Object.freeze(this);
  }

  canUse() {
    return this.count > 0;
  }

  use() {
    if (!this.canUse()) {
      throw new ValidationError(`No ${POWER_UP_LABELS[this.type]} remaining`);
    }
    return new PowerUp(this.type, this.count - 1);
  }
}

module.exports = { PowerUp, PowerUpType, POWER_UP_LABELS, DEFAULT_POWER_UPS, powerUpStrategies, executePowerUp };
