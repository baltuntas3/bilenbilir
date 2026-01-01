const express = require('express');
const { authenticate } = require('../middlewares/authMiddleware');
const { gameSessionRepository } = require('../../infrastructure/repositories');
const { NotFoundError } = require('../../shared/errors');

const router = express.Router();

/**
 * GET /api/games/history
 * Get current user's game history (as host)
 */
router.get('/history', authenticate, async (req, res, next) => {
  try {
    const sessions = await gameSessionRepository.findByHost(req.user.id);

    res.json({
      games: sessions.map(session => ({
        id: session._id,
        pin: session.pin,
        quiz: session.quiz ? {
          id: session.quiz._id,
          title: session.quiz.title
        } : null,
        playerCount: session.playerCount,
        playerResults: session.playerResults,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        status: session.status
      }))
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/games/:id
 * Get a specific game session details
 */
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const session = await gameSessionRepository.findById(id);

    if (!session) {
      throw new NotFoundError('Game session not found');
    }

    // Only allow the host to view the session
    if (session.host._id.toString() !== req.user.id) {
      throw new NotFoundError('Game session not found');
    }

    res.json({
      id: session._id,
      pin: session.pin,
      quiz: session.quiz ? {
        id: session.quiz._id,
        title: session.quiz.title,
        description: session.quiz.description
      } : null,
      host: session.host ? {
        id: session.host._id,
        username: session.host.username
      } : null,
      playerCount: session.playerCount,
      playerResults: session.playerResults,
      answers: session.answers,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      status: session.status
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/games/quiz/:quizId/history
 * Get game history for a specific quiz (owner only)
 */
router.get('/quiz/:quizId/history', authenticate, async (req, res, next) => {
  try {
    const { quizId } = req.params;
    const sessions = await gameSessionRepository.findByQuiz(quizId);

    // Filter to only show sessions where user was the host
    const userSessions = sessions.filter(s =>
      s.host && s.host.toString() === req.user.id
    );

    res.json({
      games: userSessions.map(session => ({
        id: session._id,
        pin: session.pin,
        playerCount: session.playerCount,
        playerResults: session.playerResults,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        status: session.status
      }))
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
