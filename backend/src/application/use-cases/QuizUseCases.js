const { Quiz, Question } = require('../../domain/entities');
const { generateId } = require('../../shared/utils/generateId');
const { LockManager } = require('../../shared/utils/LockManager');
const { NotFoundError, ForbiddenError, ConflictError, ValidationError } = require('../../shared/errors');
const { LOCK_TIMEOUT_MS, MAX_OPTIONS, MIN_OPTIONS } = require('../../shared/config/constants');
const { decodeHTMLEntities } = require('../../shared/utils/decodeHTMLEntities');

// Current export format version
const EXPORT_VERSION = '1.0';

class QuizUseCases {
  constructor(quizRepository, roomRepository = null, gameSessionRepository = null, quizRatingRepository = null) {
    this.quizRepository = quizRepository;
    this.roomRepository = roomRepository;
    this.gameSessionRepository = gameSessionRepository;
    this.quizRatingRepository = quizRatingRepository;
    this.deleteLocks = new LockManager(LOCK_TIMEOUT_MS);
  }

  /**
   * Save quiz with automatic slug collision retry
   * @private
   */
  async _saveWithSlugRetry(quiz, title, maxRetries = 3) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.quizRepository.save(quiz);
      } catch (error) {
        const isSlugConflict = error.code === 11000 || (error.message && error.message.includes('duplicate'));
        if (!isSlugConflict || attempt === maxRetries) throw error;
        quiz.slug = Quiz.generateSlug(title);
      }
    }
  }

  /**
   * Get quiz by ID or throw NotFoundError
   * @private
   */
  async _getQuizOrThrow(quizId) {
    const quiz = await this.quizRepository.findById(quizId);
    if (!quiz) {
      throw new NotFoundError('Quiz not found');
    }
    return quiz;
  }

  /**
   * Validate that requester owns the quiz or throw ForbiddenError
   * @private
   */
  _validateQuizOwnership(quiz, requesterId) {
    if (quiz.createdBy !== requesterId) {
      throw new ForbiddenError('Not authorized to modify this quiz');
    }
  }

  /**
   * Create a new quiz
   */
  async createQuiz({ title, description, createdBy, isPublic = false, category, tags }) {
    const slug = Quiz.generateSlug(title);
    const quiz = new Quiz({
      id: generateId(),
      title,
      description,
      createdBy,
      isPublic,
      category,
      tags,
      slug
    });
    const savedQuiz = await this._saveWithSlugRetry(quiz, title);
    return { quiz: savedQuiz };
  }

  /**
   * Add question to quiz
   */
  async addQuestion({ quizId, questionData, requesterId }) {
    const quiz = await this._getQuizOrThrow(quizId);
    this._validateQuizOwnership(quiz, requesterId);

    const question = new Question({
      id: generateId(),
      ...questionData
    });
    quiz.addQuestion(question);
    const savedQuiz = await this.quizRepository.save(quiz);

    // Get the saved question (with MongoDB _id)
    const savedQuestion = savedQuiz.questions[savedQuiz.questions.length - 1];
    return { quiz: savedQuiz, question: savedQuestion };
  }

  /**
   * Remove question from quiz
   */
  async removeQuestion({ quizId, questionId, requesterId }) {
    const quiz = await this._getQuizOrThrow(quizId);
    this._validateQuizOwnership(quiz, requesterId);

    quiz.removeQuestion(questionId);
    const savedQuiz = await this.quizRepository.save(quiz);

    return { quiz: savedQuiz };
  }

  /**
   * Get quiz by ID
   * Private quizzes are only visible to their owner
   * Non-owners get quiz data without correctAnswerIndex
   */
  async getQuiz({ quizId, requesterId = null }) {
    const quiz = await this._getQuizOrThrow(quizId);

    // Private quizzes are only accessible by their owner
    if (!quiz.isPublic && quiz.createdBy !== requesterId) {
      throw new ForbiddenError('Not authorized to view this quiz');
    }

    // Non-owners get a sanitized copy without correct answers
    if (quiz.createdBy !== requesterId) {
      const sanitized = { ...quiz };
      sanitized.questions = quiz.questions.map(q => ({
        id: q.id,
        text: q.text,
        type: q.type,
        options: q.options,
        timeLimit: q.timeLimit,
        points: q.points,
        imageUrl: q.imageUrl,
        explanation: q.explanation
      }));
      return { quiz: sanitized };
    }

    return { quiz };
  }

  /**
   * Get quiz by slug (public access)
   */
  async getQuizBySlug({ slug }) {
    if (!slug || typeof slug !== 'string') {
      throw new ValidationError('Slug is required');
    }
    const quiz = await this.quizRepository.findBySlug(slug);
    if (!quiz) {
      throw new NotFoundError('Quiz not found');
    }
    if (!quiz.isPublic) {
      throw new ForbiddenError('Not authorized to view this quiz');
    }
    return { quiz };
  }

  /**
   * Get all quizzes by creator with pagination
   */
  async getQuizzesByCreator({ createdBy, page = 1, limit = 20 }) {
    const result = await this.quizRepository.findByCreator(createdBy, { page, limit });
    return result;
  }

  /**
   * Get all public quizzes with pagination, optionally filtered by category
   */
  async getPublicQuizzes({ page = 1, limit = 20, category } = {}) {
    const result = await this.quizRepository.findPublic({ page, limit, category });
    return result;
  }

  /**
   * Update quiz details
   */
  async updateQuiz({ quizId, title, description, isPublic, category, tags, requesterId }) {
    const quiz = await this._getQuizOrThrow(quizId);
    this._validateQuizOwnership(quiz, requesterId);

    if (title !== undefined) quiz.updateTitle(title);
    if (description !== undefined) quiz.updateDescription(description);
    if (isPublic !== undefined) quiz.setPublic(isPublic);
    if (category !== undefined) quiz.updateCategory(category);
    if (tags !== undefined) quiz.setTags(tags);

    const savedQuiz = await this.quizRepository.save(quiz);
    return { quiz: savedQuiz };
  }

  /**
   * Check if a quiz is currently in use in any active room
   * @private
   */
  async _throwIfQuizInUse(quizId) {
    if (!this.roomRepository) return;
    const room = await this.roomRepository.findByQuizId
      ? await this.roomRepository.findByQuizId(quizId)
      : (await this.roomRepository.getAll()).find(r => r.quizId === quizId);
    if (room) {
      throw new ConflictError('Cannot delete quiz while it is being used in an active game');
    }
  }

  /**
   * Delete quiz
   * Uses lock to prevent race condition between in-use check and deletion.
   * Deletes quiz first, then cascades to game sessions.
   */
  async deleteQuiz({ quizId, requesterId }) {
    const quiz = await this._getQuizOrThrow(quizId);
    this._validateQuizOwnership(quiz, requesterId);

    return this.deleteLocks.withLock(`quiz:${quizId}`, 'Quiz deletion in progress', async () => {
      await this._throwIfQuizInUse(quizId);

      // Delete quiz first to prevent new rooms from referencing it
      await this.quizRepository.delete(quizId);

      // Cascade delete: remove related game sessions
      let deletedSessionsCount = 0;
      if (this.gameSessionRepository) {
        try {
          deletedSessionsCount = await this.gameSessionRepository.deleteByQuiz(quizId);
        } catch (err) {
          console.error(`Failed to cascade-delete sessions for quiz ${quizId}:`, err.message);
        }
      }

      return { success: true, deletedSessionsCount };
    });
  }

  /**
   * Reorder questions in quiz
   */
  async reorderQuestions({ quizId, questionOrder, requesterId }) {
    const quiz = await this._getQuizOrThrow(quizId);
    this._validateQuizOwnership(quiz, requesterId);

    quiz.reorderQuestions(questionOrder);
    const savedQuiz = await this.quizRepository.save(quiz);

    return { quiz: savedQuiz };
  }

  /**
   * Get all questions for a quiz
   * Only quiz owner can see correct answers
   */
  async getQuestions({ quizId, requesterId }) {
    const quiz = await this._getQuizOrThrow(quizId);
    this._validateQuizOwnership(quiz, requesterId);
    return { questions: quiz.questions };
  }

  /**
   * Update a specific question in quiz
   */
  async updateQuestion({ quizId, questionId, questionData, requesterId }) {
    const quiz = await this._getQuizOrThrow(quizId);
    this._validateQuizOwnership(quiz, requesterId);

    const questionIndex = quiz.questions.findIndex(q => q.id === questionId);
    if (questionIndex === -1) {
      throw new NotFoundError('Question not found');
    }

    // Get existing question data and merge with updates
    // Use 'in' operator to allow falsy values (0, '', false) to be set explicitly
    const existingQuestion = quiz.questions[questionIndex];
    const updatedQuestion = new Question({
      id: questionId,
      text: 'text' in questionData ? questionData.text : existingQuestion.text,
      type: 'type' in questionData ? questionData.type : existingQuestion.type,
      options: 'options' in questionData ? questionData.options : existingQuestion.options,
      correctAnswerIndex: 'correctAnswerIndex' in questionData ? questionData.correctAnswerIndex : existingQuestion.correctAnswerIndex,
      timeLimit: 'timeLimit' in questionData ? questionData.timeLimit : existingQuestion.timeLimit,
      points: 'points' in questionData ? questionData.points : existingQuestion.points,
      imageUrl: 'imageUrl' in questionData ? questionData.imageUrl : existingQuestion.imageUrl,
      explanation: 'explanation' in questionData ? questionData.explanation : existingQuestion.explanation
    });

    quiz.questions[questionIndex] = updatedQuestion;
    const savedQuiz = await this.quizRepository.save(quiz);

    // Get the saved question (with MongoDB _id)
    const savedQuestion = savedQuiz.questions[questionIndex];
    return { quiz: savedQuiz, question: savedQuestion };
  }

  // ==================== TAGS & SEARCH METHODS ====================

  /**
   * Get popular tags from public quizzes
   * @param {number} limit - Max number of tags to return
   * @returns {Promise<{tag: string, count: number}[]>}
   */
  async getPopularTags(limit) {
    return this.quizRepository.getPopularTags(limit);
  }

  /**
   * Search public quizzes by title or description
   * @param {string} query - Search query
   * @param {Object} options - Pagination options
   * @returns {Promise<{quizzes: Quiz[], pagination: Object}>}
   */
  async searchPublicQuizzes(query, { page, limit } = {}) {
    return this.quizRepository.searchPublic(query, { page, limit });
  }

  // ==================== RATING METHODS ====================

  /**
   * Rate a quiz
   * @param {Object} params
   * @param {string} params.quizId - Quiz ID
   * @param {string} params.userId - User ID
   * @param {number} params.rating - Rating value (1-5)
   * @returns {Promise<{rating: number, isNew: boolean}>}
   */
  async rateQuiz({ quizId, userId, rating }) {
    // Verify quiz exists (_getQuizOrThrow throws NotFoundError if missing)
    await this._getQuizOrThrow(quizId);
    return this.quizRatingRepository.rate(quizId, userId, rating);
  }

  /**
   * Get quiz rating and optionally the user's own rating
   * @param {Object} params
   * @param {string} params.quizId - Quiz ID
   * @param {string|null} params.userId - User ID (null if unauthenticated)
   * @returns {Promise<{average: number, count: number, userRating: number|null}>}
   */
  async getQuizRating({ quizId, userId }) {
    const { average, count } = await this.quizRatingRepository.getAverageRating(quizId);

    let userRating = null;
    if (userId) {
      userRating = await this.quizRatingRepository.getUserRating(quizId, userId);
    }

    return { average, count, userRating };
  }

  // ==================== IMPORT/EXPORT METHODS ====================

  /**
   * Export quiz to JSON format
   * @param {string} quizId - Quiz ID to export
   * @param {string} requesterId - User ID requesting export
   */
  async exportQuiz({ quizId, requesterId }) {
    const quiz = await this._getQuizOrThrow(quizId);

    // Only owner can export private quizzes
    if (!quiz.isPublic && quiz.createdBy !== requesterId) {
      throw new ForbiddenError('Not authorized to export this quiz');
    }

    const exportData = {
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      quiz: {
        title: quiz.title,
        description: quiz.description || '',
        category: quiz.category || 'Diğer',
        tags: quiz.tags || [],
        questions: quiz.questions.map(q => ({
          text: q.text,
          type: q.type,
          options: q.options,
          correctAnswerIndex: q.correctAnswerIndex,
          timeLimit: q.timeLimit,
          points: q.points,
          imageUrl: q.imageUrl || null,
          explanation: q.explanation || ''
        }))
      }
    };

    return { exportData };
  }

  /**
   * Validate import data structure
   * @private
   */
  _validateImportData(jsonData) {
    if (!jsonData || typeof jsonData !== 'object') {
      throw new ValidationError('Invalid import data: must be an object');
    }

    if (!jsonData.version) {
      throw new ValidationError('Invalid import data: missing version');
    }

    if (jsonData.version !== EXPORT_VERSION) {
      throw new ValidationError(`Unsupported import version: ${jsonData.version}. Expected: ${EXPORT_VERSION}`);
    }

    if (!jsonData.quiz || typeof jsonData.quiz !== 'object') {
      throw new ValidationError('Invalid import data: missing quiz object');
    }

    const { quiz } = jsonData;

    if (!quiz.title || typeof quiz.title !== 'string') {
      throw new ValidationError('Invalid import data: quiz must have a title');
    }

    if (!Array.isArray(quiz.questions)) {
      throw new ValidationError('Invalid import data: questions must be an array');
    }

    if (quiz.questions.length === 0) {
      throw new ValidationError('Invalid import data: quiz must have at least one question');
    }

    if (quiz.questions.length > 50) {
      throw new ValidationError('Invalid import data: maximum 50 questions allowed');
    }

    // Validate each question
    quiz.questions.forEach((q, index) => {
      if (!q.text || typeof q.text !== 'string') {
        throw new ValidationError(`Invalid question at index ${index}: missing text`);
      }

      if (!Array.isArray(q.options) || q.options.length < MIN_OPTIONS || q.options.length > MAX_OPTIONS) {
        throw new ValidationError(`Invalid question at index ${index}: must have ${MIN_OPTIONS}-${MAX_OPTIONS} options`);
      }

      for (let i = 0; i < q.options.length; i++) {
        if (typeof q.options[i] !== 'string' || q.options[i].trim().length === 0) {
          throw new ValidationError(`Invalid question at index ${index}: option ${i} must be a non-empty string`);
        }
      }

      if (typeof q.correctAnswerIndex !== 'number' || q.correctAnswerIndex < 0 || q.correctAnswerIndex >= q.options.length) {
        throw new ValidationError(`Invalid question at index ${index}: invalid correctAnswerIndex`);
      }

      // Validate optional fields
      if (q.timeLimit !== undefined && (typeof q.timeLimit !== 'number' || q.timeLimit < 5 || q.timeLimit > 120)) {
        throw new ValidationError(`Invalid question at index ${index}: timeLimit must be between 5 and 120`);
      }

      if (q.points !== undefined && (typeof q.points !== 'number' || q.points < 100 || q.points > 10000)) {
        throw new ValidationError(`Invalid question at index ${index}: points must be between 100 and 10000`);
      }
    });

    return true;
  }

  /**
   * Import quiz from JSON format
   * @param {object} jsonData - The JSON data to import
   * @param {string} requesterId - User ID creating the quiz
   * @param {boolean} isPublic - Whether the imported quiz should be public
   */
  async importQuiz({ jsonData, requesterId, isPublic = false }) {
    // Validate import data structure
    this._validateImportData(jsonData);

    const { quiz: quizData } = jsonData;

    // Create new quiz (decode HTML entities in text fields)
    const quiz = new Quiz({
      id: generateId(),
      title: decodeHTMLEntities(quizData.title),
      description: decodeHTMLEntities(quizData.description || ''),
      createdBy: requesterId,
      isPublic,
      category: quizData.category,
      tags: quizData.tags
    });

    // Add questions (decode HTML entities in text and options)
    for (const qData of quizData.questions) {
      const question = new Question({
        id: generateId(),
        text: decodeHTMLEntities(qData.text),
        type: qData.type || 'MULTIPLE_CHOICE',
        options: qData.options.map(opt => decodeHTMLEntities(opt)),
        correctAnswerIndex: qData.correctAnswerIndex,
        timeLimit: qData.timeLimit || 30,
        points: qData.points || 1000,
        imageUrl: qData.imageUrl || null,
        explanation: decodeHTMLEntities(qData.explanation || '')
      });
      quiz.addQuestion(question);
    }

    // Generate slug and save with collision retry
    quiz.slug = Quiz.generateSlug(quizData.title);
    const savedQuiz = await this._saveWithSlugRetry(quiz, quizData.title);

    return { quiz: savedQuiz, questionCount: savedQuiz.questions.length };
  }
}

module.exports = { QuizUseCases };
