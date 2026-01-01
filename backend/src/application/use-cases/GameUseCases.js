const { RoomState } = require('../../domain/entities');
const { Answer } = require('../../domain/value-objects');

class GameUseCases {
  constructor(roomRepository, quizRepository, gameSessionRepository = null) {
    this.roomRepository = roomRepository;
    this.quizRepository = quizRepository;
    this.gameSessionRepository = gameSessionRepository;

    // Map to track answer submissions in progress (race condition protection)
    this.pendingAnswers = new Map();
  }

  /**
   * Start the game (host only)
   */
  async startGame({ pin, requesterId }) {
    const room = await this.roomRepository.findByPin(pin);
    if (!room) {
      throw new Error('Room not found');
    }

    const quiz = await this.quizRepository.findById(room.quizId);
    if (!quiz) {
      throw new Error('Quiz not found');
    }

    // Validate quiz has at least one question
    if (quiz.getTotalQuestions() === 0) {
      throw new Error('Quiz must have at least one question');
    }

    room.startGame(requesterId); // Entity validates host and state

    // Move to first question intro
    room.setState(RoomState.QUESTION_INTRO);

    await this.roomRepository.save(room);

    const currentQuestion = quiz.getQuestion(room.currentQuestionIndex);

    return {
      room,
      totalQuestions: quiz.getTotalQuestions(),
      currentQuestion: currentQuestion.getPublicData()
    };
  }

  /**
   * Get current question (called after intro timer)
   */
  async getCurrentQuestion({ pin }) {
    const room = await this.roomRepository.findByPin(pin);
    if (!room) {
      throw new Error('Room not found');
    }

    const quiz = await this.quizRepository.findById(room.quizId);
    const currentQuestion = quiz.getQuestion(room.currentQuestionIndex);

    return {
      questionIndex: room.currentQuestionIndex,
      totalQuestions: quiz.getTotalQuestions(),
      question: currentQuestion.getPublicData()
    };
  }

  /**
   * Start answering phase (called after intro countdown)
   */
  async startAnsweringPhase({ pin, requesterId }) {
    const room = await this.roomRepository.findByPin(pin);
    if (!room) {
      throw new Error('Room not found');
    }

    if (!room.isHost(requesterId)) {
      throw new Error('Only host can control game flow');
    }

    room.setState(RoomState.ANSWERING_PHASE);

    // Clear all player answer attempts for new question (via Aggregate Root)
    room.clearAllAnswerAttempts();

    // Clear pending answers for this room
    this.pendingAnswers.delete(pin);

    await this.roomRepository.save(room);

    const quiz = await this.quizRepository.findById(room.quizId);
    const currentQuestion = quiz.getQuestion(room.currentQuestionIndex);

    return {
      room,
      timeLimit: currentQuestion.timeLimit,
      optionCount: currentQuestion.options.length
    };
  }

