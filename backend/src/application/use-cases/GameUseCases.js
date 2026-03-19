const { SharedUseCases } = require('./SharedUseCases');
const { LockManager } = require('../../shared/utils/LockManager');
const { RoomState } = require('../../domain/entities');
const { Answer, PowerUpType } = require('../../domain/value-objects');
const { NotFoundError, ValidationError, ConflictError } = require('../../shared/errors');

class GameUseCases extends SharedUseCases {
  constructor(roomRepository, quizRepository, gameSessionRepository = null) {
    super(roomRepository, quizRepository);
    this.gameSessionRepository = gameSessionRepository;

    this.pendingAnswers = new LockManager(10000);
    this.pendingArchives = new LockManager(10000);
  }

  cleanupExpiredLocks() {
    return {
      pendingAnswers: this.pendingAnswers.cleanupExpired(),
      pendingArchives: this.pendingArchives.cleanupExpired()
    };
  }

  async roomExists(pin) {
    return await this.roomRepository.exists(pin);
  }

  async startGame({ pin, requesterId, questionCount }) {
    const room = await this._getRoomOrThrow(pin);
    const quiz = await this._getQuizOrThrow(room.quizId);

    if (quiz.getTotalQuestions() === 0) {
      throw new ValidationError('Quiz must have at least one question');
    }

    room.startGame(requesterId);

    const connectedPlayers = room.getConnectedPlayerCount();
    if (connectedPlayers === 0) {
      throw new ValidationError('Cannot start game: all players are disconnected');
    }

    // Use random subset if questionCount is provided and valid
    let quizSnapshot;
    if (questionCount && Number.isInteger(questionCount) && questionCount >= 1 && questionCount <= quiz.getTotalQuestions()) {
      quizSnapshot = quiz.getRandomSubset(questionCount);
    } else {
      quizSnapshot = quiz.clone();
    }

    if (!Object.isFrozen(quizSnapshot)) {
      throw new ValidationError('Failed to create immutable quiz snapshot - quiz not frozen');
    }

    room.setQuizSnapshot(quizSnapshot);
    room.setState(RoomState.QUESTION_INTRO);

    await this.roomRepository.save(room);
    await this.quizRepository.incrementPlayCount(room.quizId);

    const currentQuestion = this._getQuestionFromSnapshot(room, room.currentQuestionIndex);

    return {
      room,
      totalQuestions: quizSnapshot.getTotalQuestions(),
      currentQuestion: currentQuestion.getHostData()
    };
  }

  /**
   * Get question from room's quiz snapshot
   * @private
   */
  _getQuestionFromSnapshot(room, index) {
    const snapshot = room.getQuizSnapshot();
    if (!snapshot) {
      throw new ValidationError('Game has not started - no quiz snapshot available');
    }
    const question = snapshot.getQuestion(index);
    if (!question) {
      throw new NotFoundError(`Question at index ${index} not found`);
    }
    return question;
  }

  /**
   * Calculate per-player statistics from answer history
   * @private
   */
  _calculatePlayerStats(answerHistory) {
    const playerStats = new Map();
    for (const answer of answerHistory) {
      if (!answer || !answer.playerNickname || typeof answer.playerNickname !== 'string') {
        continue;
      }

      if (!playerStats.has(answer.playerNickname)) {
        playerStats.set(answer.playerNickname, {
          correctCount: 0,
          wrongCount: 0,
          totalResponseTime: 0,
          answerCount: 0
        });
      }
      const stats = playerStats.get(answer.playerNickname);
      stats.answerCount++;
      stats.totalResponseTime += answer.elapsedTimeMs || 0;
      if (answer.isCorrect) {
        stats.correctCount++;
      } else {
        stats.wrongCount++;
      }
    }
    return playerStats;
  }

