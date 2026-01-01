const express = require('express');
const { QuizUseCases } = require('../../application/use-cases');
const { mongoQuizRepository } = require('../../infrastructure/repositories/MongoQuizRepository');
const { authenticate } = require('../middlewares/authMiddleware');

const router = express.Router();
const quizUseCases = new QuizUseCases(mongoQuizRepository);

/**
 * POST /api/quizzes
 * Create a new quiz (requires auth)
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const { title, description, isPublic } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const result = await quizUseCases.createQuiz({
      title,
      description,
      createdBy: req.user.id,
      isPublic
    });

    res.status(201).json(result.quiz);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/quizzes
 * Get all public quizzes
 */
router.get('/', async (req, res) => {
  try {
    const result = await quizUseCases.getPublicQuizzes();
    res.json(result.quizzes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/quizzes/my
 * Get current user's quizzes (requires auth)
 */
router.get('/my', authenticate, async (req, res) => {
  try {
    const result = await quizUseCases.getQuizzesByCreator({ createdBy: req.user.id });
    res.json(result.quizzes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/quizzes/:id
 * Get quiz by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await quizUseCases.getQuiz({ quizId: id });
    res.json(result.quiz);
  } catch (error) {
    if (error.message === 'Quiz not found') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/quizzes/:id
 * Update quiz (requires auth + ownership)
 */
router.put('/:id', authenticate, async (req, res) => {
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
    if (error.message === 'Quiz not found') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message === 'Not authorized to modify this quiz') {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/quizzes/:id
 * Delete quiz (requires auth + ownership)
 */
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    await quizUseCases.deleteQuiz({
      quizId: id,
      requesterId: req.user.id
    });
    res.status(204).send();
  } catch (error) {
    if (error.message === 'Quiz not found') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message === 'Not authorized to delete this quiz') {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/quizzes/:id/questions
 * Add question to quiz (requires auth + ownership)
 */
router.post('/:id/questions', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const questionData = req.body;

    if (!questionData.text || !questionData.options || questionData.correctAnswerIndex === undefined) {
      return res.status(400).json({ error: 'text, options, and correctAnswerIndex are required' });
    }

    const result = await quizUseCases.addQuestion({
      quizId: id,
      questionData,
      requesterId: req.user.id
    });

    res.status(201).json(result.question);
  } catch (error) {
    if (error.message === 'Quiz not found') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message === 'Not authorized to modify this quiz') {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/quizzes/:id/questions/:questionId
 * Remove question from quiz (requires auth + ownership)
 */
router.delete('/:id/questions/:questionId', authenticate, async (req, res) => {
  try {
    const { id, questionId } = req.params;

    await quizUseCases.removeQuestion({
      quizId: id,
      questionId,
      requesterId: req.user.id
    });

    res.status(204).send();
  } catch (error) {
    if (error.message === 'Quiz not found') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message === 'Not authorized to modify this quiz') {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/quizzes/:id/questions/reorder
 * Reorder questions in quiz (requires auth + ownership)
 */
router.put('/:id/questions/reorder', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { questionOrder } = req.body;

    if (!Array.isArray(questionOrder)) {
      return res.status(400).json({ error: 'questionOrder must be an array' });
    }

    const result = await quizUseCases.reorderQuestions({
      quizId: id,
      questionOrder,
      requesterId: req.user.id
    });

    res.json(result.quiz);
  } catch (error) {
    if (error.message === 'Quiz not found') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message === 'Not authorized to modify this quiz') {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
