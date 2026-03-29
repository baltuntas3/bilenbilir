const { ValidationError } = require('../../shared/errors');

// Timer duration bounds
const MIN_DURATION_SECONDS = 5;
const MAX_DURATION_SECONDS = 120;

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
   * @param {string} pin - Room PIN
   * @param {number} durationSeconds - Timer duration in seconds
   * @param {Function} onExpire - Callback when timer expires
   * @param {Object} [options]
   * @param {number} [options.minDuration] - Minimum allowed duration (default: MIN_DURATION_SECONDS, lower for resumed timers)
   * @param {number|null} [options.originalDurationMs] - Original question time limit in ms (preserved across pause/resume for fair scoring)
   * @throws {ValidationError} If duration is invalid
   */
  startTimer(pin, durationSeconds, onExpire, options = {}) {
    const { minDuration = MIN_DURATION_SECONDS, originalDurationMs = null, silent = false } = options;
    // Resumed timers with TIME_EXTENSION may exceed MAX_DURATION_SECONDS.
    // Allow callers to raise the ceiling via maxDuration option.
    const effectiveMax = options.maxDuration || MAX_DURATION_SECONDS;

    // Validate duration - throw error instead of silent fallback
    if (typeof durationSeconds !== 'number' || !Number.isFinite(durationSeconds)) {
      throw new ValidationError('Timer duration must be a valid number');
    }
    if (durationSeconds < minDuration || durationSeconds > effectiveMax) {
      throw new ValidationError(`Timer duration must be between ${minDuration} and ${effectiveMax} seconds`);
    }

    this.stopTimer(pin);

    const durationMs = durationSeconds * 1000;
    const startTime = Date.now();
    const endTime = startTime + durationMs;

    // Create timer entry first to track state
    const timerEntry = {
      timerId: null,
      intervalId: null,
      endTime,
      startTime,
      duration: durationMs,
      // Original question time limit (before extensions/pause), used for fair scoring.
      // If not provided (first start), defaults to the initial duration.
      originalDuration: originalDurationMs || durationMs,
      stopped: false, // Flag to prevent race conditions
      onExpire: onExpire || null, // Store callback for timer extension
      totalExtensionMs: 0 // Track cumulative extensions per question
    };

    timerEntry.timerId = setTimeout(async () => {
      this.stopTimer(pin);
      if (onExpire) {
        try {
          await onExpire();
        } catch (err) {
          console.error(`[GameTimerService] Timer expire callback failed for pin ${pin}:`, err.message);
        }
      }
    }, durationMs);

    const intervalId = setInterval(() => {
      // Check if timer was stopped to prevent zombie intervals
      const currentTimer = this.activeTimers.get(pin);
      if (!currentTimer || currentTimer.stopped) {
        clearInterval(intervalId);
        return;
      }

      const syncData = this._buildTimerSync(currentTimer.endTime);
      this.io.to(pin).emit('timer_tick', syncData);

      // Clean up interval when timer expires
      if (syncData.remaining <= 0) {
        clearInterval(intervalId);
      }
    }, 1000);
    timerEntry.intervalId = intervalId;

    this.activeTimers.set(pin, timerEntry);

    // When silent=true, caller is responsible for emitting timer_started
    // after its own state event (e.g. answering_started) to guarantee ordering.
    // Both timer_started AND the first tick are suppressed so clients receive
    // events in the correct order: state transition → timer_started → tick.
    if (!silent) {
      this.io.to(pin).emit('timer_started', {
        duration: durationSeconds,
        durationMs,
        serverTime: startTime,
        endTime
      });
      // Emit first tick for compatibility
      this.io.to(pin).emit('timer_tick', this._buildTimerSync(endTime));
    }

    return { duration: durationSeconds, durationMs, serverTime: startTime, endTime };
  }

  /**
   * Stop and clean up timer for a room
   */
  stopTimer(pin) {
    const timer = this.activeTimers.get(pin);
    if (timer) {
      // Mark as stopped first to prevent race conditions with interval
      timer.stopped = true;
      if (timer.timerId) clearTimeout(timer.timerId);
      if (timer.intervalId) clearInterval(timer.intervalId);
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
   * Get original timer duration (before extensions/pause) for fair scoring.
   * TIME_EXTENSION increases total duration but should not inflate scores.
   * @returns {number|null} Original duration in ms, or null if no timer
   */
  getOriginalDuration(pin) {
    const timer = this.activeTimers.get(pin);
    if (!timer) return null;
    return timer.originalDuration;
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
   * Extend the active timer for a room by the given milliseconds
   * @param {string} pin - Room PIN
   * @param {number} extraMs - Milliseconds to add
   */
  /**
   * Extend the active timer for a room by the given milliseconds.
   * @returns {number} Actual milliseconds extended (0 if cap reached or no timer)
   */
  extendTimer(pin, extraMs) {
    const timer = this.activeTimers.get(pin);
    if (!timer || timer.stopped) {
      return 0;
    }

    // Cap per-call extension and enforce cumulative cap per question
    const MAX_EXTENSION_PER_CALL_MS = 30000;
    const MAX_TOTAL_EXTENSION_MS = 30000; // 30s max total extensions per question
    const remainingBudget = Math.max(0, MAX_TOTAL_EXTENSION_MS - timer.totalExtensionMs);
    if (remainingBudget <= 0) return 0;
    const safeExtraMs = Math.min(Math.max(0, extraMs), MAX_EXTENSION_PER_CALL_MS, remainingBudget);
    if (safeExtraMs <= 0) return 0;

    // Track cumulative extension
    timer.totalExtensionMs += safeExtraMs;

    // Extend the end time
    timer.endTime += safeExtraMs;
    timer.duration += safeExtraMs;

    // Reschedule the main timeout with stored onExpire callback
    if (timer.timerId) {
      clearTimeout(timer.timerId);
    }
    const remainingMs = Math.max(0, timer.endTime - Date.now());
    const onExpire = timer.onExpire;
    timer.timerId = setTimeout(async () => {
      this.stopTimer(pin);
      if (onExpire) {
        try {
          await onExpire();
        } catch (err) {
          console.error(`[GameTimerService] Timer expire callback failed for pin ${pin}:`, err.message);
        }
      }
    }, remainingMs);

    // Emit updated timer info so clients can re-sync
    this.io.to(pin).emit('timer_started', {
      duration: Math.ceil((timer.endTime - timer.startTime) / 1000),
      durationMs: timer.endTime - timer.startTime,
      serverTime: Date.now(),
      endTime: timer.endTime
    });

    return safeExtraMs;
  }

  /**
   * Get remaining extension budget for a room's active timer
   * @returns {number} Remaining ms that can be extended (0 if no timer or cap reached)
   */
  getRemainingExtensionBudget(pin) {
    const timer = this.activeTimers.get(pin);
    if (!timer || timer.stopped) return 0;
    const MAX_TOTAL_EXTENSION_MS = 30000;
    return Math.max(0, MAX_TOTAL_EXTENSION_MS - timer.totalExtensionMs);
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
