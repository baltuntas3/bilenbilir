const { ValidationError, NotFoundError } = require('../../shared/errors');

const MAX_QUESTIONS = 50;

class Quiz {
  static MAX_QUESTIONS = MAX_QUESTIONS;

  constructor({ id, title, description = '', createdBy, questions = [], isPublic = false, playCount = 0, createdAt = new Date() }) {
    if (!id) {
      throw new ValidationError('Quiz id is required');
    }
    if (!title || !title.trim()) {
      throw new ValidationError('Quiz title is required');
    }
    if (!createdBy) {
      throw new ValidationError('Quiz createdBy is required');
    }

    this.id = id;
    this.title = title.trim();
    this.description = description || '';
    this.createdBy = createdBy;
    this.questions = Array.isArray(questions) ? questions : [];
    this.isPublic = Boolean(isPublic);
    this.playCount = Math.max(0, playCount || 0);
    this.createdAt = createdAt;

    if (this.questions.length > MAX_QUESTIONS) {
      throw new ValidationError(`Quiz cannot have more than ${MAX_QUESTIONS} questions`);
    }
  }

  updateTitle(newTitle) {
    if (!newTitle || !newTitle.trim()) {
      throw new ValidationError('Quiz title is required');
    }
    this.title = newTitle.trim();
  }

  updateDescription(newDescription) {
    this.description = newDescription || '';
  }

  setPublic(isPublic) {
    this.isPublic = Boolean(isPublic);
  }

  addQuestion(question) {
    if (this.questions.length >= MAX_QUESTIONS) {
      throw new ValidationError(`Quiz cannot have more than ${MAX_QUESTIONS} questions`);
    }
    this.questions.push(question);
  }

  removeQuestion(questionId) {
    this.questions = this.questions.filter(q => q.id !== questionId);
  }

  /**
   * Get question by index (returns null if not found)
   * @param {number} index - Question index
   * @returns {Question|null}
   */
  getQuestion(index) {
    if (typeof index !== 'number' || index < 0 || index >= this.questions.length) {
      return null;
    }
    return this.questions[index];
  }

  /**
   * Get question by index or throw error if not found
   * Use this when question must exist (e.g., during game)
   * @param {number} index - Question index
   * @returns {Question}
   * @throws {Error} If question not found
   */
  getQuestionOrThrow(index) {
    const question = this.getQuestion(index);
    if (!question) {
      throw new NotFoundError(`Question at index ${index} not found`);
    }
    return question;
  }

  getTotalQuestions() {
    return this.questions.length;
  }

  reorderQuestions(newOrder) {
    const reordered = newOrder.map(id => this.questions.find(q => q.id === id));
    if (reordered.some(q => !q)) {
      throw new ValidationError('Invalid question order');
    }
    this.questions = reordered;
  }

  /**
   * Create a deep clone of this quiz (immutable snapshot for game sessions)
   * This prevents mid-game modifications from affecting ongoing games
   *
   * Deep freeze implementation:
   * - Each Question is frozen by Question.clone()
   * - Each Question's options array is frozen by Question.clone()
   * - The questions array is frozen here
   * - Date objects are cloned to prevent shared reference mutation
   * - The Quiz object itself is frozen
   *
   * Note: Object.freeze is shallow, but we freeze at each level explicitly
   */
  clone() {
    // Clone and freeze all questions (Question.clone() returns frozen questions)
    const frozenQuestions = Object.freeze(
      this.questions.map(q => q.clone())
    );

    // Clone Date to prevent shared reference mutation
    const clonedCreatedAt = this.createdAt instanceof Date
      ? new Date(this.createdAt.getTime())
      : this.createdAt;

    const clonedQuiz = new Quiz({
      id: this.id,
      title: this.title,
      description: this.description,
      createdBy: this.createdBy,
      questions: frozenQuestions,
      isPublic: this.isPublic,
      playCount: this.playCount,
      createdAt: clonedCreatedAt
    });

    // Freeze the quiz object to prevent modifications
    return Object.freeze(clonedQuiz);
  }
}

module.exports = { Quiz };