  /**
   * Build player results from leaderboard and stats
   * @private
   */
  _buildPlayerResults(leaderboard, playerStats) {
    return leaderboard.map((player, index) => {
      const stats = playerStats.get(player.nickname) || {
        correctCount: 0,
        wrongCount: 0,
        totalResponseTime: 0,
        answerCount: 0
      };
      return {
        nickname: player.nickname,
        rank: index + 1,
        score: player.score,
        correctAnswers: player.correctAnswers,
        wrongAnswers: stats.wrongCount,
        averageResponseTime: stats.answerCount > 0
          ? Math.round(stats.totalResponseTime / stats.answerCount)
          : 0,
        longestStreak: player.longestStreak
      };
    });
  }

  /**
   * Map answer history to session schema format
   * @private
   */
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

  /**
   * Build session data from room state (shared by archive and interrupted save)
   * @private
   */
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

    // Include team data if team mode was active
    if (room.isTeamMode()) {
      sessionData.teamMode = true;
      sessionData.teamResults = room.getTeamLeaderboard();
    }

    return sessionData;
  }

  async startAnsweringPhase({ pin, requesterId }) {
    const room = await this._getRoomOrThrow(pin);
    this._throwIfNotHost(room, requesterId);

    room.setState(RoomState.ANSWERING_PHASE);
    room.clearAllAnswerAttempts();
    this.pendingAnswers.clearByPrefix(`${pin}:`);

    await this.roomRepository.save(room);

    const currentQuestion = this._getQuestionFromSnapshot(room, room.currentQuestionIndex);

    return {
      room,
      timeLimit: currentQuestion.timeLimit,
      optionCount: currentQuestion.options.length
    };
  }

  async submitAnswer({ pin, socketId, answerIndex, elapsedTimeMs }) {
    if (answerIndex === null || answerIndex === undefined ||
        typeof answerIndex !== 'number' || !Number.isInteger(answerIndex) ||
        answerIndex < 0) {
      throw new ValidationError('Invalid answer index');
    }

    if (elapsedTimeMs !== null && elapsedTimeMs !== undefined &&
        (typeof elapsedTimeMs !== 'number' || !Number.isFinite(elapsedTimeMs))) {
      throw new ValidationError('Invalid elapsed time');
    }
    const validElapsedTime = Math.max(0, elapsedTimeMs || 0);

    const submissionKey = `${pin}:${socketId}`;
    return this.pendingAnswers.withLock(submissionKey, 'Answer submission in progress', async () => {
      const room = await this._getRoomOrThrow(pin);

      if (room.state !== RoomState.ANSWERING_PHASE) {
        throw new ConflictError('Not in answering phase');
      }

      const player = room.getPlayer(socketId);
      if (!player) {
        throw new NotFoundError('Player not found');
      }

      if (player.isDisconnected()) {
        throw new ValidationError('Disconnected players cannot submit answers');
      }

      if (player.hasAnswered()) {
        throw new ConflictError('Already answered');
      }

      const currentQuestion = this._getQuestionFromSnapshot(room, room.currentQuestionIndex);

      if (!currentQuestion.options || !Array.isArray(currentQuestion.options) || currentQuestion.options.length === 0) {
        throw new ValidationError('Question has invalid or missing options');
      }

      if (answerIndex >= currentQuestion.options.length) {
        throw new ValidationError('Answer index out of bounds');
      }

      const answer = Answer.create({
        playerId: player.id,
        questionId: currentQuestion.id,
        roomPin: pin,
        answerIndex,
        question: currentQuestion,
        elapsedTimeMs: validElapsedTime,
        currentStreak: player.streak
      });

      player.submitAnswer(answerIndex, validElapsedTime);

      if (answer.isCorrect) {
        player.incrementStreak();
        let scoreToAdd = answer.getTotalScore();
        // Double points if DOUBLE_POINTS power-up is active
        if (player.hasActivePowerUp(PowerUpType.DOUBLE_POINTS)) {
          scoreToAdd *= 2;
        }
        player.addScore(scoreToAdd);
      } else {
        player.resetStreak();
      }

      room.recordAnswer({
        playerId: player.id,
        playerNickname: player.nickname,
        questionId: currentQuestion.id,
        answerIndex,
        isCorrect: answer.isCorrect,
        elapsedTimeMs: validElapsedTime,
        score: answer.getTotalScore(),
        streak: player.streak,
        optionCount: currentQuestion.options.length
      });

      await this.roomRepository.save(room);

      const allAnswered = room.haveAllPlayersAnswered();

      return {
        answer,
        player,
        allAnswered,
        answeredCount: room.getAnsweredCount(),
        totalPlayers: room.getConnectedPlayerCount()
      };
    });
  }

  async usePowerUp({ pin, socketId, powerUpType }) {
    const room = await this._getRoomOrThrow(pin);

    if (room.state !== RoomState.ANSWERING_PHASE) {
      throw new ValidationError('Power-ups can only be used during answering phase');
    }

    const player = room.getPlayer(socketId);
    if (!player) {
      throw new NotFoundError('Player not found');
    }

    if (player.isDisconnected()) {
      throw new ValidationError('Disconnected players cannot use power-ups');
    }

    if (player.hasAnswered()) {
      throw new ConflictError('Cannot use power-up after answering');
    }

    player.usePowerUp(powerUpType);

    const result = { type: powerUpType, nickname: player.nickname };

    if (powerUpType === PowerUpType.FIFTY_FIFTY) {
      const currentQuestion = this._getQuestionFromSnapshot(room, room.currentQuestionIndex);
      const eliminatedOptions = room.getFiftyFiftyOptions(
        socketId,
        currentQuestion.correctAnswerIndex,
        currentQuestion.options.length
      );
      result.eliminatedOptions = eliminatedOptions;
    } else if (powerUpType === PowerUpType.DOUBLE_POINTS) {
      result.activated = true;
    } else if (powerUpType === PowerUpType.TIME_EXTENSION) {
      result.extraTimeMs = 10000;
    }

    await this.roomRepository.save(room);
    return result;
  }

  async endAnsweringPhase({ pin, requesterId }) {
    const room = await this._getRoomOrThrow(pin);

    if (room.state !== RoomState.ANSWERING_PHASE) {
      throw new ConflictError('Not in answering phase');
    }

    if (requesterId !== 'server') {
      this._throwIfNotHost(room, requesterId);
    }

    room.setState(RoomState.SHOW_RESULTS);
    await this.roomRepository.save(room);

    const currentQuestion = this._getQuestionFromSnapshot(room, room.currentQuestionIndex);

    const { distribution, correctCount } = room.getAnswerDistribution(
      currentQuestion.options.length,
      (idx) => currentQuestion.isCorrect(idx)
    );

    return {
      room,
      correctAnswerIndex: currentQuestion.correctAnswerIndex,
      distribution,
      correctCount,
      totalPlayers: room.getConnectedPlayerCount()
    };
  }

  async showLeaderboard({ pin, requesterId }) {
    const room = await this._getRoomOrThrow(pin);
    this._throwIfNotHost(room, requesterId);

    room.setState(RoomState.LEADERBOARD);
    await this.roomRepository.save(room);

    const result = {
      room,
      leaderboard: room.getLeaderboard()
    };

    // Include team leaderboard if team mode is active
    if (room.isTeamMode()) {
      result.teamLeaderboard = room.getTeamLeaderboard();
    }

    return result;
  }

  async nextQuestion({ pin, requesterId }) {
    const room = await this._getRoomOrThrow(pin);
    const snapshot = room.getQuizSnapshot();

    if (!snapshot) {
      throw new ValidationError('Game has not started');
    }

    const totalQuestions = snapshot.getTotalQuestions();

    const hasMore = room.nextQuestion(requesterId, totalQuestions);
    await this.roomRepository.save(room);

    if (!hasMore) {
      const gameOverResult = {
        room,
        isGameOver: true,
        podium: room.getPodium()
      };
      if (room.isTeamMode()) {
        gameOverResult.teamPodium = room.getTeamPodium();
      }
      return gameOverResult;
    }

    const currentQuestion = this._getQuestionFromSnapshot(room, room.currentQuestionIndex);

    return {
      room,
      isGameOver: false,
      questionIndex: room.currentQuestionIndex,
      totalQuestions,
      currentQuestion: currentQuestion.getHostData()
    };
  }

  async getResults({ pin }) {
    const room = await this._getRoomOrThrow(pin);
    const result = {
      leaderboard: room.getLeaderboard(),
      podium: room.getPodium()
    };

    // Include team data if team mode is active
    if (room.isTeamMode()) {
      result.teamLeaderboard = room.getTeamLeaderboard();
      result.teamPodium = room.getTeamPodium();
    }

    return result;
  }

  async archiveGame({ pin }) {
    if (!this.gameSessionRepository) {
      return null;
    }

    return this.pendingArchives.withLock(pin, 'Game archival already in progress', async () => {
      const room = await this._getRoomOrThrow(pin);
      const sessionData = this._buildSessionData(room, 'completed');
      const session = await this.gameSessionRepository.save(sessionData);

      this.pendingAnswers.clearByPrefix(`${pin}:`);

      try {
        await this.roomRepository.delete(pin);
      } catch (deleteError) {
        console.error(`Failed to delete room ${pin} after archiving:`, deleteError.message);
      }

      return { session };
    });
  }

  async saveInterruptedGame({ pin, reason = 'unknown' }) {
    if (!this.gameSessionRepository) {
      return null;
    }

    if (!this.pendingArchives.acquire(pin)) {
      return null;
    }

    try {
      const room = await this.roomRepository.findByPin(pin);
      if (!room || !room.hasQuizSnapshot()) {
        return null;
      }

      const sessionData = this._buildSessionData(room, 'interrupted', {
        interruptionReason: reason,
        lastQuestionIndex: room.currentQuestionIndex,
        lastState: room.state
      });

      const session = await this.gameSessionRepository.save(sessionData);

      this.pendingAnswers.clearByPrefix(`${pin}:`);

      try {
        await this.roomRepository.delete(pin);
      } catch (err) {
        console.error(`Failed to delete interrupted room ${pin}:`, err.message);
      }

      return { session };
    } finally {
      this.pendingArchives.release(pin);
    }
  }

  async saveAllInterruptedGames(reason = 'server_shutdown') {
    const rooms = await this.roomRepository.getAll();
    let saved = 0;
    let failed = 0;

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

  async getInterruptedGames({ hostId, page = 1, limit = 20 }) {
    if (!this.gameSessionRepository) {
      return { sessions: [], pagination: { page, limit, total: 0, totalPages: 0, hasMore: false } };
    }

    const result = await this.gameSessionRepository.findByHost(hostId, { page, limit });

    const interruptedSessions = result.sessions.filter(
      session => session.status === 'interrupted'
    );

    return {
      sessions: interruptedSessions,
      pagination: result.pagination
    };
  }

  async pauseGame({ pin, requesterId }) {
    const room = await this._getRoomOrThrow(pin);
    room.pause(requesterId);
    await this.roomRepository.save(room);

    return {
      room,
      pausedAt: room.pausedAt
    };
  }

  async resumeGame({ pin, requesterId }) {
    const room = await this._getRoomOrThrow(pin);
    const pauseDuration = room.getPauseDuration();
    room.resume(requesterId);
    await this.roomRepository.save(room);

    return {
      room,
      pauseDuration,
      resumedState: room.state
    };
  }

  /**
   * Calculate server-side elapsed time for answer submission.
   * Encapsulates timer validation logic that should live in the use case layer.
   * @param {Object} timerService - The GameTimerService instance
   * @param {string} pin - Room PIN
   * @returns {number} Validated elapsed time in milliseconds
   * @throws {ValidationError} If timer has expired or no active timer exists
   */
  getServerElapsedTime(timerService, pin) {
    if (timerService.isTimeExpired(pin)) {
      throw new ValidationError('Time expired');
    }

    let elapsedTimeMs = timerService.getElapsedTime(pin);
    if (elapsedTimeMs === null) {
      throw new ValidationError('No active timer for this room');
    }

    const timerSync = timerService.getTimerSync(pin);
    if (timerSync && timerSync.totalTimeMs) {
      elapsedTimeMs = Math.min(elapsedTimeMs, timerSync.totalTimeMs);
    }

    if (timerService.isTimeExpired(pin)) {
      throw new ValidationError('Time expired');
    }

    return elapsedTimeMs;
  }
}

module.exports = { GameUseCases };
