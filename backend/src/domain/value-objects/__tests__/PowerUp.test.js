const { PowerUp, PowerUpType, POWER_UP_LABELS, DEFAULT_POWER_UPS, powerUpRegistry, executePowerUp } = require('../PowerUp');

describe('PowerUp class', () => {
  describe('constructor', () => {
    it('should create a power-up with valid type', () => {
      const pu = new PowerUp(PowerUpType.FIFTY_FIFTY, 2);
      expect(pu.type).toBe('FIFTY_FIFTY');
      expect(pu.count).toBe(2);
    });

    it('should default count to 1', () => {
      const pu = new PowerUp(PowerUpType.DOUBLE_POINTS);
      expect(pu.count).toBe(1);
    });

    it('should clamp negative count to 0', () => {
      const pu = new PowerUp(PowerUpType.TIME_EXTENSION, -5);
      expect(pu.count).toBe(0);
    });

    it('should be frozen (immutable)', () => {
      const pu = new PowerUp(PowerUpType.FIFTY_FIFTY);
      expect(Object.isFrozen(pu)).toBe(true);
    });

    it('should throw for invalid type', () => {
      expect(() => new PowerUp('INVALID')).toThrow('Invalid power-up type');
    });
  });

  describe('canUse', () => {
    it('should return true when count > 0', () => {
      expect(new PowerUp(PowerUpType.FIFTY_FIFTY, 1).canUse()).toBe(true);
    });

    it('should return false when count is 0', () => {
      expect(new PowerUp(PowerUpType.FIFTY_FIFTY, 0).canUse()).toBe(false);
    });
  });

  describe('use', () => {
    it('should return new PowerUp with decremented count', () => {
      const pu = new PowerUp(PowerUpType.DOUBLE_POINTS, 2);
      const used = pu.use();
      expect(used.count).toBe(1);
      expect(used.type).toBe('DOUBLE_POINTS');
      expect(pu.count).toBe(2); // original unchanged
    });

    it('should throw when no uses remaining', () => {
      const pu = new PowerUp(PowerUpType.TIME_EXTENSION, 0);
      expect(() => pu.use()).toThrow('remaining');
    });
  });
});

describe('PowerUpType', () => {
  it('should have three types', () => {
    expect(PowerUpType.FIFTY_FIFTY).toBe('FIFTY_FIFTY');
    expect(PowerUpType.DOUBLE_POINTS).toBe('DOUBLE_POINTS');
    expect(PowerUpType.TIME_EXTENSION).toBe('TIME_EXTENSION');
  });
});

describe('POWER_UP_LABELS', () => {
  it('should have labels for all types', () => {
    expect(POWER_UP_LABELS[PowerUpType.FIFTY_FIFTY]).toBe('50:50');
    expect(POWER_UP_LABELS[PowerUpType.DOUBLE_POINTS]).toBe('Çift Puan');
    expect(POWER_UP_LABELS[PowerUpType.TIME_EXTENSION]).toBe('Süre Uzatma');
  });
});

describe('DEFAULT_POWER_UPS', () => {
  it('should give 1 of each type', () => {
    expect(DEFAULT_POWER_UPS[PowerUpType.FIFTY_FIFTY]).toBe(1);
    expect(DEFAULT_POWER_UPS[PowerUpType.DOUBLE_POINTS]).toBe(1);
    expect(DEFAULT_POWER_UPS[PowerUpType.TIME_EXTENSION]).toBe(1);
  });
});

