const { GameSession } = require('../db/models');

class GameSessionRepository {
  async save(sessionData) {
    const session = new GameSession(sessionData);
    return await session.save();
  }

  async findById(id) {
    return await GameSession.findById(id).populate('quiz').populate('host');
  }

  async findByHost(hostId) {
    return await GameSession.find({ host: hostId })
      .sort({ createdAt: -1 })
      .populate('quiz');
  }

  async findByQuiz(quizId) {
    return await GameSession.find({ quiz: quizId })
      .sort({ createdAt: -1 });
  }

  async getRecent(limit = 10) {
    return await GameSession.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('quiz')
      .populate('host');
  }
}

const gameSessionRepository = new GameSessionRepository();

module.exports = { GameSessionRepository, gameSessionRepository };
