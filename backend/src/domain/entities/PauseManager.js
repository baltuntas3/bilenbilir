const { ValidationError, ForbiddenError } = require('../../shared/errors');

class PauseManager {
  constructor() {
    this.pausedAt = null;
    this.pausedFromState = null;
    // Timer state preserved when pausing from ANSWERING_PHASE
    this.pausedTimerState = null;
  }

  /**
   * Validate and prepare pause transition.
   * All validation happens before any state mutation.
   * @returns {string} The new state to transition to
   */
  pause(currentState, isHost, allowedStates, pausedState) {
    if (!isHost) throw new ForbiddenError('Only host can pause the game');
    const allowed = Array.isArray(allowedStates) ? allowedStates : [allowedStates];
    if (!allowed.includes(currentState)) {
      throw new ValidationError(`Game can only be paused from: ${allowed.join(', ')}`);
    }
    // Return transition info — caller applies via applyPause() after setState succeeds
    return { pausedState, fromState: currentState };
  }

  /**
   * Apply pause state after successful state transition.
   * Must be called only after Room.setState() succeeds.
   * @param {string} fromState - The state before pausing
   * @param {Object|null} timerState - Timer state to preserve when pausing from ANSWERING_PHASE
   *   { remainingMs: number, originalDurationMs: number }
   */
  applyPause(fromState, timerState = null) {
    this.pausedFromState = fromState;
    this.pausedAt = new Date();
    this.pausedTimerState = timerState;
  }

  /**
   * Validate and prepare resume transition.
   * All validation happens before any state mutation.
   * @returns {string} The state to resume to
   */
  resume(currentState, isHost, pausedState) {
    if (!isHost) throw new ForbiddenError('Only host can resume the game');
    if (currentState !== pausedState) {
      throw new ValidationError('Game is not paused');
    }
    if (!this.pausedFromState) {
      throw new ValidationError('Cannot resume: previous state is unknown');
    }
    return this.pausedFromState;
  }

  /**
   * Clear pause state after successful state transition.
   * Must be called only after Room.setState() succeeds.
   */
  applyResume() {
    this.pausedAt = null;
    this.pausedFromState = null;
    this.pausedTimerState = null;
  }

  /**
   * Get preserved timer state (only meaningful when paused from ANSWERING_PHASE)
   * @returns {Object|null} { remainingMs, originalDurationMs } or null
   */
  getTimerState() {
    return this.pausedTimerState;
  }

  isPaused(currentState, pausedState) {
    return currentState === pausedState;
  }

  getDuration() {
    if (!this.pausedAt) return 0;
    return Date.now() - this.pausedAt.getTime();
  }
}

module.exports = { PauseManager };
