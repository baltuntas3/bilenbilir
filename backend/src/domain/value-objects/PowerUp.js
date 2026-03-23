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

/**
 * Power-up Strategy Registry
 *
 * Each strategy defines:
 *   execute(context) — runs domain logic, returns result data
 *   getEmitActions(result) — returns socket emit instructions for the handler layer
 *
 * To add a new power-up:
 *   1. Add its key to PowerUpType
 *   2. Register a strategy via PowerUpRegistry.register()
 *   3. No handler changes needed — the handler reads emit actions from the strategy
 */
class PowerUpRegistry {
  constructor() {
    this._strategies = new Map();
  }

  /**
   * Register a power-up strategy
   * @param {string} type - PowerUpType key
   * @param {object} strategy - { execute(context), getEmitActions(result) }
   */
  register(type, strategy) {
    if (!strategy.execute || typeof strategy.execute !== 'function') {
      throw new Error(`Strategy for ${type} must have an execute() method`);
    }
    if (!strategy.getEmitActions || typeof strategy.getEmitActions !== 'function') {
      throw new Error(`Strategy for ${type} must have a getEmitActions() method`);
    }
    this._strategies.set(type, strategy);
  }

  /**
   * Execute a power-up and return result + emit actions
   * @param {string} type - PowerUpType key
   * @param {object} context - { room, socketId, currentQuestion }
   * @returns {{ result: object, emitActions: object }}
   */
  execute(type, context) {
    const strategy = this._strategies.get(type);
    if (!strategy) {
      throw new ValidationError(`Unknown power-up type: ${type}`);
    }
    const result = strategy.execute(context);
    const emitActions = strategy.getEmitActions(result);
    return { result, emitActions };
  }

  has(type) {
    return this._strategies.has(type);
  }
}

// Singleton registry
const powerUpRegistry = new PowerUpRegistry();

// --- Register built-in power-ups ---

powerUpRegistry.register(PowerUpType.FIFTY_FIFTY, {
  execute({ room, socketId, currentQuestion }) {
    const eliminatedOptions = room.getFiftyFiftyOptions(
      socketId,
      currentQuestion.correctAnswerIndex,
      currentQuestion.options.length
    );
    // Persist on player for reconnect scenarios
    const player = room.getPlayer(socketId);
    if (player) {
      player.setEliminatedOptions(eliminatedOptions);
    }
    return { type: PowerUpType.FIFTY_FIFTY, eliminatedOptions };
  },
  getEmitActions(result) {
    return {
      playerEmits: [{ event: 'fifty_fifty_result', data: { eliminatedOptions: result.eliminatedOptions } }],
      roomEmits: [],
      timerAction: null,
    };
  }
});

powerUpRegistry.register(PowerUpType.DOUBLE_POINTS, {
  execute() {
    return { type: PowerUpType.DOUBLE_POINTS, activated: true };
  },
  getEmitActions() {
    return {
      playerEmits: [{ event: 'power_up_activated', data: { type: 'DOUBLE_POINTS' } }],
      roomEmits: [],
      timerAction: null,
    };
  }
});

powerUpRegistry.register(PowerUpType.TIME_EXTENSION, {
  execute() {
    return { type: PowerUpType.TIME_EXTENSION, extraTimeMs: TIME_EXTENSION_MS };
  },
  getEmitActions(result) {
    return {
      playerEmits: [
        { event: 'power_up_activated', data: { type: 'TIME_EXTENSION' } },
        { event: 'time_extended', data: { extraTimeMs: result.extraTimeMs } }
      ],
      roomEmits: [],
      timerAction: { method: 'extendTimer', args: [result.extraTimeMs] },
    };
  }
});

// Backward-compatible wrapper
function executePowerUp(type, context) {
  const { result } = powerUpRegistry.execute(type, context);
  return result;
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

module.exports = { PowerUp, PowerUpType, POWER_UP_LABELS, DEFAULT_POWER_UPS, powerUpRegistry, executePowerUp };
