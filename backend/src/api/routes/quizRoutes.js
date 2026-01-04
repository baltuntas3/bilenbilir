const express = require('express');
const { QuizUseCases } = require('../../application/use-cases');
const { mongoQuizRepository } = require('../../infrastructure/repositories/MongoQuizRepository');
const { authenticate, optionalAuthenticate } = require('../middlewares/authMiddleware');
const { ForbiddenError } = require('../../shared/errors');
const { quizCreationLimiter } = require('../middlewares/rateLimiter');
const { ValidationError } = require('../../shared/errors');

const router = express.Router();
const quizUseCases = new QuizUseCases(mongoQuizRepository);

/**
 * POST /api/quizzes
 * Create a new quiz (requires auth)
 */
router.post('/', authenticate, quizCreationLimiter, async (req, res, next) => {
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
 * Get all public quizzes with pagination
 * Query params: page (default 1), limit (default 20, max 100)
 */
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));

    const result = await quizUseCases.getPublicQuizzes({ page, limit });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/quizzes/search
 * Search public quizzes by title or description
 * Query params: q (required), page (default 1), limit (default 20, max 100)
 */
router.get('/search', async (req, res, next) => {
  try {
    const { q } = req.query;

    if (!q || q.trim().length < 2) {
      throw new ValidationError('Search query must be at least 2 characters');
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));

    const result = await mongoQuizRepository.searchPublic(q.trim(), { page, limit });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/quizzes/my
 * Get current user's quizzes with pagination (requires auth)
 * Query params: page (default 1), limit (default 20, max 100)
 */
router.get('/my', authenticate, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));

    const result = await quizUseCases.getQuizzesByCreator({
      createdBy: req.user.id,
      page,
      limit
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/quizzes/:id
 * Get quiz by ID
 * Public quizzes are accessible to everyone
 * Private quizzes are only accessible to their owner
 */
router.get('/:id', optionalAuthenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await quizUseCases.getQuiz({ quizId: id });
    const quiz = result.quiz;

    // Check access for private quizzes
    if (!quiz.isPublic) {
      if (!req.user || req.user.id !== quiz.createdBy) {
        throw new ForbiddenError('Access denied to private quiz');
      }
    }

    res.json(quiz);
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
 * Public quizzes: questions accessible to everyone
 * Private quizzes: questions only accessible to owner
 */
router.get('/:id/questions', optionalAuthenticate, async (req, res, next) => {
  try {
    const { id } = req.params;

    // First check quiz access
    const quizResult = await quizUseCases.getQuiz({ quizId: id });
    const quiz = quizResult.quiz;

    if (!quiz.isPublic) {
      if (!req.user || req.user.id !== quiz.createdBy) {
        throw new ForbiddenError('Access denied to private quiz');
      }
    }

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
 * PUT /api/quizzes/:id/questions/reorder
 * Reorder questions in quiz (requires auth + ownership)
 * NOTE: This route MUST come before /:id/questions/:questionId to avoid "reorder" being matched as questionId
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

// ==================== IMPORT/EXPORT ENDPOINTS ====================

/**
 * GET /api/quizzes/:id/export
 * Export quiz to JSON format
 * Public quizzes: accessible to everyone
 * Private quizzes: owner only
 */
router.get('/:id/export', optionalAuthenticate, async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await quizUseCases.exportQuiz({
      quizId: id,
      requesterId: req.user?.id || null
    });

    // Set headers for file download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="quiz-${id}.json"`);

    res.json(result.exportData);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/quizzes/import
 * Import quiz from JSON format (requires auth)
 * Body: { data: {...}, isPublic?: boolean }
 */
router.post('/import', authenticate, quizCreationLimiter, async (req, res, next) => {
  try {
    const { data, isPublic } = req.body;

    if (!data) {
      throw new ValidationError('Import data is required');
    }

    const result = await quizUseCases.importQuiz({
      jsonData: data,
      requesterId: req.user.id,
      isPublic: isPublic || false
    });

    res.status(201).json({
      quiz: result.quiz,
      questionCount: result.questionCount,
      message: `Quiz imported successfully with ${result.questionCount} questions`
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
