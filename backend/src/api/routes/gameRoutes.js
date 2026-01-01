const express = require('express');
const { authenticate } = require('../middlewares/authMiddleware');
const { gameSessionRepository } = require('../../infrastructure/repositories');
const { NotFoundError } = require('../../shared/errors');

const router = express.Router();

/**
 * GET /api/games/history
 * Get current user's game history with pagination (as host)
 * Query params: page (default 1), limit (default 20, max 100)
 */
router.get('/history', authenticate, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));

    const result = await gameSessionRepository.findByHost(req.user.id, { page, limit });

    res.json({
      games: result.sessions.map(session => ({
        id: session.id,
        pin: session.pin,
        quiz: session.quiz ? {
          id: session.quiz.id,
          title: session.quiz.title
        } : null,
        playerCount: session.playerCount,
        playerResults: session.playerResults,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        status: session.status
      })),
      pagination: result.pagination
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/games/quiz/:quizId/history
 * Get game history for a specific quiz with pagination (owner only)
 * Query params: page (default 1), limit (default 20, max 100)
 * NOTE: This route MUST come before /:id to avoid "quiz" being matched as an id
 */
router.get('/quiz/:quizId/history', authenticate, async (req, res, next) => {
  try {
    const { quizId } = req.params;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));

    const result = await gameSessionRepository.findByQuiz(quizId, { page, limit });

    // Filter to only show sessions where user was the host
    const userSessions = result.sessions.filter(s =>
      s.hostId === req.user.id
    );

    res.json({
      games: userSessions.map(session => ({
        id: session.id,
        pin: session.pin,
        playerCount: session.playerCount,
        playerResults: session.playerResults,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        status: session.status
      })),
      pagination: result.pagination
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
    if (session.hostId !== req.user.id) {
      throw new NotFoundError('Game session not found');
    }

    res.json({
      id: session.id,
      pin: session.pin,
      quiz: session.quiz ? {
        id: session.quiz.id,
        title: session.quiz.title,
        description: session.quiz.description
      } : null,
      host: session.host ? {
        id: session.host.id,
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
 * DELETE /api/games/:id
 * Delete a specific game session (host only)
 */
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const session = await gameSessionRepository.findById(id);

    if (!session) {
      throw new NotFoundError('Game session not found');
    }

    // Only allow the host to delete the session
    if (session.hostId !== req.user.id) {
      throw new NotFoundError('Game session not found');
    }

    await gameSessionRepository.delete(id);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
