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
      lastState: doc.lastState || null
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
}

const gameSessionRepository = new GameSessionRepository();

module.exports = { GameSessionRepository, gameSessionRepository };
