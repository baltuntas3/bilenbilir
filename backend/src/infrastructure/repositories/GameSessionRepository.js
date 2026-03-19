const mongoose = require('mongoose');
const { GameSession: GameSessionModel } = require('../db/models');
const { GameSession } = require('../../domain/records');

/**
 * MongoDB GameSession Repository
 * Converts between Mongoose models and Domain entities
 */
class GameSessionRepository {
  /**
   * Convert Mongoose document to Domain entity
   * @private
   */
  _toDomain(doc) {
    if (!doc) return null;

    // Extract populated quiz info if available
    const quiz = doc.quiz && typeof doc.quiz === 'object' && doc.quiz._id
      ? { id: doc.quiz._id.toString(), title: doc.quiz.title, description: doc.quiz.description }
      : null;

    // Extract populated host info if available
    const host = doc.host && typeof doc.host === 'object' && doc.host._id
      ? { id: doc.host._id.toString(), username: doc.host.username }
      : null;

    return new GameSession({
      id: doc._id.toString(),
      pin: doc.pin,
      quizId: doc.quiz?._id?.toString() || doc.quiz?.toString(),
      hostId: doc.host?._id?.toString() || doc.host?.toString(),
      playerCount: doc.playerCount,
      playerResults: doc.playerResults || [],
      answers: doc.answers || [],
      startedAt: doc.startedAt,
      endedAt: doc.endedAt,
      status: doc.status,
      createdAt: doc.createdAt,
      // Interrupted game metadata
      interruptionReason: doc.interruptionReason || null,
      lastQuestionIndex: doc.lastQuestionIndex ?? null,
      lastState: doc.lastState || null,
      // Populated fields
      quiz,
      host
    });
  }

  /**
   * Convert Domain entity/data to plain object for Mongoose
   * @private
   */
  _toDocument(data) {
    const doc = {
      pin: data.pin,
      quiz: data.quiz || data.quizId,
      host: data.host || data.hostId,
      playerCount: data.playerCount,
      playerResults: data.playerResults,
      answers: data.answers,
      startedAt: data.startedAt,
      endedAt: data.endedAt,
      status: data.status
    };

    // Include interrupted game metadata if present
    if (data.interruptionReason !== undefined) {
      doc.interruptionReason = data.interruptionReason;
    }
    if (data.lastQuestionIndex !== undefined) {
      doc.lastQuestionIndex = data.lastQuestionIndex;
    }
    if (data.lastState !== undefined) {
      doc.lastState = data.lastState;
    }

    return doc;
  }

  /**
   * Save a new game session
   * @param {Object} sessionData - Session data to save
   * @returns {Promise<GameSession>} Domain entity
   */
  async save(sessionData) {
    const doc = new GameSessionModel(this._toDocument(sessionData));
    const saved = await doc.save();
    return this._toDomain(saved);
  }

  /**
   * Find game session by ID
   * @param {string} id - Session ID
   * @returns {Promise<GameSession|null>}
   */
  async findById(id) {
    try {
      const doc = await GameSessionModel.findById(id)
        .populate('quiz')
        .populate('host', '-password');
      return this._toDomain(doc);
    } catch {
      return null;
    }
  }

