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
   * Check if the player token has expired
   * @returns {boolean} True if token is expired
   */
  isTokenExpired() {
    if (!this.tokenCreatedAt) return false;
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
