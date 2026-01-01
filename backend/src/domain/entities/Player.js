const { Nickname } = require('../value-objects/Nickname');
const { Score } = require('../value-objects/Score');

class Player {
  constructor({ id, socketId, nickname, roomPin, playerToken = null, score = 0, streak = 0, correctAnswers = 0, longestStreak = 0, joinedAt = new Date() }) {
    this.id = id;
    this.socketId = socketId;
    this._nickname = nickname instanceof Nickname ? nickname : new Nickname(nickname);
    this.roomPin = roomPin;
    this.playerToken = playerToken;
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

  reconnect(newSocketId) {
    this.socketId = newSocketId;
    this.disconnectedAt = null;
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
