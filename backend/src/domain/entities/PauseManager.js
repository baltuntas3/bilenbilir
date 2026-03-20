const { ValidationError, ForbiddenError } = require('../../shared/errors');

class PauseManager {
  constructor() {
    this.pausedAt = null;
    this.pausedFromState = null;
  }

  pause(currentState, isHost, leaderboardState, pausedState) {
    if (!isHost) throw new ForbiddenError('Only host can pause the game');
    if (currentState !== leaderboardState) {
      throw new ValidationError('Game can only be paused from leaderboard');
    }
    this.pausedFromState = currentState;
    this.pausedAt = new Date();
    return pausedState;
  }

  resume(currentState, isHost, pausedState, defaultResumeState) {
    if (!isHost) throw new ForbiddenError('Only host can resume the game');
    if (currentState !== pausedState) {
      throw new ValidationError('Game is not paused');
    }
    const resumeState = this.pausedFromState || defaultResumeState;
    this.pausedAt = null;
    this.pausedFromState = null;
    return resumeState;
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
