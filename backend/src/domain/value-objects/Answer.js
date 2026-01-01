const MAX_STREAK_BONUS = 500;

class Answer {
  constructor({ playerId, questionId, roomPin, answerIndex, isCorrect, elapsedTimeMs, score = 0, streakBonus = 0, submittedAt = new Date() }) {
    this.playerId = playerId;
    this.questionId = questionId;
    this.roomPin = roomPin;
    this.answerIndex = answerIndex;
    this.isCorrect = isCorrect;
    this.elapsedTimeMs = elapsedTimeMs;
    this.score = score;
    this.streakBonus = streakBonus;
    this.submittedAt = submittedAt;

    Object.freeze(this);
  }

  getTotalScore() {
    return this.score + this.streakBonus;
  }

  equals(other) {
    if (!(other instanceof Answer)) return false;
    return (
      this.playerId === other.playerId &&
      this.questionId === other.questionId &&
      this.answerIndex === other.answerIndex
    );
  }

  static create({ playerId, questionId, roomPin, answerIndex, question, elapsedTimeMs, currentStreak }) {
    // Validate question is provided
    if (!question || typeof question.isCorrect !== 'function') {
      throw new Error('Valid question is required to create Answer');
    }

    // Validate elapsedTimeMs
    if (typeof elapsedTimeMs !== 'number' || !Number.isFinite(elapsedTimeMs) || elapsedTimeMs < 0) {
      throw new Error('elapsedTimeMs must be a non-negative number');
    }

    // Validate and sanitize currentStreak
    const safeStreak = (typeof currentStreak === 'number' && Number.isFinite(currentStreak) && currentStreak >= 0)
      ? Math.floor(currentStreak)
      : 0;

    const isCorrect = question.isCorrect(answerIndex);
    const baseScore = question.calculateScore(answerIndex, elapsedTimeMs);

    let streakBonus = 0;
    if (isCorrect && safeStreak > 0) {
      streakBonus = Math.min(safeStreak * 100, MAX_STREAK_BONUS);
    }

    return new Answer({
      playerId,
      questionId,
      roomPin,
      answerIndex,
      isCorrect,
      elapsedTimeMs,
      score: baseScore,
      streakBonus
    });
  }
}

module.exports = { Answer };
