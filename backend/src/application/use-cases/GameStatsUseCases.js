const { NotFoundError, ForbiddenError } = require('../../shared/errors');
const { ANALYTICS_MAX_SESSIONS } = require('../../shared/config/constants');

class GameStatsUseCases {
  constructor(gameSessionRepository) {
    this.gameSessionRepository = gameSessionRepository;
  }

  /**
   * Shared helper: calculate per-question answer distribution from sessions
   * @param {Array} sessions - Array of game sessions
   * @returns {Map} Map of questionIndex -> { correct, wrong, totalTime, count }
   */
  _calculateAccuracy(correct, total) {
    return total > 0 ? Math.round((correct / total) * 100) : 0;
  }

  _calculateAnswerDistribution(sessions) {
    const questionStats = new Map();

    for (const session of sessions) {
      for (const answer of (session.answers || [])) {
        const key = answer.questionIndex;
        if (!questionStats.has(key)) {
          questionStats.set(key, { correct: 0, wrong: 0, totalTime: 0, count: 0 });
        }
        const stats = questionStats.get(key);
        stats.count++;
        stats.totalTime += answer.responseTimeMs || 0;
        if (answer.isCorrect) stats.correct++;
        else stats.wrong++;
      }
    }

    return questionStats;
  }

  /**
   * Get aggregated dashboard stats for a host
   * @param {Object} params
   * @param {string} params.hostId - Host user ID
   * @returns {Promise<Object>} Dashboard statistics
   */
  async getDashboardStats({ hostId }) {
    const stats = await this.gameSessionRepository.getStatsByHost(hostId);
    return { stats };
  }

  /**
   * Get single game session detail with authorization check
   * @param {Object} params
   * @param {string} params.sessionId - Session ID
   * @param {string} params.requesterId - Requesting user ID
   * @returns {Promise<Object>} Session detail
   */
  async getSessionDetail({ sessionId, requesterId }) {
    const session = await this.gameSessionRepository.getDetailedSession(sessionId);

    if (!session) {
      throw new NotFoundError('Game session not found');
    }

    if (session.hostId !== requesterId) {
      throw new ForbiddenError('Not authorized to view this session');
    }

    return { session };
  }

  /**
   * Get paginated game history for a host
   * @param {Object} params
   * @param {string} params.hostId - Host user ID
   * @param {number} params.page - Page number
   * @param {number} params.limit - Items per page
   * @returns {Promise<Object>} Sessions and pagination
   */
  async getSessionsByHost({ hostId, page = 1, limit = 20 }) {
    const result = await this.gameSessionRepository.findByHost(hostId, { page, limit });
    return result;
  }

  /**
   * Get detailed analytics for a specific player across all sessions
   * @param {Object} params
   * @param {string} params.hostId - Host user ID
   * @param {string} params.nickname - Player nickname
   * @returns {Promise<Object>} Player analytics data
   */
  async getPlayerAnalytics({ hostId, nickname }) {
    const sessions = await this.gameSessionRepository.findByHost(hostId, { page: 1, limit: ANALYTICS_MAX_SESSIONS });
    const allSessions = sessions.sessions || [];

    const playerSessions = [];
    let totalScore = 0;
    let totalCorrect = 0;
    let totalWrong = 0;
    let totalResponseTime = 0;
    let totalAnswers = 0;
    let bestRank = Infinity;

    for (const session of allSessions) {
      const playerResult = session.playerResults?.find(p => p.nickname === nickname);
      if (playerResult) {
        playerSessions.push({
          sessionId: session.id,
          quizTitle: session.quiz?.title || 'Silinmiş Quiz',
          date: session.startedAt,
          score: playerResult.score,
          rank: playerResult.rank,
          correctAnswers: playerResult.correctAnswers,
          wrongAnswers: playerResult.wrongAnswers,
          averageResponseTime: playerResult.averageResponseTime
        });

        totalScore += playerResult.score;
        totalCorrect += playerResult.correctAnswers || 0;
        totalWrong += playerResult.wrongAnswers || 0;
        if (playerResult.averageResponseTime > 0) {
          totalResponseTime += playerResult.averageResponseTime;
          totalAnswers++;
        }
        if (playerResult.rank < bestRank) bestRank = playerResult.rank;
      }
    }

    const accuracy = this._calculateAccuracy(totalCorrect, totalCorrect + totalWrong);

    return {
      nickname,
      gamesPlayed: playerSessions.length,
      totalScore,
      accuracy,
      averageResponseTime: totalAnswers > 0 ? Math.round(totalResponseTime / totalAnswers) : 0,
      bestRank: bestRank === Infinity ? null : bestRank,
      sessions: playerSessions.sort((a, b) => new Date(b.date) - new Date(a.date))
    };
  }