describe('PowerUpRegistry', () => {
  describe('register', () => {
    it('should register a valid strategy', () => {
      const registry = require('../PowerUp').powerUpRegistry;
      expect(registry.has(PowerUpType.FIFTY_FIFTY)).toBe(true);
      expect(registry.has(PowerUpType.DOUBLE_POINTS)).toBe(true);
      expect(registry.has(PowerUpType.TIME_EXTENSION)).toBe(true);
    });

    it('should throw if strategy missing execute', () => {
      const { PowerUpRegistry } = jest.requireActual('../PowerUp');
      const reg = new (Object.getPrototypeOf(powerUpRegistry).constructor)();
      expect(() => reg.register('TEST', { getEmitActions: () => {} })).toThrow('execute()');
    });

    it('should throw if strategy missing getEmitActions', () => {
      const reg = new (Object.getPrototypeOf(powerUpRegistry).constructor)();
      expect(() => reg.register('TEST', { execute: () => {} })).toThrow('getEmitActions()');
    });
  });

  describe('execute', () => {
    it('should throw for unknown power-up type', () => {
      expect(() => powerUpRegistry.execute('UNKNOWN', {})).toThrow('Unknown power-up type');
    });
  });

  describe('has', () => {
    it('should return false for unregistered type', () => {
      expect(powerUpRegistry.has('NONEXISTENT')).toBe(false);
    });
  });

  describe('FIFTY_FIFTY strategy', () => {
    it('should execute and return eliminated options', () => {
      const mockPlayer = { eliminatedOptions: [], setEliminatedOptions(opts) { this.eliminatedOptions = [...opts]; } };
      const mockRoom = {
        getFiftyFiftyOptions: jest.fn().mockReturnValue([0, 2]),
        getPlayer: jest.fn().mockReturnValue(mockPlayer)
      };
      const mockQuestion = { correctAnswerIndex: 1, options: ['a', 'b', 'c', 'd'] };

      const { result, emitActions } = powerUpRegistry.execute(PowerUpType.FIFTY_FIFTY, {
        room: mockRoom,
        socketId: 'sock-1',
        currentQuestion: mockQuestion
      });

      expect(result.type).toBe('FIFTY_FIFTY');
      expect(result.eliminatedOptions).toEqual([0, 2]);
      expect(mockPlayer.eliminatedOptions).toEqual([0, 2]);
      expect(emitActions.playerEmits[0].event).toBe('fifty_fifty_result');
      expect(emitActions.roomEmits).toEqual([]);
      expect(emitActions.timerAction).toBeNull();
    });

    it('should handle null player gracefully', () => {
      const mockRoom = {
        getFiftyFiftyOptions: jest.fn().mockReturnValue([0, 2]),
        getPlayer: jest.fn().mockReturnValue(null)
      };
      const mockQuestion = { correctAnswerIndex: 1, options: ['a', 'b', 'c', 'd'] };

      const { result } = powerUpRegistry.execute(PowerUpType.FIFTY_FIFTY, {
        room: mockRoom, socketId: 'sock-1', currentQuestion: mockQuestion
      });
      expect(result.eliminatedOptions).toEqual([0, 2]);
    });
  });

  describe('DOUBLE_POINTS strategy', () => {
    it('should execute and return activation', () => {
      const { result, emitActions } = powerUpRegistry.execute(PowerUpType.DOUBLE_POINTS, {});
      expect(result.type).toBe('DOUBLE_POINTS');
      expect(result.activated).toBe(true);
      expect(emitActions.playerEmits[0].event).toBe('power_up_activated');
      expect(emitActions.timerAction).toBeNull();
    });
  });

  describe('TIME_EXTENSION strategy', () => {
    it('should execute and return extra time', () => {
      const { result, emitActions } = powerUpRegistry.execute(PowerUpType.TIME_EXTENSION, {});
      expect(result.type).toBe('TIME_EXTENSION');
      expect(result.extraTimeMs).toBe(10000);
      expect(emitActions.playerEmits).toHaveLength(2);
      expect(emitActions.timerAction).toEqual({ method: 'extendTimer', args: [10000] });
    });
  });
});

describe('executePowerUp (backward-compat wrapper)', () => {
  it('should return result without emitActions', () => {
    const result = executePowerUp(PowerUpType.DOUBLE_POINTS, {});
    expect(result.type).toBe('DOUBLE_POINTS');
    expect(result.activated).toBe(true);
  });
});
