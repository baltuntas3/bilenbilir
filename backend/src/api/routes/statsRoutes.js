const express = require('express');
const { authenticate } = require('../middlewares/authMiddleware');
const { GameStatsUseCases } = require('../../application/use-cases');
const { gameSessionRepository } = require('../../infrastructure/repositories');

const router = express.Router();
const gameStatsUseCases = new GameStatsUseCases(gameSessionRepository);

/**
 * GET /api/stats/dashboard
 * Get aggregated dashboard statistics for the authenticated host
 */
router.get('/dashboard', authenticate, async (req, res, next) => {
  try {
    const result = await gameStatsUseCases.getDashboardStats({
      hostId: req.user.id
    });

    res.json(result.stats);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/stats/sessions
 * Get paginated game history for the authenticated host
 * Query params: page (default 1), limit (default 20, max 100)
 */
router.get('/sessions', authenticate, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));

    const result = await gameStatsUseCases.getSessionsByHost({
      hostId: req.user.id,
      page,
      limit
    });

    res.json({
      sessions: result.sessions.map(session => ({
        id: session.id,
        pin: session.pin,
        quiz: session.quiz ? {
          id: session.quiz.id,
          title: session.quiz.title
        } : null,
        playerCount: session.playerCount,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        durationSeconds: session.getDurationSeconds(),
        status: session.status,
        winner: session.getWinner()?.nickname || null
      })),
      pagination: result.pagination
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/stats/sessions/:id
 * Get detailed view of a single game session
 */
router.get('/sessions/:id', authenticate, async (req, res, next) => {
  try {
    const result = await gameStatsUseCases.getSessionDetail({
      sessionId: req.params.id,
      requesterId: req.user.id
    });

    const session = result.session;

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
      durationSeconds: session.getDurationSeconds(),
      status: session.status,
      overallAccuracy: session.getOverallAccuracy()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/stats/quiz/:quizId
 * Get performance stats for a specific quiz across all games
 */
router.get('/quiz/:quizId', authenticate, async (req, res, next) => {
  try {
    const result = await gameStatsUseCases.getQuizPerformance({
      hostId: req.user.id,
      quizId: req.params.quizId
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
