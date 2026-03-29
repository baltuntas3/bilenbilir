const { ValidationError } = require('../../shared/errors');
const { MAX_POINTS, MIN_POINTS, MAX_OPTIONS } = require('../../shared/config/constants');

const QuestionType = {
  MULTIPLE_CHOICE: 'MULTIPLE_CHOICE',
  TRUE_FALSE: 'TRUE_FALSE'
};

// Allowed protocols for image URLs
const ALLOWED_IMAGE_PROTOCOLS = ['http:', 'https:'];

// Valid question types
const VALID_QUESTION_TYPES = Object.values(QuestionType);

class Question {
  constructor({ id, text, type = QuestionType.MULTIPLE_CHOICE, options, correctAnswerIndex, timeLimit = 30, points = 1000, imageUrl = null, explanation = '' }) {
    this.id = id;
    this.text = text;
    // Validate and set type
    if (!VALID_QUESTION_TYPES.includes(type)) {
      throw new ValidationError(`Invalid question type: ${type}. Must be one of: ${VALID_QUESTION_TYPES.join(', ')}`);
    }
    this.type = type;
    this.options = options;
    this.correctAnswerIndex = correctAnswerIndex;
    this.timeLimit = timeLimit;
    this.points = points;
    this.imageUrl = this._sanitizeImageUrl(imageUrl);
    this.explanation = this._sanitizeExplanation(explanation);

    this.validate();
  }

  /**
   * Sanitize explanation text
   * @private
   */
  _sanitizeExplanation(explanation) {
    if (!explanation || typeof explanation !== 'string') {
      return '';
    }
    const trimmed = explanation.trim();
    if (trimmed.length > 500) {
      throw new ValidationError('Explanation cannot exceed 500 characters');
    }
    return trimmed;
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
        throw new ValidationError(`Invalid image URL protocol: ${parsed.protocol}`);
      }

      return trimmedUrl;
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new ValidationError('Invalid image URL format');
    }
  }

  validate() {
    if (!this.text || this.text.trim() === '') {
      throw new ValidationError('Question text is required');
    }

    if (!this.options || !Array.isArray(this.options) || this.options.length < 2) {
      throw new ValidationError('At least 2 options required');
    }

    // Validate each option is a non-empty string
    for (let i = 0; i < this.options.length; i++) {
      const option = this.options[i];
      if (typeof option !== 'string' || option.trim() === '') {
        throw new ValidationError(`Option ${i + 1} cannot be empty`);
      }
    }

    // TRUE_FALSE must have exactly 2 options
    if (this.type === QuestionType.TRUE_FALSE && this.options.length !== 2) {
      throw new ValidationError('TRUE_FALSE questions must have exactly 2 options');
    }

    if (this.type === QuestionType.MULTIPLE_CHOICE && this.options.length > MAX_OPTIONS) {
      throw new ValidationError(`Maximum ${MAX_OPTIONS} options allowed`);
    }

    if (typeof this.correctAnswerIndex !== 'number' || !Number.isInteger(this.correctAnswerIndex) ||
        this.correctAnswerIndex < 0 || this.correctAnswerIndex >= this.options.length) {
      throw new ValidationError('Invalid correct answer index');
    }

    if (this.timeLimit < 5 || this.timeLimit > 120) {
      throw new ValidationError('Time limit must be between 5 and 120 seconds');
    }

    // Validate points
    if (typeof this.points !== 'number' || this.points < MIN_POINTS || this.points > MAX_POINTS) {
      throw new ValidationError(`Points must be between ${MIN_POINTS} and ${MAX_POINTS}`);
    }
  }

  isCorrect(answerIndex) {
    // Validate answerIndex bounds
    if (typeof answerIndex !== 'number' || !Number.isInteger(answerIndex)) {
      return false;
    }
    if (answerIndex < 0 || answerIndex >= this.options.length) {
      return false;
    }
    return answerIndex === this.correctAnswerIndex;
  }

  calculateScore(answerIndex, elapsedTimeMs, effectiveTimeLimitMs = null) {
    if (!this.isCorrect(answerIndex)) {
      return 0;
    }

    // Use effective time limit if provided (accounts for TIME_EXTENSION / lightning round),
    // otherwise fall back to the question's own timeLimit.
    const totalTimeMs = effectiveTimeLimitMs || this.timeLimit * 1000;
    if (totalTimeMs <= 0) {
      return this.points; // Return full points if time limit is invalid
    }

    // timeFactor ranges from 1.0 (instant answer) to 0.5 (at time limit)
    // Clamp to [0, 1] to handle edge cases where elapsedTimeMs > totalTimeMs
    const rawTimeFactor = 1 - ((elapsedTimeMs / totalTimeMs) / 2);
    const timeFactor = Math.max(0, Math.min(1, rawTimeFactor));
    const score = Math.round(timeFactor * this.points);

    // Minimum score is 50% of points for correct answers
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
      imageUrl: this.imageUrl,
      explanation: this.explanation || ''
    };
  }

  /**
   * Create a deep clone of this question (immutable snapshot)
   *
   * Deep freeze implementation:
   * - Options array is cloned and frozen (array of primitive strings)
   * - All other properties are primitives (immutable by nature)
   * - The Question object itself is frozen
   *
   * This ensures the snapshot cannot be modified during gameplay
   */
  clone() {
    // Create a frozen copy of options array (strings are immutable primitives)
    const frozenOptions = Object.freeze([...this.options]);

    const clonedQuestion = new Question({
      id: this.id,
      text: this.text,
      type: this.type,
      options: frozenOptions,
      correctAnswerIndex: this.correctAnswerIndex,
      timeLimit: this.timeLimit,
      points: this.points,
      imageUrl: this.imageUrl,
      explanation: this.explanation
    });

    // Freeze the question object to prevent modifications
    return Object.freeze(clonedQuestion);
  }
}

module.exports = { Question, QuestionType };