  /**
   * Find game sessions by host
   * @param {string} hostId - Host user ID
   * @param {Object} options - Pagination options
   * @returns {Promise<{sessions: GameSession[], pagination: Object}>}
   */
  async findByHost(hostId, { page = 1, limit = 20 } = {}) {
    const skip = (page - 1) * limit;
    const [docs, total] = await Promise.all([
      GameSessionModel.find({ host: hostId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('quiz'),
      GameSessionModel.countDocuments({ host: hostId })
    ]);

    return {
      sessions: docs.map(doc => this._toDomain(doc)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total
      }
    };
  }

  /**
   * Find game sessions by quiz
   * @param {string} quizId - Quiz ID
   * @param {Object} options - Pagination options
   * @returns {Promise<{sessions: GameSession[], pagination: Object}>}
   */
  async findByQuiz(quizId, { page = 1, limit = 20 } = {}) {
    const skip = (page - 1) * limit;
    const [docs, total] = await Promise.all([
      GameSessionModel.find({ quiz: quizId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      GameSessionModel.countDocuments({ quiz: quizId })
    ]);

    return {
      sessions: docs.map(doc => this._toDomain(doc)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total
      }
    };
  }

  /**
   * Find game sessions by quiz and host (for proper authorization)
   * @param {string} quizId - Quiz ID
   * @param {string} hostId - Host user ID
   * @param {Object} options - Pagination options
   * @returns {Promise<{sessions: GameSession[], pagination: Object}>}
   */
  async findByQuizAndHost(quizId, hostId, { page = 1, limit = 20 } = {}) {
    const skip = (page - 1) * limit;
    const filter = { quiz: quizId, host: hostId };
    const [docs, total] = await Promise.all([
      GameSessionModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      GameSessionModel.countDocuments(filter)
    ]);

    return {
      sessions: docs.map(doc => this._toDomain(doc)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total
      }
    };
  }

  /**
   * Get recent game sessions
   * @param {Object} options - Pagination options
   * @returns {Promise<{sessions: GameSession[], pagination: Object}>}
   */
  async getRecent({ page = 1, limit = 20 } = {}) {
    const skip = (page - 1) * limit;
    const [docs, total] = await Promise.all([
      GameSessionModel.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('quiz')
        .populate('host', '-password'),
      GameSessionModel.countDocuments()
    ]);

    return {
      sessions: docs.map(doc => this._toDomain(doc)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total
      }
    };
  }

  /**
   * Delete a game session
   * @param {string} id - Session ID
   * @returns {Promise<boolean>}
   */
  async delete(id) {
    const result = await GameSessionModel.findByIdAndDelete(id);
    return !!result;
  }

  /**
   * Delete all game sessions for a quiz (cascade delete)
   * @param {string} quizId - Quiz ID
   * @returns {Promise<number>} Number of deleted sessions
   */
  async deleteByQuiz(quizId) {
    const result = await GameSessionModel.deleteMany({ quiz: quizId });
    return result.deletedCount || 0;
  }

  /**
   * Delete all game sessions for a host (cascade delete)
   * @param {string} hostId - Host user ID
   * @returns {Promise<number>} Number of deleted sessions
   */
  async deleteByHost(hostId) {
    const result = await GameSessionModel.deleteMany({ host: hostId });
    return result.deletedCount || 0;
  }

  /**
   * Get aggregated stats for a host
   * @param {string} hostId - Host user ID
   * @returns {Promise<Object>} Aggregated statistics
   */
  async getStatsByHost(hostId) {
    const [stats] = await GameSessionModel.aggregate([
      { $match: { host: new mongoose.Types.ObjectId(hostId) } },
      {
        $group: {
          _id: null,
          totalGames: { $sum: 1 },
          totalPlayers: { $sum: '$playerCount' },
          totalDuration: { $sum: '$durationSeconds' },
          totalAnswers: { $sum: { $size: '$answers' } },
          totalCorrectAnswers: {
            $sum: {
              $size: {
                $filter: {
                  input: '$answers',
                  as: 'a',
                  cond: { $eq: ['$$a.isCorrect', true] }
                }
              }
            }
          },
          allPlayerNicknames: { $push: '$playerResults.nickname' }
        }
      }
    ]);

    if (!stats) {
      return {
        totalGames: 0,
        totalPlayers: 0,
        uniquePlayers: 0,
        averagePlayersPerGame: 0,
        accuracyRate: 0,
        averageDuration: 0
      };
    }

    // Flatten and count unique nicknames
    const allNicknames = stats.allPlayerNicknames.flat();
    const uniquePlayers = new Set(allNicknames).size;

    return {
      totalGames: stats.totalGames,
      totalPlayers: stats.totalPlayers,
      uniquePlayers,
      averagePlayersPerGame: stats.totalGames > 0
        ? Math.round((stats.totalPlayers / stats.totalGames) * 10) / 10
        : 0,
      accuracyRate: stats.totalAnswers > 0
        ? Math.round((stats.totalCorrectAnswers / stats.totalAnswers) * 100)
        : 0,
      averageDuration: stats.totalGames > 0
        ? Math.round(stats.totalDuration / stats.totalGames)
        : 0
    };
  }

  /**
   * Get detailed session with all answers (populated)
   * @param {string} sessionId - Session ID
   * @returns {Promise<GameSession|null>}
   */
  async getDetailedSession(sessionId) {
    try {
      const doc = await GameSessionModel.findById(sessionId)
        .populate('quiz')
        .populate('host', '-password');
      return this._toDomain(doc);
    } catch {
      return null;
    }
  }

  /**
   * Get per-question accuracy stats across all games for a host
   * @param {string} hostId - Host user ID
   * @returns {Promise<Array>} Per-question stats
   */
  async getQuestionStats(hostId) {
    const stats = await GameSessionModel.aggregate([
      { $match: { host: new mongoose.Types.ObjectId(hostId) } },
      { $unwind: '$answers' },
      {
        $group: {
          _id: {
            quizId: '$quiz',
            questionIndex: '$answers.questionIndex'
          },
          totalAnswers: { $sum: 1 },
          correctAnswers: {
            $sum: { $cond: ['$answers.isCorrect', 1, 0] }
          },
          averageResponseTime: { $avg: '$answers.responseTimeMs' }
        }
      },
      {
        $project: {
          _id: 0,
          quizId: '$_id.quizId',
          questionIndex: '$_id.questionIndex',
          totalAnswers: 1,
          correctAnswers: 1,
          accuracyRate: {
            $cond: [
              { $gt: ['$totalAnswers', 0] },
              { $round: [{ $multiply: [{ $divide: ['$correctAnswers', '$totalAnswers'] }, 100] }, 0] },
              0
            ]
          },
          averageResponseTime: { $round: ['$averageResponseTime', 0] }
        }
      },
      { $sort: { quizId: 1, questionIndex: 1 } }
    ]);

    return stats;
  }
}

const gameSessionRepository = new GameSessionRepository();

module.exports = { GameSessionRepository, gameSessionRepository };
