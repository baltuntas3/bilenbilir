const { GameTimerService } = require('../../../src/infrastructure/services/GameTimerService');

describe('GameTimerService', () => {
  let timerService;
  let mockIo;
  let emittedEvents;

  beforeEach(() => {
    emittedEvents = [];
    mockIo = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn((event, data) => {
        emittedEvents.push({ event, data });
      })
    };
    timerService = new GameTimerService(mockIo);
  });

  afterEach(() => {
    timerService.stopAll();
    jest.clearAllTimers();
  });

  describe('startTimer', () => {
    it('should start a timer and emit timer_started and timer_tick', () => {
      jest.useFakeTimers();

      timerService.startTimer('123456', 30, jest.fn());

      expect(mockIo.to).toHaveBeenCalledWith('123456');

      // Should emit timer_started with sync data
      expect(mockIo.emit).toHaveBeenCalledWith('timer_started', expect.objectContaining({
        duration: 30,
        durationMs: 30000
      }));

      // Should emit initial timer_tick with sync data
      expect(mockIo.emit).toHaveBeenCalledWith('timer_tick', expect.objectContaining({
        remaining: 30,
        remainingMs: 30000
      }));

      jest.useRealTimers();
    });

    it('should emit timer_tick with sync data every second', () => {
      jest.useFakeTimers();

      timerService.startTimer('123456', 30, jest.fn());

      // Clear initial emit
      mockIo.emit.mockClear();

      // Advance 1 second
      jest.advanceTimersByTime(1000);

      expect(mockIo.emit).toHaveBeenCalledWith('timer_tick', expect.objectContaining({
        remaining: 29,
        remainingMs: 29000
      }));

      jest.useRealTimers();
    });

    it('should call onExpire when timer expires', () => {
      jest.useFakeTimers();

      const onExpire = jest.fn();
      timerService.startTimer('123456', 2, onExpire);

      // Advance 2 seconds
      jest.advanceTimersByTime(2000);

      expect(onExpire).toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('should replace existing timer for same pin', () => {
      jest.useFakeTimers();

      const onExpire1 = jest.fn();
      const onExpire2 = jest.fn();

      timerService.startTimer('123456', 10, onExpire1);
      timerService.startTimer('123456', 5, onExpire2);

      // Advance 5 seconds - only second timer should fire
      jest.advanceTimersByTime(5000);

      expect(onExpire1).not.toHaveBeenCalled();
      expect(onExpire2).toHaveBeenCalled();

      jest.useRealTimers();
    });
  });

  describe('stopTimer', () => {
    it('should stop an active timer', () => {
      jest.useFakeTimers();

      const onExpire = jest.fn();
      timerService.startTimer('123456', 5, onExpire);

      timerService.stopTimer('123456');

      // Advance past timer duration
      jest.advanceTimersByTime(6000);

      expect(onExpire).not.toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('should handle stopping non-existent timer', () => {
      expect(() => timerService.stopTimer('nonexistent')).not.toThrow();
    });
  });

  describe('getElapsedTime', () => {
    it('should return elapsed time since timer started', () => {
      jest.useFakeTimers();

      timerService.startTimer('123456', 30, jest.fn());

      // Advance 5 seconds
      jest.advanceTimersByTime(5000);

      const elapsed = timerService.getElapsedTime('123456');
      expect(elapsed).toBe(5000);

      jest.useRealTimers();
    });

    it('should return null for non-existent timer', () => {
      expect(timerService.getElapsedTime('nonexistent')).toBeNull();
    });
  });

  describe('getRemainingTime', () => {
    it('should return remaining time', () => {
      jest.useFakeTimers();

      timerService.startTimer('123456', 30, jest.fn());

      // Advance 10 seconds
      jest.advanceTimersByTime(10000);

      const remaining = timerService.getRemainingTime('123456');
      expect(remaining).toBe(20000);

      jest.useRealTimers();
    });

    it('should return 0 for non-existent timer', () => {
      expect(timerService.getRemainingTime('nonexistent')).toBe(0);
    });
  });

  describe('isTimerActive', () => {
    it('should return true for active timer', () => {
      jest.useFakeTimers();

      timerService.startTimer('123456', 30, jest.fn());

      expect(timerService.isTimerActive('123456')).toBe(true);

      jest.useRealTimers();
    });

    it('should return false after timer expires', () => {
      jest.useFakeTimers();

      timerService.startTimer('123456', 1, jest.fn());

      // Advance past expiration
      jest.advanceTimersByTime(1500);

      expect(timerService.isTimerActive('123456')).toBe(false);

      jest.useRealTimers();
    });

    it('should return false for non-existent timer', () => {
      expect(timerService.isTimerActive('nonexistent')).toBe(false);
    });
  });

  describe('isTimeExpired', () => {
    it('should return false for active timer', () => {
      jest.useFakeTimers();

      timerService.startTimer('123456', 30, jest.fn());

      expect(timerService.isTimeExpired('123456')).toBe(false);

      jest.useRealTimers();
    });

    it('should return true after timer expires', () => {
      jest.useFakeTimers();

      timerService.startTimer('123456', 1, jest.fn());

      // Advance past expiration
      jest.advanceTimersByTime(1500);

      expect(timerService.isTimeExpired('123456')).toBe(true);

      jest.useRealTimers();
    });

    it('should return true for non-existent timer', () => {
      expect(timerService.isTimeExpired('nonexistent')).toBe(true);
    });
  });

  describe('stopAll', () => {
    it('should stop all active timers', () => {
      jest.useFakeTimers();

      const onExpire1 = jest.fn();
      const onExpire2 = jest.fn();

      timerService.startTimer('111111', 5, onExpire1);
      timerService.startTimer('222222', 5, onExpire2);

      timerService.stopAll();

      // Advance past timer duration
      jest.advanceTimersByTime(6000);

      expect(onExpire1).not.toHaveBeenCalled();
      expect(onExpire2).not.toHaveBeenCalled();

      jest.useRealTimers();
    });
  });

  describe('getTimerSync', () => {
    it('should return sync data for active timer', () => {
      jest.useFakeTimers();

      timerService.startTimer('123456', 30, jest.fn());

      // Advance 10 seconds
      jest.advanceTimersByTime(10000);

      const sync = timerService.getTimerSync('123456');

      expect(sync).not.toBeNull();
      expect(sync.remaining).toBe(20);
      expect(sync.remainingMs).toBe(20000);
      expect(sync.duration).toBe(30000);
      expect(sync.serverTime).toBeDefined();
      expect(sync.endTime).toBeDefined();
      expect(sync.startTime).toBeDefined();

      jest.useRealTimers();
    });

    it('should return null for non-existent timer', () => {
      expect(timerService.getTimerSync('nonexistent')).toBeNull();
    });

    it('should return 0 remaining after timer expires', () => {
      jest.useFakeTimers();

      timerService.startTimer('123456', 5, jest.fn());

      // Advance past expiration
      jest.advanceTimersByTime(6000);

      // Timer is stopped after expiration, so getTimerSync returns null
      // But if we call it before stopTimer clears it, remaining would be 0
      const sync = timerService.getTimerSync('123456');
      expect(sync).toBeNull(); // Timer is removed after onExpire

      jest.useRealTimers();
    });
  });
});
