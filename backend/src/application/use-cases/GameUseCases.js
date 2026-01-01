const { RoomState } = require('../../domain/entities');
const { Answer } = require('../../domain/value-objects');
const { NotFoundError, ForbiddenError, ValidationError, ConflictError } = require('../../shared/errors');

class GameUseCases {
  constructor(roomRepository, quizRepository, gameSessionRepository = null) {
    this.roomRepository = roomRepository;
    this.quizRepository = quizRepository;
    this.gameSessionRepository = gameSessionRepository;

    /**
     * Map to track answer submissions in progress (race condition protection)
     *
     * TODO: Redis Integration for Distributed Systems
     * ================================================
     * Current limitation: This in-memory Map only works for single-server deployments.
     * For horizontal scaling, replace with Redis-based distributed lock:
     *
     * - Use Redis SET with NX and EX options for atomic lock acquisition
     * - Key format: `pending_answer:${pin}:${socketId}`
     * - TTL: 10 seconds (auto-cleanup if process crashes)
     * - Implementation: Use Redlock algorithm for distributed locking
     *
     * Example with ioredis:
     * ```
     * const lockKey = `pending_answer:${pin}:${socketId}`;
     * const acquired = await redis.set(lockKey, '1', 'NX', 'EX', 10);
     * if (!acquired) throw new ConflictError('Answer submission in progress');
     * try { ... } finally { await redis.del(lockKey); }
     * ```
     */
    this.pendingAnswers = new Map();

    /**
     * Map to track game archival in progress (prevents duplicate archives)
     * Key: pin, Value: true (locked)
     */
    this.pendingArchives = new Map();
  }

  /**
   * Get room by PIN or throw NotFoundError
   * @private
   */
  async _getRoomOrThrow(pin) {
    const room = await this.roomRepository.findByPin(pin);
    if (!room) {
      throw new NotFoundError('Room not found');
    }
    return room;
  }

  /**
   * Get quiz by ID or throw NotFoundError
   * @private
   */
  async _getQuizOrThrow(quizId) {
    const quiz = await this.quizRepository.findById(quizId);
    if (!quiz) {
      throw new NotFoundError('Quiz not found');
    }
    return quiz;
  }

  /**
   * Validate that requester is host or throw ForbiddenError
   * @private
   */
  _throwIfNotHost(room, requesterId) {
    if (!room.isHost(requesterId)) {
      throw new ForbiddenError('Only host can control game flow');
    }
  }

