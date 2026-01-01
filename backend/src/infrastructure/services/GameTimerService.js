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
   * Build timer sync data object
   * @private
   */
  _buildTimerSync(endTime, startTime = null, duration = null) {
    const now = Date.now();
    const remainingMs = Math.max(0, endTime - now);
    const result = {
      remaining: Math.ceil(remainingMs / 1000),
      serverTime: now,
      endTime,
      remainingMs
    };
    if (startTime !== null) result.startTime = startTime;
    if (duration !== null) result.duration = duration;
    return result;
  }

  /**
   * Start a timer for a room's answering phase
   */
  startTimer(pin, durationSeconds, onExpire) {
    this.stopTimer(pin);

    const durationMs = durationSeconds * 1000;
    const startTime = Date.now();
    const endTime = startTime + durationMs;

    const timerId = setTimeout(async () => {
      this.stopTimer(pin);
      if (onExpire) {
        await onExpire();
      }
    }, durationMs);

    const intervalId = setInterval(() => {
      const syncData = this._buildTimerSync(endTime);
      this.io.to(pin).emit('timer_tick', syncData);

      if (syncData.remaining <= 0) {
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

    this.io.to(pin).emit('timer_started', {
      duration: durationSeconds,
      durationMs,
      serverTime: startTime,
      endTime
    });

    // Emit first tick for compatibility
    this.io.to(pin).emit('timer_tick', this._buildTimerSync(endTime));
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
    return this._buildTimerSync(timer.endTime, timer.startTime, timer.duration);
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