  /**
   * Get per-question analytics for a specific quiz
   * @param {Object} params
   * @param {string} params.hostId - Host user ID
   * @param {string} params.quizId - Quiz ID
   * @returns {Promise<Object>} Question-level analytics
   */
  async getQuestionAnalytics({ hostId, quizId }) {
    const sessions = await this.gameSessionRepository.findByQuizAndHost(quizId, hostId, { page: 1, limit: ANALYTICS_MAX_SESSIONS });
    const allSessions = sessions.sessions || [];

    const questionStats = this._calculateAnswerDistribution(allSessions);

    const results = [];
    for (const [questionIndex, stats] of questionStats) {
      const total = stats.correct + stats.wrong;
      results.push({
        questionIndex,
        accuracy: this._calculateAccuracy(stats.correct, total),
        averageResponseTime: stats.count > 0 ? Math.round(stats.totalTime / stats.count) : 0,
        totalAttempts: total,
        correctCount: stats.correct,
        wrongCount: stats.wrong
      });
    }

    return { quizId, questions: results.sort((a, b) => a.questionIndex - b.questionIndex) };
  }

  /**
   * Get weak topics (quizzes with lowest accuracy)
   * @param {Object} params
   * @param {string} params.hostId - Host user ID
   * @returns {Promise<Object>} Weak topics data
   */
  async getWeakTopics({ hostId }) {
    const sessions = await this.gameSessionRepository.findByHost(hostId, { page: 1, limit: ANALYTICS_MAX_SESSIONS });
    const allSessions = sessions.sessions || [];

    const quizAccuracy = new Map();

    for (const session of allSessions) {
      const quizTitle = session.quiz?.title || 'Bilinmeyen';
      const quizId = session.quiz?.id || session.quiz;
      if (!quizAccuracy.has(quizId)) {
        quizAccuracy.set(quizId, { title: quizTitle, correct: 0, wrong: 0, sessions: 0 });
      }
      const stats = quizAccuracy.get(quizId);
      stats.sessions++;
      for (const answer of (session.answers || [])) {
        if (answer.isCorrect) stats.correct++;
        else stats.wrong++;
      }
    }

    const results = [];
    for (const [quizId, stats] of quizAccuracy) {
      const total = stats.correct + stats.wrong;
      results.push({
        quizId,
        quizTitle: stats.title,
        accuracy: this._calculateAccuracy(stats.correct, total),
        totalAttempts: total,
        sessions: stats.sessions
      });
    }

    return { topics: results.sort((a, b) => a.accuracy - b.accuracy) };
  }

  /**
   * Get performance stats for a specific quiz across all games
   * @param {Object} params
   * @param {string} params.hostId - Host user ID
   * @param {string} params.quizId - Quiz ID
   * @returns {Promise<Object>} Quiz performance data
   */
  async getQuizPerformance({ hostId, quizId }) {
    const result = await this.gameSessionRepository.findByQuizAndHost(quizId, hostId, { page: 1, limit: ANALYTICS_MAX_SESSIONS });
    const sessions = result.sessions;

    if (sessions.length === 0) {
      throw new NotFoundError('No game sessions found for this quiz');
    }

    // Calculate aggregate performance
    let totalPlayers = 0;
    let totalCorrect = 0;
    let totalAnswers = 0;
    let totalDuration = 0;

    for (const session of sessions) {
      totalPlayers += session.playerCount;
      for (const answer of session.answers) {
        totalAnswers++;
        if (answer.isCorrect) totalCorrect++;
      }
      totalDuration += session.getDurationSeconds();
    }

    // Get per-question breakdown using shared helper
    const questionStatsMap = this._calculateAnswerDistribution(sessions);

    const questionBreakdown = Array.from(questionStatsMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([questionIndex, stat]) => ({
        questionIndex,
        totalAnswers: stat.correct + stat.wrong,
        correctAnswers: stat.correct,
        accuracyRate: this._calculateAccuracy(stat.correct, stat.correct + stat.wrong),
        averageResponseTime: stat.count > 0 ? Math.round(stat.totalTime / stat.count) : 0
      }));

    return {
      quizId,
      totalGames: sessions.length,
      totalPlayers,
      averagePlayersPerGame: sessions.length > 0
        ? Math.round((totalPlayers / sessions.length) * 10) / 10
        : 0,
      overallAccuracy: this._calculateAccuracy(totalCorrect, totalAnswers),
      averageDuration: sessions.length > 0
        ? Math.round(totalDuration / sessions.length)
        : 0,
      questionBreakdown,
      recentSessions: sessions.slice(0, 5).map(s => ({
        id: s.id,
        playerCount: s.playerCount,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        durationSeconds: s.getDurationSeconds(),
        status: s.status,
        winner: s.getWinner()?.nickname || null
      }))
    };
  }
}

module.exports = { GameStatsUseCases };
