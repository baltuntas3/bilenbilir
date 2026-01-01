const QuestionType = {
  MULTIPLE_CHOICE: 'MULTIPLE_CHOICE',
  TRUE_FALSE: 'TRUE_FALSE'
};

// Allowed protocols for image URLs
const ALLOWED_IMAGE_PROTOCOLS = ['http:', 'https:'];
// Maximum points per question
const MAX_POINTS = 10000;
const MIN_POINTS = 100;

class Question {
  constructor({ id, text, type = QuestionType.MULTIPLE_CHOICE, options, correctAnswerIndex, timeLimit = 30, points = 1000, imageUrl = null }) {
    this.id = id;
    this.text = text;
    this.type = type;
    this.options = options;
    this.correctAnswerIndex = correctAnswerIndex;
    this.timeLimit = timeLimit;
    this.points = points;
    this.imageUrl = this._sanitizeImageUrl(imageUrl);

    this.validate();
  }

  /**
   * Sanitize and validate image URL
   * @private
   */
  _sanitizeImageUrl(url) {
    if (!url || url.trim() === '') {
      return null;
    }

    const trimmedUrl = url.trim();

    try {
      const parsed = new URL(trimmedUrl);

      // Only allow http and https protocols (block javascript:, data:, etc.)
      if (!ALLOWED_IMAGE_PROTOCOLS.includes(parsed.protocol)) {
        throw new Error(`Invalid image URL protocol: ${parsed.protocol}`);
      }

      return trimmedUrl;
    } catch (error) {
      if (error.message.includes('Invalid image URL protocol')) {
        throw error;
      }
      throw new Error('Invalid image URL format');
    }
  }

  validate() {
    if (!this.text || this.text.trim() === '') {
      throw new Error('Question text is required');
    }

    if (!this.options || this.options.length < 2) {
      throw new Error('At least 2 options required');
    }

    // TRUE_FALSE must have exactly 2 options
    if (this.type === QuestionType.TRUE_FALSE && this.options.length !== 2) {
      throw new Error('TRUE_FALSE questions must have exactly 2 options');
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

    // Validate points
    if (typeof this.points !== 'number' || this.points < MIN_POINTS || this.points > MAX_POINTS) {
      throw new Error(`Points must be between ${MIN_POINTS} and ${MAX_POINTS}`);
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

  /**
   * Get question data for host (includes correct answer)
   */
  getHostData() {
    return {
      id: this.id,
      text: this.text,
      type: this.type,
      options: this.options,
      correctAnswerIndex: this.correctAnswerIndex,
      timeLimit: this.timeLimit,
      points: this.points,
      imageUrl: this.imageUrl
    };
  }

  /**
   * Create a deep clone of this question (immutable snapshot)
   */
  clone() {
    return new Question({
      id: this.id,
      text: this.text,
      type: this.type,
      options: [...this.options],
      correctAnswerIndex: this.correctAnswerIndex,
      timeLimit: this.timeLimit,
      points: this.points,
      imageUrl: this.imageUrl
    });
  }
}

module.exports = { Question, QuestionType };
