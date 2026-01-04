const { Quiz, Question } = require('../../domain/entities');
const { generateId } = require('../../shared/utils/generateId');
const { NotFoundError, ForbiddenError, ConflictError, ValidationError } = require('../../shared/errors');

// Current export format version
const EXPORT_VERSION = '1.0';

class QuizUseCases {
  constructor(quizRepository, roomRepository = null, gameSessionRepository = null) {
    this.quizRepository = quizRepository;
    this.roomRepository = roomRepository;
    this.gameSessionRepository = gameSessionRepository;
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
  async createQuiz({ title, description, createdBy, isPublic = false }) {
    const quiz = new Quiz({
      id: generateId(),
      title,
      description,
      createdBy,
      isPublic
    });
    const savedQuiz = await this.quizRepository.save(quiz);
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
   */
  async getQuiz({ quizId }) {
    const quiz = await this._getQuizOrThrow(quizId);
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
   * Get all public quizzes with pagination
   */
  async getPublicQuizzes({ page = 1, limit = 20 } = {}) {
    const result = await this.quizRepository.findPublic({ page, limit });
    return result;
  }

  /**
   * Update quiz details
   */
  async updateQuiz({ quizId, title, description, isPublic, requesterId }) {
    const quiz = await this._getQuizOrThrow(quizId);
    this._validateQuizOwnership(quiz, requesterId);

    if (title !== undefined) quiz.updateTitle(title);
    if (description !== undefined) quiz.updateDescription(description);
    if (isPublic !== undefined) quiz.setPublic(isPublic);

    const savedQuiz = await this.quizRepository.save(quiz);
    return { quiz: savedQuiz };
  }

  /**
   * Delete quiz
   * Checks for active games using this quiz before deletion
   * Also deletes related game sessions (cascade delete)
   */
  async deleteQuiz({ quizId, requesterId }) {
    const quiz = await this._getQuizOrThrow(quizId);
    this._validateQuizOwnership(quiz, requesterId);

    // Check for active games using this quiz
    if (this.roomRepository) {
      const rooms = await this.roomRepository.getAll();
      const activeGame = rooms.find(room => room.quizId === quizId);
      if (activeGame) {
        throw new ConflictError('Cannot delete quiz while it is being used in an active game');
      }
    }

    // Cascade delete: remove all game sessions for this quiz
    let deletedSessionsCount = 0;
    if (this.gameSessionRepository) {
      deletedSessionsCount = await this.gameSessionRepository.deleteByQuiz(quizId);
    }

    await this.quizRepository.delete(quizId);
    return { success: true, deletedSessionsCount };
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
   */
  async getQuestions({ quizId }) {
    const quiz = await this._getQuizOrThrow(quizId);
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
      imageUrl: 'imageUrl' in questionData ? questionData.imageUrl : existingQuestion.imageUrl
    });

    quiz.questions[questionIndex] = updatedQuestion;
    const savedQuiz = await this.quizRepository.save(quiz);

    // Get the saved question (with MongoDB _id)
    const savedQuestion = savedQuiz.questions[questionIndex];
    return { quiz: savedQuiz, question: savedQuestion };
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
        questions: quiz.questions.map(q => ({
          text: q.text,
          type: q.type,
          options: q.options,
          correctAnswerIndex: q.correctAnswerIndex,
          timeLimit: q.timeLimit,
          points: q.points,
          imageUrl: q.imageUrl || null
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

    if (quiz.questions.length > 50) {
      throw new ValidationError('Invalid import data: maximum 50 questions allowed');
    }

    // Validate each question
    quiz.questions.forEach((q, index) => {
      if (!q.text || typeof q.text !== 'string') {
        throw new ValidationError(`Invalid question at index ${index}: missing text`);
      }

      if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 4) {
        throw new ValidationError(`Invalid question at index ${index}: must have 2-4 options`);
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

    // Create new quiz
    const quiz = new Quiz({
      id: generateId(),
      title: quizData.title,
      description: quizData.description || '',
      createdBy: requesterId,
      isPublic
    });

    // Add questions
    for (const qData of quizData.questions) {
      const question = new Question({
        id: generateId(),
        text: qData.text,
        type: qData.type || 'MULTIPLE_CHOICE',
        options: qData.options,
        correctAnswerIndex: qData.correctAnswerIndex,
        timeLimit: qData.timeLimit || 30,
        points: qData.points || 1000,
        imageUrl: qData.imageUrl || null
      });
      quiz.addQuestion(question);
    }

    const savedQuiz = await this.quizRepository.save(quiz);

    return { quiz: savedQuiz, questionCount: savedQuiz.questions.length };
  }
}

module.exports = { QuizUseCases };
