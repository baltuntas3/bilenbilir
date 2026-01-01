const { GameSession } = require('../db/models');

class GameSessionRepository {
  async save(sessionData) {
    const session = new GameSession(sessionData);
    return await session.save();
  }

  async findById(id) {
    return await GameSession.findById(id).populate('quiz').populate('host');
  }

  async findByHost(hostId, { page = 1, limit = 20 } = {}) {
    const skip = (page - 1) * limit;
    const [sessions, total] = await Promise.all([
      GameSession.find({ host: hostId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('quiz'),
      GameSession.countDocuments({ host: hostId })
    ]);
    return {
      sessions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total
      }
    };
  }

  async findByQuiz(quizId, { page = 1, limit = 20 } = {}) {
    const skip = (page - 1) * limit;
    const [sessions, total] = await Promise.all([
      GameSession.find({ quiz: quizId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      GameSession.countDocuments({ quiz: quizId })
    ]);
    return {
      sessions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total
      }
    };
  }
}

const gameSessionRepository = new GameSessionRepository();

module.exports = { GameSessionRepository, gameSessionRepository };
