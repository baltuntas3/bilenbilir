const { BaseParticipant, TOKEN_EXPIRATION_MS } = require('./BaseParticipant');
const { Score } = require('../value-objects/Score');
const { PowerUpType, DEFAULT_POWER_UPS } = require('../value-objects/PowerUp');
const { ValidationError, ForbiddenError } = require('../../shared/errors');
const { MAX_STREAK } = require('../../shared/config/constants');

/**
 * Player Entity
 * Represents a participant who can answer questions and earn scores
 * Extends BaseParticipant for shared nickname/token/disconnect logic
 */
class Player extends BaseParticipant {
  static TOKEN_EXPIRATION_MS = TOKEN_EXPIRATION_MS;

  constructor({ id, socketId, nickname, roomPin, token = null, playerToken = null, tokenCreatedAt = null, score = 0, streak = 0, correctAnswers = 0, longestStreak = 0, joinedAt = new Date() }) {
    super({ id, socketId, nickname, roomPin, token: token || playerToken, tokenCreatedAt, joinedAt });

    this._score = score instanceof Score ? score : new Score(score);
    this.streak = streak;
    this.correctAnswers = correctAnswers;
    this.longestStreak = longestStreak;
    this.answerAttempt = null; // Current question's answer attempt

    // Power-up state
    this.powerUps = { ...DEFAULT_POWER_UPS };
    this.activePowerUp = null; // Currently active power-up for current question
    this.eliminatedOptions = []; // 50:50 eliminated options for current question (persisted for reconnect)
  }

  // Backward-compatible alias for token
  get playerToken() {
    return this.token;
  }

  set playerToken(value) {
    this.token = value;
  }

  get score() {
    return this._score.toNumber();
  }

  addScore(points) {
    if (typeof points !== 'number' || !Number.isFinite(points)) {
      throw new ValidationError('Points must be a valid number');
    }
    if (points < 0) {
      throw new ValidationError('Points cannot be negative');
    }
    this._score = this._score.add(points);
  }

  incrementStreak() {
    // Cap streak at MAX_STREAK to prevent overflow
    if (this.streak < MAX_STREAK) {
      this.streak++;
    }
    this.correctAnswers++;
    if (this.streak > this.longestStreak) {
      this.longestStreak = this.streak;
    }
  }

  resetStreak() {
    this.streak = 0;
  }

  submitAnswer(answerIndex, elapsedTimeMs) {
    // Prevent disconnected players from submitting (defensive check)
    if (this.isDisconnected()) {
      throw new ForbiddenError('Cannot submit answer while disconnected');
    }

    // Prevent duplicate submissions
    if (this.hasAnswered()) {
      throw new ForbiddenError('Already answered this question');
    }

    // Validate answerIndex
    if (typeof answerIndex !== 'number' || !Number.isInteger(answerIndex) || answerIndex < 0) {
      throw new ValidationError('Answer index must be a non-negative integer');
    }

    // Validate elapsedTimeMs
    if (typeof elapsedTimeMs !== 'number' || !Number.isFinite(elapsedTimeMs) || elapsedTimeMs < 0) {
      throw new ValidationError('Elapsed time must be a non-negative number');
    }

    this.answerAttempt = {
      answerIndex,
      elapsedTimeMs: Math.max(0, elapsedTimeMs),
      submittedAt: new Date()
    };
  }

  clearAnswerAttempt() {
    this.answerAttempt = null;
    this.clearActivePowerUp();
    this.eliminatedOptions = [];
  }

  hasAnswered() {
    return this.answerAttempt !== null;
  }

  // ==================== POWER-UP METHODS ====================

  /**
   * Get remaining count for a power-up type
   * @param {string} type - PowerUpType
   * @returns {number}
   */
  getPowerUpCount(type) {
    if (!PowerUpType[type]) {
      throw new ValidationError(`Invalid power-up type: ${type}`);
    }
    return this.powerUps[type] || 0;
  }

  /**
   * Get a copy of all power-ups
   * @returns {Object}
   */
  getAllPowerUps() {
    return { ...this.powerUps };
  }

  /**
   * Use a power-up: validates and decrements count.
   * Does NOT set activePowerUp — that is the responsibility of the
   * power-up strategy (only DOUBLE_POINTS needs deferred activation).
   * This allows combining multiple power-ups in the same question.
   * @param {string} type - PowerUpType
   * @returns {string} The power-up type used
   */
  usePowerUp(type) {
    if (!PowerUpType[type]) {
      throw new ValidationError(`Invalid power-up type: ${type}`);
    }
    if ((this.powerUps[type] || 0) <= 0) {
      throw new ValidationError(`No ${type} power-up remaining`);
    }
    this.powerUps[type]--;
    return type;
  }

  /**
   * Mark a power-up as active for scoring (e.g. DOUBLE_POINTS).
   * Called by the power-up strategy after successful execution.
   * @param {string} type - PowerUpType
   */
  setActivePowerUp(type) {
    if (!PowerUpType[type]) {
      throw new ValidationError(`Invalid power-up type: ${type}`);
    }
    this.activePowerUp = type;
  }

  /**
   * Check if a specific power-up type is currently active
   * @param {string} type - PowerUpType
   * @returns {boolean}
   */
  hasActivePowerUp(type) {
    return this.activePowerUp === type;
  }

  /**
   * Set eliminated options for 50:50 power-up (persisted for reconnect)
   * @param {number[]} options - Array of eliminated option indices
   */
  setEliminatedOptions(options) {
    if (!Array.isArray(options)) {
      throw new ValidationError('eliminatedOptions must be an array');
    }
    this.eliminatedOptions = [...options];
  }

  /**
   * Refund a consumed power-up (e.g. when timer extension fails)
   * @param {string} type - PowerUpType
   */
  refundPowerUp(type) {
    if (!PowerUpType[type]) {
      throw new ValidationError(`Invalid power-up type: ${type}`);
    }
    this.powerUps[type] = (this.powerUps[type] || 0) + 1;
    if (this.activePowerUp === type) {
      this.activePowerUp = null;
    }
  }

  clearActivePowerUp() {
    this.activePowerUp = null;
  }

  /**
   * Convert to plain object for serialization
   * @param {Object} options - Serialization options
   * @param {boolean} options.includeScore - Include score in output (default: true)
   * @param {boolean} options.includeStats - Include stats like streak, correctAnswers (default: false)
   */
  toJSON({ includeScore = true, includeStats = false } = {}) {
    const result = {
      id: this.id,
      nickname: this.nickname
    };

    if (includeScore) {
      result.score = this.score;
    }

    if (includeStats) {
      result.streak = this.streak;
      result.correctAnswers = this.correctAnswers;
      result.longestStreak = this.longestStreak;
    }

    return result;
  }
}

module.exports = { Player };
