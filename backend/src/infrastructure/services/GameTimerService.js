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
    const endTime = Date.now() + durationMs;

    // Main timeout for when time expires
    const timerId = setTimeout(async () => {
      this.stopTimer(pin);
      if (onExpire) {
        await onExpire();
      }
    }, durationMs);

    // Interval for broadcasting remaining time (every second)
    const intervalId = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
      this.io.to(pin).emit('timer_tick', { remaining });

      if (remaining <= 0) {
        clearInterval(intervalId);
      }
    }, 1000);

    this.activeTimers.set(pin, {
      timerId,
      intervalId,
      endTime,
      startTime: Date.now(),
      duration: durationMs
    });

    // Emit initial time
    this.io.to(pin).emit('timer_tick', { remaining: durationSeconds });
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
   * Stop all timers (for cleanup)
   */
  stopAll() {
    for (const pin of this.activeTimers.keys()) {
      this.stopTimer(pin);
    }
  }
}

module.exports = { GameTimerService };
