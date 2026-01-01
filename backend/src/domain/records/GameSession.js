const { ValidationError } = require('../../shared/errors');

/**
 * Player Result Value Object
 * Immutable record of final statistics for a player in a completed game
 */
class PlayerResult {
  constructor({
    nickname,
    rank,
    score = 0,
    correctAnswers = 0,
    wrongAnswers = 0,
    averageResponseTime = 0,
    longestStreak = 0
  }) {
    if (!nickname) {
      throw new ValidationError('Player nickname is required');
    }
    if (typeof rank !== 'number' || rank < 1) {
      throw new ValidationError('Valid rank is required');
    }

    this.nickname = nickname;
    this.rank = rank;
    this.score = Math.max(0, score);
    this.correctAnswers = Math.max(0, correctAnswers);
    this.wrongAnswers = Math.max(0, wrongAnswers);
    this.averageResponseTime = Math.max(0, averageResponseTime);
    this.longestStreak = Math.max(0, longestStreak);

    Object.freeze(this);
  }

  /**
   * Calculate accuracy percentage
   * @returns {number} Accuracy as percentage (0-100)
   */
  getAccuracy() {
    const total = this.correctAnswers + this.wrongAnswers;
    if (total === 0) return 0;
    return Math.round((this.correctAnswers / total) * 100);
  }
}

/**
 * Answer Record Value Object
 * Represents a single answer submission in a game
 */
class AnswerRecord {
  constructor({
    nickname,
    questionIndex,
    answerIndex,
    isCorrect,
    responseTimeMs,
    score = 0,
    streak = 0
  }) {
    if (!nickname) {
      throw new ValidationError('Nickname is required for answer record');
    }
    if (typeof questionIndex !== 'number' || questionIndex < 0) {
      throw new ValidationError('Valid question index is required');
    }
    if (typeof answerIndex !== 'number' || answerIndex < 0) {
      throw new ValidationError('Valid answer index is required');
    }

    this.nickname = nickname;
    this.questionIndex = questionIndex;
    this.answerIndex = answerIndex;
    this.isCorrect = Boolean(isCorrect);
    this.responseTimeMs = Math.max(0, responseTimeMs || 0);
    this.score = Math.max(0, score);
    this.streak = Math.max(0, streak);

    Object.freeze(this);
  }
}

/**
 * Game Session Status Enum
 */
const GameSessionStatus = {
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  ABANDONED: 'abandoned',
  ERROR: 'error',
  INTERRUPTED: 'interrupted'
};

/**
 * GameSession - Immutable Record (Read Model)
 *
 * NOT a traditional Entity - this is an immutable archive record of a completed game.
 * Once created, it never changes. It's stored in the database for historical purposes
 * and analytics.
 *
 * Design rationale:
 * - No mutation methods (only getters/calculations)
 * - Frozen after construction
 * - Used for reporting and game history viewing
 * - Persisted via GameSessionRepository
 */
class GameSession {
  static Status = GameSessionStatus;

  constructor({
    id,
    pin,
    quizId,
    hostId,
    playerCount = 0,
    playerResults = [],
    answers = [],
    startedAt,
    endedAt,
    status = GameSessionStatus.COMPLETED,
    createdAt = new Date(),
    // Fields for interrupted games
    interruptionReason = null,
    lastQuestionIndex = null,
    lastState = null,
    // Optional populated fields for display purposes
    quiz = null,
    host = null
  }) {
    if (!pin || !/^\d{6}$/.test(pin)) {
      throw new ValidationError('Valid 6-digit PIN is required');
    }
    if (!quizId) {
      throw new ValidationError('Quiz ID is required');
    }
    if (!hostId) {
      throw new ValidationError('Host ID is required');
    }
    if (!startedAt) {
      throw new ValidationError('Start time is required');
    }
    if (!endedAt) {
      throw new ValidationError('End time is required');
    }

    this.id = id;
    this.pin = pin;
    this.quizId = quizId;
    this.hostId = hostId;
    this.playerCount = Math.max(0, playerCount);
    this.playerResults = playerResults.map(pr =>
      pr instanceof PlayerResult ? pr : new PlayerResult(pr)
    );
    this.answers = answers.map(a =>
      a instanceof AnswerRecord ? a : new AnswerRecord(a)
    );
    this.startedAt = startedAt instanceof Date ? startedAt : new Date(startedAt);
    this.endedAt = endedAt instanceof Date ? endedAt : new Date(endedAt);
    this.status = Object.values(GameSessionStatus).includes(status)
      ? status
      : GameSessionStatus.COMPLETED;
    this.createdAt = createdAt;

    // Interrupted game metadata
    this.interruptionReason = interruptionReason;
    this.lastQuestionIndex = typeof lastQuestionIndex === 'number' ? lastQuestionIndex : null;
    this.lastState = lastState;

    // Optional populated fields (for display purposes in list/detail views)
    this.quiz = quiz ? { id: quiz.id, title: quiz.title, description: quiz.description } : null;
    this.host = host ? { id: host.id, username: host.username } : null;

    // Freeze to enforce immutability
    Object.freeze(this.playerResults);
    Object.freeze(this.answers);
    if (this.quiz) Object.freeze(this.quiz);
    if (this.host) Object.freeze(this.host);
    Object.freeze(this);
  }