  /**
   * Start the game (host only)
   * Creates an immutable quiz snapshot to prevent mid-game modifications
   */
  async startGame({ pin, requesterId }) {
    const room = await this._getRoomOrThrow(pin);
    const quiz = await this._getQuizOrThrow(room.quizId);

    // Validate quiz has at least one question
    if (quiz.getTotalQuestions() === 0) {
      throw new ValidationError('Quiz must have at least one question');
    }

    room.startGame(requesterId); // Entity validates host and state

    // Validate at least one connected player exists
    const totalPlayers = room.getPlayerCount();
    const connectedPlayers = room.getConnectedPlayerCount();

    if (totalPlayers === 0) {
      throw new ValidationError('Cannot start game: no players have joined yet');
    }

    if (connectedPlayers === 0) {
      throw new ValidationError('Cannot start game: all players are disconnected');
    }

    // Create immutable quiz snapshot for the game session
    // This prevents mid-game modifications from affecting the ongoing game
    const quizSnapshot = quiz.clone();
    room.setQuizSnapshot(quizSnapshot);

    // Move to first question intro
    room.setState(RoomState.QUESTION_INTRO);

    await this.roomRepository.save(room);

    // Increment play count for analytics
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
   * Get question with null check
   * @private
   */
  _getQuestionOrThrow(quiz, index) {
    const question = quiz.getQuestion(index);
    if (!question) {
      throw new NotFoundError(`Question at index ${index} not found. Quiz may have been modified.`);
    }
    return question;
  }

  /**
   * Clear all pending answers for a room
   * @private
   */
  _clearPendingAnswersForRoom(pin) {
    const prefix = `${pin}:`;
    for (const key of this.pendingAnswers.keys()) {
      if (key.startsWith(prefix)) {
        this.pendingAnswers.delete(key);
      }
    }
  }

  /**
   * Get current question (called after intro timer)
   * Uses the frozen quiz snapshot to ensure consistency
   */
  async getCurrentQuestion({ pin }) {
    const room = await this._getRoomOrThrow(pin);
    const snapshot = room.getQuizSnapshot();

    if (!snapshot) {
      throw new ValidationError('Game has not started');
    }

    const currentQuestion = this._getQuestionFromSnapshot(room, room.currentQuestionIndex);

    return {
      questionIndex: room.currentQuestionIndex,
      totalQuestions: snapshot.getTotalQuestions(),
      question: currentQuestion.getPublicData()
    };
  }

  /**
   * Start answering phase (called after intro countdown)
   * Uses the frozen quiz snapshot to ensure consistency
   */
  async startAnsweringPhase({ pin, requesterId }) {
    const room = await this._getRoomOrThrow(pin);
    this._throwIfNotHost(room, requesterId);

    room.setState(RoomState.ANSWERING_PHASE);
    room.clearAllAnswerAttempts();
    this._clearPendingAnswersForRoom(pin);

    await this.roomRepository.save(room);

    const currentQuestion = this._getQuestionFromSnapshot(room, room.currentQuestionIndex);

    return {
      room,
      timeLimit: currentQuestion.timeLimit,
      optionCount: currentQuestion.options.length
    };
  }

  /**
   * Submit an answer with race condition protection
   * Validates all inputs upfront before any state modifications
   */
  async submitAnswer({ pin, socketId, answerIndex, elapsedTimeMs }) {
    // ===== PHASE 1: Early input validation (before any locks or state access) =====
    // Validate answer index type upfront to fail fast
    if (answerIndex === null || answerIndex === undefined ||
        typeof answerIndex !== 'number' || !Number.isInteger(answerIndex) ||
        answerIndex < 0) {
      throw new ValidationError('Invalid answer index');
    }

    // Validate elapsed time early
    if (elapsedTimeMs !== null && elapsedTimeMs !== undefined &&
        (typeof elapsedTimeMs !== 'number' || !Number.isFinite(elapsedTimeMs))) {
      throw new ValidationError('Invalid elapsed time');
    }
    const validElapsedTime = Math.max(0, elapsedTimeMs || 0);

    // ===== PHASE 2: Acquire lock =====
    const submissionKey = `${pin}:${socketId}`;
    if (this.pendingAnswers.has(submissionKey)) {
      throw new ConflictError('Answer submission in progress');
    }
    this.pendingAnswers.set(submissionKey, true);

    try {
      // ===== PHASE 3: Load and validate state =====
      const room = await this._getRoomOrThrow(pin);

      if (room.state !== RoomState.ANSWERING_PHASE) {
        throw new ConflictError('Not in answering phase');
      }

      const player = room.getPlayer(socketId);
      if (!player) {
        throw new NotFoundError('Player not found');
      }

      // Prevent disconnected players from submitting answers
      if (player.isDisconnected()) {
        throw new ForbiddenError('Disconnected players cannot submit answers');
      }

      if (player.hasAnswered()) {
        throw new ConflictError('Already answered');
      }

      const currentQuestion = this._getQuestionFromSnapshot(room, room.currentQuestionIndex);

      // ===== PHASE 4: Validate answer against question (bounds check) =====
      if (answerIndex >= currentQuestion.options.length) {
        throw new ValidationError('Answer index out of bounds');
      }

      // Create answer and calculate score
      const answer = Answer.create({
        playerId: player.id,
        questionId: currentQuestion.id,
        roomPin: pin,
        answerIndex,
        question: currentQuestion,
        elapsedTimeMs: validElapsedTime,
        currentStreak: player.streak
      });

      // Update player
      player.submitAnswer(answerIndex, validElapsedTime);

      if (answer.isCorrect) {
        player.incrementStreak();
        player.addScore(answer.getTotalScore());
      } else {
        player.resetStreak();
      }

      // Record answer for archiving
      room.recordAnswer({
        playerId: player.id,
        playerNickname: player.nickname,
        questionId: currentQuestion.id,
        answerIndex,
        isCorrect: answer.isCorrect,
        elapsedTimeMs: validElapsedTime,
        score: answer.getTotalScore(),
        streak: player.streak
      });

      await this.roomRepository.save(room);

      // Check if all players answered (via Aggregate Root)
      const allAnswered = room.haveAllPlayersAnswered();

      return {
        answer,
        player,
        allAnswered,
        answeredCount: room.getAnsweredCount(),
        totalPlayers: room.getConnectedPlayerCount()
      };
    } finally {
      // Always clean up the pending flag
      this.pendingAnswers.delete(submissionKey);
    }
  }

  /**
   * End answering phase and show results
   */
  async endAnsweringPhase({ pin, requesterId }) {
    const room = await this._getRoomOrThrow(pin);

    if (room.state !== RoomState.ANSWERING_PHASE) {
      throw new ConflictError('Not in answering phase');
    }

    // Allow server-triggered end or host-triggered end
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

  /**
   * Show leaderboard
   */
  async showLeaderboard({ pin, requesterId }) {
    const room = await this._getRoomOrThrow(pin);
    this._throwIfNotHost(room, requesterId);

    room.setState(RoomState.LEADERBOARD);
    await this.roomRepository.save(room);

    return {
      room,
      leaderboard: room.getLeaderboard()
    };
  }

  /**
   * Move to next question (host only)
   * Uses the frozen quiz snapshot to ensure consistency
   */
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
      return {
        room,
        isGameOver: true,
        podium: room.getPodium()
      };
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

  /**
   * Get final results / podium
   */
  async getResults({ pin }) {
    const room = await this._getRoomOrThrow(pin);
    return {
      leaderboard: room.getLeaderboard(),
      podium: room.getPodium()
    };
  }

  /**
   * Archive game session to database
   * Uses lock to prevent concurrent archive requests for the same room
   * Uses room.gameStartedAt for accurate timestamps (set when quiz snapshot is created)
   *
   * Note: If gameSessionRepository is null, returns early without lock.
   * This is safe because no archival operations are performed - room will be
   * cleaned up by RoomCleanupService based on idle timeout.
   */
  async archiveGame({ pin }) {
    // No repository = no archival needed (e.g., development mode without database)
    // Room will be cleaned up by RoomCleanupService
    if (!this.gameSessionRepository) {
      return null;
    }

    // Acquire archive lock to prevent duplicate archives
    if (this.pendingArchives.has(pin)) {
      throw new ConflictError('Game archival already in progress');
    }
    this.pendingArchives.set(pin, true);

    let session = null;
    try {
      const room = await this._getRoomOrThrow(pin);
      const leaderboard = room.getLeaderboard();
      const answerHistory = room.getAnswerHistory();

      // Calculate per-player statistics
      const playerStats = new Map();
      for (const answer of answerHistory) {
        // Skip answers with missing or invalid nickname
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

      // Build player results with calculated wrongAnswers and averageResponseTime
      const playerResults = leaderboard.map((player, index) => {
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

      // Get all recorded answers from the game
      // Map to GameSession schema field names for consistency
      const answers = answerHistory.map(answer => ({
        nickname: answer.playerNickname,
        questionIndex: answer.questionIndex,
        answerIndex: answer.answerIndex,
        isCorrect: answer.isCorrect,
        responseTimeMs: answer.elapsedTimeMs,
        score: answer.score,
        streak: answer.streak || 0
      }));

      const sessionData = {
        pin: room.pin,
        quiz: room.quizId,
        host: room.hostId,
        playerCount: room.getPlayerCount(),
        playerResults,
        answers,
        startedAt: room.getGameStartedAt() || room.createdAt,
        endedAt: new Date(),
        status: 'completed'
      };

      session = await this.gameSessionRepository.save(sessionData);

      // Clean up pending answers for this room
      this._clearPendingAnswersForRoom(pin);

      // Delete room after archiving
      try {
        await this.roomRepository.delete(pin);
      } catch (deleteError) {
        // Log error but don't fail - session is already saved
        // The room will be cleaned up by cleanup service
        console.error(`Failed to delete room ${pin} after archiving:`, deleteError.message);
      }

      return { session };
    } finally {
      // Always release the archive lock
      this.pendingArchives.delete(pin);
    }
  }
}

module.exports = { GameUseCases };
