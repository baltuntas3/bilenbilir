const QuestionType = {
  MULTIPLE_CHOICE: 'MULTIPLE_CHOICE',
  TRUE_FALSE: 'TRUE_FALSE'
};

class Question {
  constructor({ id, text, type = QuestionType.MULTIPLE_CHOICE, options, correctAnswerIndex, timeLimit = 30, points = 1000, imageUrl = null }) {
    this.id = id;
    this.text = text;
    this.type = type;
    this.options = options;
    this.correctAnswerIndex = correctAnswerIndex;
    this.timeLimit = timeLimit;
    this.points = points;
    this.imageUrl = imageUrl;

    this.validate();
  }

  validate() {
    if (!this.text || this.text.trim() === '') {
      throw new Error('Question text is required');
    }

    if (!this.options || this.options.length < 2) {
      throw new Error('At least 2 options required');
    }

    if (this.type === QuestionType.MULTIPLE_CHOICE && this.options.length > 4) {
      throw new Error('Maximum 4 options allowed');
    }

    if (this.correctAnswerIndex < 0 || this.correctAnswerIndex >= this.options.length) {
      throw new Error('Invalid correct answer index');
    }

    if (this.timeLimit < 5 || this.timeLimit > 120) {
      throw new Error('Time limit must be between 5 and 120 seconds');
    }
  }

  isCorrect(answerIndex) {
    return answerIndex === this.correctAnswerIndex;
  }

  calculateScore(answerIndex, elapsedTimeMs) {
    if (!this.isCorrect(answerIndex)) {
      return 0;
    }

    const totalTimeMs = this.timeLimit * 1000;
    const timeFactor = 1 - (elapsedTimeMs / totalTimeMs / 2);
    const score = Math.round(timeFactor * this.points);

    return Math.max(score, Math.round(this.points / 2));
  }

  getPublicData() {
    return {
      id: this.id,
      text: this.text,
      type: this.type,
      options: this.options,
      timeLimit: this.timeLimit,
      imageUrl: this.imageUrl
    };
  }
}

module.exports = { Question, QuestionType };
