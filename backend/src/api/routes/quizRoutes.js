const express = require('express');
const { QuizUseCases } = require('../../application/use-cases');
const { mongoQuizRepository } = require('../../infrastructure/repositories/MongoQuizRepository');
const { authenticate } = require('../middlewares/authMiddleware');
const { ValidationError } = require('../../shared/errors');

const router = express.Router();
const quizUseCases = new QuizUseCases(mongoQuizRepository);

/**
 * POST /api/quizzes
 * Create a new quiz (requires auth)
 */
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { title, description, isPublic } = req.body;

    if (!title) {
      throw new ValidationError('Title is required');
    }

    const result = await quizUseCases.createQuiz({
      title,
      description,
      createdBy: req.user.id,
      isPublic
    });

    res.status(201).json(result.quiz);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/quizzes
 * Get all public quizzes
 */
router.get('/', async (req, res, next) => {
  try {
    const result = await quizUseCases.getPublicQuizzes();
    res.json(result.quizzes);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/quizzes/my
 * Get current user's quizzes (requires auth)
 */
router.get('/my', authenticate, async (req, res, next) => {
  try {
    const result = await quizUseCases.getQuizzesByCreator({ createdBy: req.user.id });
    res.json(result.quizzes);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/quizzes/:id
 * Get quiz by ID
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await quizUseCases.getQuiz({ quizId: id });
    res.json(result.quiz);
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/quizzes/:id
 * Update quiz (requires auth + ownership)
 */
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, description, isPublic } = req.body;

    const result = await quizUseCases.updateQuiz({
      quizId: id,
      title,
      description,
      isPublic,
      requesterId: req.user.id
    });

    res.json(result.quiz);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/quizzes/:id
 * Delete quiz (requires auth + ownership)
 */
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    await quizUseCases.deleteQuiz({
      quizId: id,
      requesterId: req.user.id
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/quizzes/:id/questions
 * Get all questions for a quiz
 */
router.get('/:id/questions', async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await quizUseCases.getQuestions({ quizId: id });
    res.json(result.questions);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/quizzes/:id/questions
 * Add question to quiz (requires auth + ownership)
 */
router.post('/:id/questions', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const questionData = req.body;

    if (!questionData.text || !questionData.options || questionData.correctAnswerIndex === undefined) {
      throw new ValidationError('text, options, and correctAnswerIndex are required');
    }

    const result = await quizUseCases.addQuestion({
      quizId: id,
      questionData,
      requesterId: req.user.id
    });

    res.status(201).json(result.question);
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/quizzes/:id/questions/:questionId
 * Update a specific question (requires auth + ownership)
 */
router.put('/:id/questions/:questionId', authenticate, async (req, res, next) => {
  try {
    const { id, questionId } = req.params;
    const questionData = req.body;

    const result = await quizUseCases.updateQuestion({
      quizId: id,
      questionId,
      questionData,
      requesterId: req.user.id
    });

    res.json(result.question);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/quizzes/:id/questions/:questionId
 * Remove question from quiz (requires auth + ownership)
 */
router.delete('/:id/questions/:questionId', authenticate, async (req, res, next) => {
  try {
    const { id, questionId } = req.params;

    await quizUseCases.removeQuestion({
      quizId: id,
      questionId,
      requesterId: req.user.id
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/quizzes/:id/questions/reorder
 * Reorder questions in quiz (requires auth + ownership)
 */
router.put('/:id/questions/reorder', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { questionOrder } = req.body;

    if (!Array.isArray(questionOrder)) {
      throw new ValidationError('questionOrder must be an array');
    }

    const result = await quizUseCases.reorderQuestions({
      quizId: id,
      questionOrder,
      requesterId: req.user.id
    });

    res.json(result.quiz);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
