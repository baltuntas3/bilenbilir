const { Quiz, Question } = require('../../domain/entities');
const { generateId } = require('../../shared/utils/generateId');
const { NotFoundError, ForbiddenError, ConflictError } = require('../../shared/errors');

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
    await this.quizRepository.save(quiz);
    return { quiz };
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
    await this.quizRepository.save(quiz);

    return { quiz, question };
  }

  /**
   * Remove question from quiz
   */
  async removeQuestion({ quizId, questionId, requesterId }) {
    const quiz = await this._getQuizOrThrow(quizId);
    this._validateQuizOwnership(quiz, requesterId);

    quiz.removeQuestion(questionId);
    await this.quizRepository.save(quiz);

    return { quiz };
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

    await this.quizRepository.save(quiz);
    return { quiz };
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
    await this.quizRepository.save(quiz);

    return { quiz };
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
    await this.quizRepository.save(quiz);

    return { quiz, question: updatedQuestion };
  }
}

module.exports = { QuizUseCases };
