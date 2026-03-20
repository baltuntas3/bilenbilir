const express = require('express');
const { authenticate } = require('../middlewares/authMiddleware');
const { GameStatsUseCases } = require('../../application/use-cases');
const { gameSessionRepository, mongoQuizRepository } = require('../../infrastructure/repositories');
const { parsePagination } = require('../helpers/routeHelpers');

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
    const { page, limit } = parsePagination(req.query);

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

    // Optionally load quiz questions for replay
    let quizQuestions = null;
    if (session.quiz && session.quiz.id) {
      try {
        const fullQuiz = await mongoQuizRepository.findById(session.quiz.id);
        if (fullQuiz) {
          quizQuestions = fullQuiz.questions.map(q => ({
            text: q.text,
            options: q.options,
            correctAnswerIndex: q.correctAnswerIndex,
            timeLimit: q.timeLimit,
            points: q.points
          }));
        }
      } catch {
        // Quiz may have been deleted, quizQuestions stays null
      }
    }

    res.json({
      id: session.id,
      pin: session.pin,
      quiz: session.quiz ? {
        id: session.quiz.id,
        title: session.quiz.title,
        description: session.quiz.description
      } : null,
      quizQuestions,
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
 * GET /api/stats/weak-topics
 * Get weak topics (quizzes with lowest accuracy) for the authenticated host
 */
router.get('/weak-topics', authenticate, async (req, res, next) => {
  try {
    const result = await gameStatsUseCases.getWeakTopics({ hostId: req.user.id });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/stats/player/:nickname
 * Get detailed analytics for a specific player
 */
router.get('/player/:nickname', authenticate, async (req, res, next) => {
  try {
    const result = await gameStatsUseCases.getPlayerAnalytics({
      hostId: req.user.id,
      nickname: decodeURIComponent(req.params.nickname)
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/stats/quiz/:quizId/questions
 * Get per-question analytics for a specific quiz
 */
router.get('/quiz/:quizId/questions', authenticate, async (req, res, next) => {
  try {
    const result = await gameStatsUseCases.getQuestionAnalytics({
      hostId: req.user.id,
      quizId: req.params.quizId
    });
    res.json(result);
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
