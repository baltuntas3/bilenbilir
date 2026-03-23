const { SharedUseCases } = require('./SharedUseCases');
const { LockManager } = require('../../shared/utils/LockManager');
const { LOCK_TIMEOUT_MS } = require('../../shared/config/constants');

class GameArchiveUseCases extends SharedUseCases {
  constructor(roomRepository, quizRepository, gameSessionRepository) {
    super(roomRepository, quizRepository);
    this.gameSessionRepository = gameSessionRepository;
    this.pendingArchives = new LockManager(LOCK_TIMEOUT_MS);
  }

  _calculatePlayerStats(answerHistory) {
    const playerStats = new Map();
    for (const answer of answerHistory) {
      if (!answer || !answer.playerNickname || typeof answer.playerNickname !== 'string') continue;
      if (!playerStats.has(answer.playerNickname)) {
        playerStats.set(answer.playerNickname, { correctCount: 0, wrongCount: 0, totalResponseTime: 0, answerCount: 0 });
      }
      const stats = playerStats.get(answer.playerNickname);
      stats.answerCount++;
      stats.totalResponseTime += answer.elapsedTimeMs || 0;
      if (answer.isCorrect) stats.correctCount++;
      else stats.wrongCount++;
    }
    return playerStats;
  }

  _buildPlayerResults(leaderboard, playerStats) {
    return leaderboard.map((player, index) => {
      const stats = playerStats.get(player.nickname) || { correctCount: 0, wrongCount: 0, totalResponseTime: 0, answerCount: 0 };
      return {
        nickname: player.nickname,
        rank: index + 1,
        score: player.score,
        correctAnswers: stats.correctCount,
        wrongAnswers: stats.wrongCount,
        averageResponseTime: stats.answerCount > 0 ? Math.round(stats.totalResponseTime / stats.answerCount) : 0,
        longestStreak: player.longestStreak
      };
    });
  }

  _mapAnswersToSessionFormat(answerHistory) {
    return answerHistory.map(answer => ({
      nickname: answer.playerNickname,
      questionIndex: answer.questionIndex,
      answerIndex: answer.answerIndex,
      isCorrect: answer.isCorrect,
      responseTimeMs: answer.elapsedTimeMs,
      score: answer.score,
      streak: answer.streak || 0
    }));
  }

  _buildSessionData(room, status, extra = {}) {
    const leaderboard = room.getLeaderboard();
    const answerHistory = room.getAnswerHistory();
    const playerStats = this._calculatePlayerStats(answerHistory);

    const sessionData = {
      pin: room.pin,
      quiz: room.quizId,
      host: room.hostUserId,
      playerCount: room.getPlayerCount(),
      playerResults: this._buildPlayerResults(leaderboard, playerStats),
      answers: this._mapAnswersToSessionFormat(answerHistory),
      startedAt: room.getGameStartedAt() || room.createdAt,
      endedAt: new Date(),
      status,
      ...extra
    };

    if (room.isTeamMode()) {
      sessionData.teamMode = true;
      sessionData.teamResults = room.getTeamLeaderboard();
    }

    return sessionData;
  }

  async archiveGame({ pin, pendingAnswers }) {
    if (!this.gameSessionRepository) return null;

    return this.pendingArchives.withLock(pin, 'Game archival already in progress', async () => {
      const room = await this._getRoomOrThrow(pin);
      const sessionData = this._buildSessionData(room, 'completed');
      const session = await this.gameSessionRepository.save(sessionData);
      if (pendingAnswers) pendingAnswers.clearByPrefix(`${pin}:`);

      try { await this.roomRepository.delete(pin); }
      catch (deleteError) { console.error(`Failed to delete room ${pin} after archiving:`, deleteError.message); }

      return { session };
    });
  }

  async saveInterruptedGame({ pin, reason = 'unknown' }) {
    if (!this.gameSessionRepository) return null;

    try {
      return await this.pendingArchives.withLock(pin, 'Game archival already in progress', async () => {
        const room = await this.roomRepository.findByPin(pin);
        if (!room || !room.hasQuizSnapshot()) return null;

        const sessionData = this._buildSessionData(room, 'interrupted', {
          interruptionReason: reason,
          lastQuestionIndex: room.currentQuestionIndex,
          lastState: room.state
        });

        const session = await this.gameSessionRepository.save(sessionData);
        try { await this.roomRepository.delete(pin); }
        catch (err) { console.error(`Failed to delete interrupted room ${pin}:`, err.message); }
        return { session };
      });
    } catch (err) {
      // Lock held by concurrent archival — silently skip (best-effort for interrupted games)
      if (err.statusCode === 409) return null;
      throw err;
    }
  }

  async saveAllInterruptedGames(reason = 'server_shutdown') {
    const rooms = await this.roomRepository.getAll();
    let saved = 0, failed = 0;
    for (const room of rooms) {
      if (room.hasQuizSnapshot()) {
        try {
          const result = await this.saveInterruptedGame({ pin: room.pin, reason });
          if (result) saved++;
        } catch (err) {
          console.error(`Failed to save interrupted game ${room.pin}:`, err.message);
          failed++;
        }
      }
    }
    return { saved, failed };
  }
}

module.exports = { GameArchiveUseCases };
