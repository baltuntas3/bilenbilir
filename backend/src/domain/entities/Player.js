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
    // Cap longestStreak at MAX_STREAK as well for consistency
    if (this.streak > this.longestStreak && this.longestStreak < MAX_STREAK) {
      this.longestStreak = Math.min(this.streak, MAX_STREAK);
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
   * Use a power-up: validates, decrements count, sets as active
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
    this.activePowerUp = type;
    return type;
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
   * Clear the active power-up
   */
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
