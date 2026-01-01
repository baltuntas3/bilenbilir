const { Quiz, Question } = require('../../domain/entities');
const { generateId } = require('../../shared/utils/generateId');

class QuizUseCases {
  constructor(quizRepository) {
    this.quizRepository = quizRepository;
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
    const quiz = await this.quizRepository.findById(quizId);
    if (!quiz) {
      throw new Error('Quiz not found');
    }

    if (quiz.createdBy !== requesterId) {
      throw new Error('Not authorized to modify this quiz');
    }

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
    const quiz = await this.quizRepository.findById(quizId);
    if (!quiz) {
      throw new Error('Quiz not found');
    }

    if (quiz.createdBy !== requesterId) {
      throw new Error('Not authorized to modify this quiz');
    }

    quiz.removeQuestion(questionId);

    await this.quizRepository.save(quiz);

    return { quiz };
  }

  /**
   * Get quiz by ID
   */
  async getQuiz({ quizId }) {
    const quiz = await this.quizRepository.findById(quizId);
    if (!quiz) {
      throw new Error('Quiz not found');
    }

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
    const quiz = await this.quizRepository.findById(quizId);
    if (!quiz) {
      throw new Error('Quiz not found');
    }

    if (quiz.createdBy !== requesterId) {
      throw new Error('Not authorized to modify this quiz');
    }

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
    const quiz = await this.quizRepository.findById(quizId);
    if (!quiz) {
      throw new Error('Quiz not found');
    }

    if (quiz.createdBy !== requesterId) {
      throw new Error('Not authorized to delete this quiz');
    }

    await this.quizRepository.delete(quizId);

    return { success: true };
  }

  /**
   * Reorder questions in quiz
   */
  async reorderQuestions({ quizId, questionOrder, requesterId }) {
    const quiz = await this.quizRepository.findById(quizId);
    if (!quiz) {
      throw new Error('Quiz not found');
    }

    if (quiz.createdBy !== requesterId) {
      throw new Error('Not authorized to modify this quiz');
    }

    quiz.reorderQuestions(questionOrder);

    await this.quizRepository.save(quiz);

    return { quiz };
  }
}

module.exports = { QuizUseCases };
