const { Nickname } = require('../value-objects/Nickname');
const { Score } = require('../value-objects/Score');

// Token expires after 24 hours
const TOKEN_EXPIRATION_MS = 24 * 60 * 60 * 1000;

class Player {
  static TOKEN_EXPIRATION_MS = TOKEN_EXPIRATION_MS;

  constructor({ id, socketId, nickname, roomPin, playerToken = null, tokenCreatedAt = null, score = 0, streak = 0, correctAnswers = 0, longestStreak = 0, joinedAt = new Date() }) {
    this.id = id;
    this.socketId = socketId;
    this._nickname = nickname instanceof Nickname ? nickname : new Nickname(nickname);
    this.roomPin = roomPin;
    this.playerToken = playerToken;
    this.tokenCreatedAt = tokenCreatedAt || (playerToken ? new Date() : null);
    this._score = score instanceof Score ? score : new Score(score);
    this.streak = streak;
    this.correctAnswers = correctAnswers;
    this.longestStreak = longestStreak;
    this.joinedAt = joinedAt;
    this.answerAttempt = null; // Current question's answer attempt
    this.disconnectedAt = null;
  }

  get nickname() {
    return this._nickname.toString();
  }

  /**
   * Check if player has the given nickname (case-insensitive)
   * @param {string|Nickname} other - Nickname to compare
   * @returns {boolean}
   */
  hasNickname(other) {
    return this._nickname.equalsIgnoreCase(other);
  }

  /**
   * Get normalized (lowercase) nickname for lookups
   * @returns {string}
   */
  getNormalizedNickname() {
    return this._nickname.normalized();
  }

  get score() {
    return this._score.toNumber();
  }

  addScore(points) {
    this._score = this._score.add(points);
  }

  incrementStreak() {
    this.streak++;
    this.correctAnswers++;
    if (this.streak > this.longestStreak) {
      this.longestStreak = this.streak;
    }
  }

  resetStreak() {
    this.streak = 0;
  }

  submitAnswer(answerIndex, elapsedTimeMs) {
    // Defensive validation - caller should validate, but double-check here
    if (typeof answerIndex !== 'number' || !Number.isInteger(answerIndex) || answerIndex < 0) {
      throw new Error('Invalid answer index');
    }
    if (typeof elapsedTimeMs !== 'number' || !Number.isFinite(elapsedTimeMs) || elapsedTimeMs < 0) {
      throw new Error('Invalid elapsed time');
    }

    // Prevent disconnected players from submitting (defensive check)
    if (this.isDisconnected()) {
      throw new Error('Cannot submit answer while disconnected');
    }

    this.answerAttempt = {
      answerIndex,
      elapsedTimeMs,
      submittedAt: new Date()
    };
  }

  clearAnswerAttempt() {
    this.answerAttempt = null;
  }

  hasAnswered() {
    return this.answerAttempt !== null;
  }

  setDisconnected() {
    this.disconnectedAt = new Date();
  }

  reconnect(newSocketId, newToken = null) {
    this.socketId = newSocketId;
    this.disconnectedAt = null;
    // Rotate token on reconnect for security
    if (newToken) {
      this.playerToken = newToken;
      this.tokenCreatedAt = new Date();
    }
  }

  /**
   * Check if the player has a valid token
   * @returns {boolean} True if token exists and is valid
   */
  hasValidToken() {
    return this.playerToken !== null &&
           this.playerToken !== undefined &&
           typeof this.playerToken === 'string' &&
           this.playerToken.length > 0;
  }

  /**
   * Check if the player token has expired
   * @returns {boolean} True if token is expired or invalid
   */
  isTokenExpired() {
    // No token or invalid token is considered expired
    if (!this.hasValidToken()) return true;
    if (!this.tokenCreatedAt) return true;
    return Date.now() - this.tokenCreatedAt.getTime() > TOKEN_EXPIRATION_MS;
  }

  isDisconnected() {
    return this.disconnectedAt !== null;
  }

  getDisconnectedDuration() {
    if (!this.disconnectedAt) return 0;
    return Date.now() - this.disconnectedAt.getTime();
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