  /**
   * Get game duration in seconds
   * @returns {number}
   */
  getDurationSeconds() {
    return Math.floor((this.endedAt.getTime() - this.startedAt.getTime()) / 1000);
  }

  /**
   * Get podium (top 3 players)
   * @returns {PlayerResult[]}
   */
  getPodium() {
    return this.playerResults
      .slice()
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 3);
  }

  /**
   * Get winner (rank 1 player)
   * @returns {PlayerResult|null}
   */
  getWinner() {
    return this.playerResults.find(p => p.rank === 1) || null;
  }

  /**
   * Get answers for a specific question
   * @param {number} questionIndex
   * @returns {AnswerRecord[]}
   */
  getAnswersForQuestion(questionIndex) {
    return this.answers.filter(a => a.questionIndex === questionIndex);
  }

  /**
   * Get all answers by a specific player
   * @param {string} nickname
   * @returns {AnswerRecord[]}
   */
  getAnswersByPlayer(nickname) {
    return this.answers.filter(a => a.nickname === nickname);
  }

  /**
   * Calculate overall accuracy for the game
   * @returns {number} Accuracy as percentage (0-100)
   */
  getOverallAccuracy() {
    if (this.answers.length === 0) return 0;
    const correct = this.answers.filter(a => a.isCorrect).length;
    return Math.round((correct / this.answers.length) * 100);
  }

  /**
   * Check if game was completed successfully
   * @returns {boolean}
   */
  isCompleted() {
    return this.status === GameSessionStatus.COMPLETED;
  }

  /**
   * Check if game was interrupted
   * @returns {boolean}
   */
  isInterrupted() {
    return this.status === GameSessionStatus.INTERRUPTED;
  }

  /**
   * Convert to summary JSON (for list views)
   * @returns {Object}
   */
  toSummaryJSON() {
    const summary = {
      id: this.id,
      pin: this.pin,
      playerCount: this.playerCount,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      durationSeconds: this.getDurationSeconds(),
      status: this.status,
      winner: this.getWinner()?.nickname || null
    };

    // Include interruption info if applicable
    if (this.isInterrupted()) {
      summary.interruptionReason = this.interruptionReason;
    }

    return summary;
  }

  /**
   * Convert to detailed JSON (for detail views)
   * @returns {Object}
   */
  toDetailedJSON() {
    const detail = {
      id: this.id,
      pin: this.pin,
      quizId: this.quizId,
      hostId: this.hostId,
      playerCount: this.playerCount,
      playerResults: this.playerResults,
      answers: this.answers,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      durationSeconds: this.getDurationSeconds(),
      status: this.status,
      overallAccuracy: this.getOverallAccuracy()
    };

    // Include interruption metadata if applicable
    if (this.isInterrupted()) {
      detail.interruptionReason = this.interruptionReason;
      detail.lastQuestionIndex = this.lastQuestionIndex;
      detail.lastState = this.lastState;
    }

    return detail;
  }
}

module.exports = { GameSession, GameSessionStatus, PlayerResult, AnswerRecord };
