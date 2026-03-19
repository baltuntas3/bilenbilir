const { NotFoundError, ForbiddenError } = require('../../shared/errors');

class GameStatsUseCases {
  constructor(gameSessionRepository) {
    this.gameSessionRepository = gameSessionRepository;
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
   * Get performance stats for a specific quiz across all games
   * @param {Object} params
   * @param {string} params.hostId - Host user ID
   * @param {string} params.quizId - Quiz ID
   * @returns {Promise<Object>} Quiz performance data
   */
  async getQuizPerformance({ hostId, quizId }) {
    const result = await this.gameSessionRepository.findByQuizAndHost(quizId, hostId, { page: 1, limit: 100 });
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

    // Get per-question breakdown from all sessions
    const questionStatsMap = new Map();
    for (const session of sessions) {
      for (const answer of session.answers) {
        const key = answer.questionIndex;
        if (!questionStatsMap.has(key)) {
          questionStatsMap.set(key, { total: 0, correct: 0, totalResponseTime: 0 });
        }
        const stat = questionStatsMap.get(key);
        stat.total++;
        stat.totalResponseTime += answer.responseTimeMs;
        if (answer.isCorrect) stat.correct++;
      }
    }

    const questionBreakdown = Array.from(questionStatsMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([questionIndex, stat]) => ({
        questionIndex,
        totalAnswers: stat.total,
        correctAnswers: stat.correct,
        accuracyRate: stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : 0,
        averageResponseTime: stat.total > 0 ? Math.round(stat.totalResponseTime / stat.total) : 0
      }));

    return {
      quizId,
      totalGames: sessions.length,
      totalPlayers,
      averagePlayersPerGame: sessions.length > 0
        ? Math.round((totalPlayers / sessions.length) * 10) / 10
        : 0,
      overallAccuracy: totalAnswers > 0
        ? Math.round((totalCorrect / totalAnswers) * 100)
        : 0,
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