  /**
   * Submit an answer with race condition protection
   */
  async submitAnswer({ pin, socketId, answerIndex, elapsedTimeMs }) {
    // Create unique key for this submission
    const submissionKey = `${pin}:${socketId}`;

    // Check and set pending flag atomically (race condition protection)
    if (this.pendingAnswers.has(submissionKey)) {
      throw new Error('Answer submission in progress');
    }
    this.pendingAnswers.set(submissionKey, true);

    try {
      const room = await this.roomRepository.findByPin(pin);
      if (!room) {
        throw new Error('Room not found');
      }

      if (room.state !== RoomState.ANSWERING_PHASE) {
        throw new Error('Not in answering phase');
      }

      const player = room.getPlayer(socketId);
      if (!player) {
        throw new Error('Player not found');
      }

      if (player.hasAnswered()) {
        throw new Error('Already answered');
      }

      const quiz = await this.quizRepository.findById(room.quizId);
      const currentQuestion = quiz.getQuestion(room.currentQuestionIndex);

      // Validate elapsed time is non-negative
      const validElapsedTime = Math.max(0, elapsedTimeMs || 0);

      // Validate answer index is within range
      if (answerIndex < 0 || answerIndex >= currentQuestion.options.length) {
        throw new Error('Invalid answer index');
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

      await this.roomRepository.save(room);

      // Check if all players answered (via Aggregate Root)
      const allAnswered = room.haveAllPlayersAnswered();

      return {
        answer,
        player,
        allAnswered,
        answeredCount: room.getAnsweredCount(),
        totalPlayers: room.getPlayerCount()
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
    const room = await this.roomRepository.findByPin(pin);
    if (!room) {
      throw new Error('Room not found');
    }

    // Check if already ended (race condition protection)
    if (room.state !== RoomState.ANSWERING_PHASE) {
      throw new Error('Not in answering phase');
    }

    // Allow server-triggered end or host-triggered end
    if (requesterId !== 'server' && !room.isHost(requesterId)) {
      throw new Error('Only host can control game flow');
    }

    room.setState(RoomState.SHOW_RESULTS);

    await this.roomRepository.save(room);

    const quiz = await this.quizRepository.findById(room.quizId);
    const currentQuestion = quiz.getQuestion(room.currentQuestionIndex);

    // Get answer distribution via Aggregate Root
    const { distribution, correctCount } = room.getAnswerDistribution(
      currentQuestion.options.length,
      (idx) => currentQuestion.isCorrect(idx)
    );

    return {
      room,
      correctAnswerIndex: currentQuestion.correctAnswerIndex,
      distribution,
      correctCount,
      totalPlayers: room.getPlayerCount()
    };
  }

  /**
   * Show leaderboard
   */
  async showLeaderboard({ pin, requesterId }) {
    const room = await this.roomRepository.findByPin(pin);
    if (!room) {
      throw new Error('Room not found');
    }

    if (!room.isHost(requesterId)) {
      throw new Error('Only host can control game flow');
    }

    room.setState(RoomState.LEADERBOARD);

    await this.roomRepository.save(room);

    return {
      room,
      leaderboard: room.getLeaderboard()
    };
  }

  /**
   * Move to next question (host only)
   */
  async nextQuestion({ pin, requesterId }) {
    const room = await this.roomRepository.findByPin(pin);
    if (!room) {
      throw new Error('Room not found');
    }

    const quiz = await this.quizRepository.findById(room.quizId);
    const totalQuestions = quiz.getTotalQuestions();

    const hasMore = room.nextQuestion(requesterId, totalQuestions);

    await this.roomRepository.save(room);

    if (!hasMore) {
      return {
        room,
        isGameOver: true,
        podium: room.getPodium()
      };
    }

    const currentQuestion = quiz.getQuestion(room.currentQuestionIndex);

    return {
      room,
      isGameOver: false,
      questionIndex: room.currentQuestionIndex,
      totalQuestions,
      currentQuestion: currentQuestion.getPublicData()
    };
  }

  /**
   * Get final results / podium
   */
  async getResults({ pin }) {
    const room = await this.roomRepository.findByPin(pin);
    if (!room) {
      throw new Error('Room not found');
    }

    return {
      leaderboard: room.getLeaderboard(),
      podium: room.getPodium()
    };
  }

  /**
   * Archive game session to database
   */
  async archiveGame({ pin, startedAt }) {
    if (!this.gameSessionRepository) {
      return null; // Skip if no repository configured
    }

    const room = await this.roomRepository.findByPin(pin);
    if (!room) {
      throw new Error('Room not found');
    }

    const leaderboard = room.getLeaderboard();

    // Build player results
    const playerResults = leaderboard.map((player, index) => ({
      nickname: player.nickname,
      rank: index + 1,
      score: player.score,
      correctAnswers: player.streak, // Approximation
      wrongAnswers: 0,
      averageResponseTime: 0,
      longestStreak: player.streak
    }));

    const sessionData = {
      pin: room.pin,
      quiz: room.quizId,
      host: room.hostId,
      playerCount: room.getPlayerCount(),
      playerResults,
      answers: [], // Could be populated if we track answers
      startedAt: startedAt || room.createdAt,
      endedAt: new Date(),
      status: 'completed'
    };

    const session = await this.gameSessionRepository.save(sessionData);

    // Delete room after archiving
    await this.roomRepository.delete(pin);

    return { session };
  }
}

module.exports = { GameUseCases };
