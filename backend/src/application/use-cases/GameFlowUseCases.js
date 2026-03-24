const { SharedUseCases } = require('./SharedUseCases');
const { RoomState } = require('../../domain/entities');
const { NotFoundError, ValidationError, ConflictError } = require('../../shared/errors');

class GameFlowUseCases extends SharedUseCases {
  constructor(roomRepository, quizRepository) {
    super(roomRepository, quizRepository);
  }

  _getQuestionFromSnapshot(room, index) {
    const snapshot = room.getQuizSnapshot();
    if (!snapshot) throw new ValidationError('Game has not started - no quiz snapshot available');
    const question = snapshot.getQuestion(index);
    if (!question) throw new NotFoundError(`Question at index ${index} not found`);
    return question;
  }

  async startGame({ pin, requesterId, questionCount }) {
    const room = await this._getRoomOrThrow(pin);
    this._throwIfNotHost(room, requesterId);
    const quiz = await this._getQuizOrThrow(room.quizId);
    if (quiz.getTotalQuestions() === 0) throw new ValidationError('Quiz must have at least one question');
    if (room.getConnectedPlayerCount() === 0) throw new ValidationError('Cannot start game: all players are disconnected');

    // Validate host/state first (no side effects)
    room.startGame(requesterId);

    // Create snapshot BEFORE mutating room state — if this fails, room stays in WAITING_PLAYERS
    let quizSnapshot;
    if (questionCount && Number.isInteger(questionCount) && questionCount >= 1 && questionCount <= quiz.getTotalQuestions()) {
      quizSnapshot = quiz.getRandomSubset(questionCount);
    } else {
      quizSnapshot = quiz.clone();
    }

    if (!Object.isFrozen(quizSnapshot)) throw new ValidationError('Failed to create immutable quiz snapshot - quiz not frozen');

    // All validations passed — now mutate room state
    room.setQuizSnapshot(quizSnapshot);
    room.setState(RoomState.QUESTION_INTRO);
    await this.roomRepository.save(room);
    // Non-critical: increment play count. Failure should not affect game start.
    try {
      await this.quizRepository.incrementPlayCount(room.quizId);
    } catch (err) {
      console.error('Failed to increment play count:', err.message);
    }

    const currentQuestion = this._getQuestionFromSnapshot(room, room.currentQuestionIndex);
    return {
      room,
      totalQuestions: quizSnapshot.getTotalQuestions(),
      currentQuestion: currentQuestion.getHostData()
    };
  }

  async startAnsweringPhase({ pin, requesterId, pendingAnswers }) {
    const room = await this._getRoomOrThrow(pin);
    this._throwIfNotHost(room, requesterId);
    room.clearAllAnswerAttempts();
    room.setState(RoomState.ANSWERING_PHASE);
    await this.roomRepository.save(room);
    if (pendingAnswers) pendingAnswers.clearByPrefix(`${pin}:`);

    const currentQuestion = this._getQuestionFromSnapshot(room, room.currentQuestionIndex);
    let timeLimit = currentQuestion.timeLimit;
    let isLightning = false;
    const snapshot = room.getQuizSnapshot();
    if (room.lightningRound.enabled && room.isLightningQuestion(room.currentQuestionIndex, snapshot.getTotalQuestions())) {
      timeLimit = Math.max(5, Math.floor(timeLimit / 2));
      isLightning = true;
    }
    return { room, timeLimit, optionCount: currentQuestion.options.length, isLightning };
  }

  async endAnsweringPhase({ pin, requesterId }) {
    const room = await this._getRoomOrThrow(pin);
    if (room.state !== RoomState.ANSWERING_PHASE) throw new ConflictError('Not in answering phase');
    if (requesterId !== 'server') this._throwIfNotHost(room, requesterId);

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
      answeredCount: room.getTotalAnsweredCount(),
      totalPlayers: room.answeringPhasePlayerCount,
      explanation: currentQuestion.explanation || null
    };
  }

  async showLeaderboard({ pin, requesterId }) {
    const room = await this._getRoomOrThrow(pin);
    this._throwIfNotHost(room, requesterId);
    room.setState(RoomState.LEADERBOARD);
    await this.roomRepository.save(room);

    const result = { room, leaderboard: room.getLeaderboard() };
    if (room.isTeamMode()) result.teamLeaderboard = room.getTeamLeaderboard();
    return result;
  }

  async nextQuestion({ pin, requesterId }) {
    const room = await this._getRoomOrThrow(pin);
    const snapshot = room.getQuizSnapshot();
    if (!snapshot) throw new ValidationError('Game has not started');

    const totalQuestions = snapshot.getTotalQuestions();
    const hasMore = room.nextQuestion(requesterId, totalQuestions);
    await this.roomRepository.save(room);

    if (!hasMore) {
      const gameOverResult = { room, isGameOver: true, podium: room.getPodium() };
      if (room.isTeamMode()) gameOverResult.teamPodium = room.getTeamPodium();
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
    const result = { leaderboard: room.getLeaderboard(), podium: room.getPodium() };
    if (room.isTeamMode()) {
      result.teamLeaderboard = room.getTeamLeaderboard();
      result.teamPodium = room.getTeamPodium();
    }
    return result;
  }

  async pauseGame({ pin, requesterId }) {
    const room = await this._getRoomOrThrow(pin);
    room.pause(requesterId);
    await this.roomRepository.save(room);
    return { room, pausedAt: room.pausedAt };
  }

  async resumeGame({ pin, requesterId }) {
    const room = await this._getRoomOrThrow(pin);
    const pauseDuration = room.getPauseDuration();
    room.resume(requesterId);
    await this.roomRepository.save(room);
    return { room, pauseDuration, resumedState: room.state };
  }
}

module.exports = { GameFlowUseCases };
