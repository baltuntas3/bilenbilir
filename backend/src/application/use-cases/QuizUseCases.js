const { Quiz, Question } = require('../../domain/entities');
const { generateId } = require('../../shared/utils/generateId');
const { NotFoundError, ForbiddenError } = require('../../shared/errors');

class QuizUseCases {
  constructor(quizRepository) {
    this.quizRepository = quizRepository;
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
   * Get all quizzes by creator
   */
  async getQuizzesByCreator({ createdBy }) {
    const quizzes = await this.quizRepository.findByCreator(createdBy);
    return { quizzes };
  }

  /**
   * Get all public quizzes
   */
  async getPublicQuizzes() {
    const quizzes = await this.quizRepository.findPublic();
    return { quizzes };
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
   */
  async deleteQuiz({ quizId, requesterId }) {
    const quiz = await this._getQuizOrThrow(quizId);
    this._validateQuizOwnership(quiz, requesterId);

    await this.quizRepository.delete(quizId);
    return { success: true };
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
    const existingQuestion = quiz.questions[questionIndex];
    const updatedQuestion = new Question({
      id: questionId,
      text: questionData.text ?? existingQuestion.text,
      type: questionData.type ?? existingQuestion.type,
      options: questionData.options ?? existingQuestion.options,
      correctAnswerIndex: questionData.correctAnswerIndex ?? existingQuestion.correctAnswerIndex,
      timeLimit: questionData.timeLimit ?? existingQuestion.timeLimit,
      points: questionData.points ?? existingQuestion.points,
      imageUrl: questionData.imageUrl ?? existingQuestion.imageUrl
    });

    quiz.questions[questionIndex] = updatedQuestion;
    await this.quizRepository.save(quiz);

    return { quiz, question: updatedQuestion };
  }
}

module.exports = { QuizUseCases };
