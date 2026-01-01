/**
 * Game Timer Service
 * Manages server-side timers for answering phases
 * Prevents client-side timer manipulation
 */
class GameTimerService {
  constructor(io) {
    this.io = io;
    this.activeTimers = new Map(); // pin -> { timerId, endTime, intervalId }
  }

  /**
   * Start a timer for a room's answering phase
   */
  startTimer(pin, durationSeconds, onExpire) {
    // Clear any existing timer for this room
    this.stopTimer(pin);

    const durationMs = durationSeconds * 1000;
    const startTime = Date.now();
    const endTime = startTime + durationMs;

    // Main timeout for when time expires
    const timerId = setTimeout(async () => {
      this.stopTimer(pin);
      if (onExpire) {
        await onExpire();
      }
    }, durationMs);

    // Interval for broadcasting sync data (every second)
    // Clients should use serverTime and endTime to calculate remaining locally
    const intervalId = setInterval(() => {
      const now = Date.now();
      const remainingMs = Math.max(0, endTime - now);
      const remaining = Math.ceil(remainingMs / 1000);

      this.io.to(pin).emit('timer_tick', {
        remaining,           // For backwards compatibility
        serverTime: now,     // Current server timestamp
        endTime,             // When timer expires (absolute)
        remainingMs          // Precise remaining milliseconds
      });

      if (remaining <= 0) {
        clearInterval(intervalId);
      }
    }, 1000);

    this.activeTimers.set(pin, {
      timerId,
      intervalId,
      endTime,
      startTime,
      duration: durationMs
    });

    // Emit initial sync data with all timing info
    this.io.to(pin).emit('timer_started', {
      duration: durationSeconds,
      durationMs,
      serverTime: startTime,
      endTime
    });

    // Also emit first tick for compatibility
    this.io.to(pin).emit('timer_tick', {
      remaining: durationSeconds,
      serverTime: startTime,
      endTime,
      remainingMs: durationMs
    });
  }

  /**
   * Stop and clean up timer for a room
   */
  stopTimer(pin) {
    const timer = this.activeTimers.get(pin);
    if (timer) {
      clearTimeout(timer.timerId);
      clearInterval(timer.intervalId);
      this.activeTimers.delete(pin);
    }
  }

  /**
   * Get elapsed time since answering phase started
   * Returns null if no timer is active
   */
  getElapsedTime(pin) {
    const timer = this.activeTimers.get(pin);
    if (!timer) {
      return null;
    }
    return Date.now() - timer.startTime;
  }

  /**
   * Get remaining time for a room
   * Returns 0 if timer expired or doesn't exist
   */
  getRemainingTime(pin) {
    const timer = this.activeTimers.get(pin);
    if (!timer) {
      return 0;
    }
    return Math.max(0, timer.endTime - Date.now());
  }

  /**
   * Check if timer is still active (not expired)
   */
  isTimerActive(pin) {
    const timer = this.activeTimers.get(pin);
    if (!timer) {
      return false;
    }
    return Date.now() < timer.endTime;
  }

  /**
   * Check if time has expired for a room
   */
  isTimeExpired(pin) {
    const timer = this.activeTimers.get(pin);
    if (!timer) {
      return true; // No timer = expired
    }
    return Date.now() >= timer.endTime;
  }

  /**
   * Get current timer sync data for a room
   * Useful for reconnecting clients
   */
  getTimerSync(pin) {
    const timer = this.activeTimers.get(pin);
    if (!timer) {
      return null;
    }

    const now = Date.now();
    const remainingMs = Math.max(0, timer.endTime - now);

    return {
      remaining: Math.ceil(remainingMs / 1000),
      serverTime: now,
      endTime: timer.endTime,
      remainingMs,
      startTime: timer.startTime,
      duration: timer.duration
    };
  }

  /**
   * Stop all timers (for cleanup)
   */
  stopAll() {
    for (const pin of this.activeTimers.keys()) {
      this.stopTimer(pin);
    }
  }
}

module.exports = { GameTimerService };
