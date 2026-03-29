const { SharedUseCases } = require('./SharedUseCases');
const { RoomState } = require('../../domain/entities');
const { ValidationError } = require('../../shared/errors');
const { MIN_QUESTION_TIME } = require('../../shared/config/constants');

class GameFlowUseCases extends SharedUseCases {
  constructor(roomRepository, quizRepository) {
    super(roomRepository, quizRepository);
  }

  async startGame({ pin, requesterId, questionCount }) {
    const room = await this._getRoomOrThrow(pin);
    const quiz = await this._getQuizOrThrow(room.quizId);
    if (quiz.getTotalQuestions() === 0) throw new ValidationError('Quiz must have at least one question');

    // Create snapshot BEFORE mutating room state — if this fails, room stays in WAITING_PLAYERS
    let quizSnapshot;
    if (questionCount !== undefined && questionCount !== null) {
      if (!Number.isInteger(questionCount) || questionCount < 1) {
        throw new ValidationError('Question count must be a positive integer');
      }
      if (questionCount > quiz.getTotalQuestions()) {
        throw new ValidationError(`Question count (${questionCount}) exceeds available questions (${quiz.getTotalQuestions()})`);
      }
      quizSnapshot = quiz.getRandomSubset(questionCount);
    } else {
      quizSnapshot = quiz.clone();
    }

    if (!Object.isFrozen(quizSnapshot)) throw new ValidationError('Failed to create immutable quiz snapshot - quiz not frozen');

    // Single atomic operation: validates host, player count, state, then sets snapshot + state
    room.startGameSession(requesterId, quizSnapshot);
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
    // Atomic: validates state, transitions, snapshots player count, clears answers
    room.beginAnsweringPhase();
    await this.roomRepository.save(room);
    if (pendingAnswers) {
      try { pendingAnswers.clearByPrefix(`${pin}:`); } catch (err) {
        console.error(`Failed to clear pending answer locks for ${pin}:`, err.message);
      }
    }

    const currentQuestion = this._getQuestionFromSnapshot(room, room.currentQuestionIndex);
    let timeLimit = currentQuestion.timeLimit;
    let isLightning = false;
    const snapshot = room.getQuizSnapshot();
    if (room.lightningRound.enabled && room.isLightningQuestion(room.currentQuestionIndex, snapshot.getTotalQuestions())) {
      timeLimit = Math.max(MIN_QUESTION_TIME, Math.floor(timeLimit / 2));
      isLightning = true;
    }
    return { room, timeLimit, optionCount: currentQuestion.options.length, isLightning };
  }

  /**
   * Rollback from ANSWERING_PHASE to QUESTION_INTRO when timer fails to start.
   * Prevents the game from being stuck in ANSWERING_PHASE without a running timer.
   */
  async rollbackAnsweringPhase({ pin }) {
    const room = await this._getRoomOrThrow(pin);
    if (room.state !== RoomState.ANSWERING_PHASE) return;
    // Direct state assignment for rollback — validTransitions doesn't allow ANSWERING_PHASE → QUESTION_INTRO
    room.state = RoomState.QUESTION_INTRO;
    room.answeringPhasePlayerCount = 0;
    await this.roomRepository.save(room);
  }

  async endAnsweringPhase({ pin, requesterId, isSystemTriggered = false }) {
    const room = await this._getRoomOrThrow(pin);
    if (room.state !== RoomState.ANSWERING_PHASE) throw new ValidationError('Not in answering phase');
    if (!isSystemTriggered) this._throwIfNotHost(room, requesterId);

    room.setState(RoomState.SHOW_RESULTS);
    await this.roomRepository.save(room);

    const currentQuestion = this._getQuestionFromSnapshot(room, room.currentQuestionIndex);
    const { distribution, correctCount, skippedCount } = room.getAnswerDistribution(
      currentQuestion.options.length,
      (idx) => currentQuestion.isCorrect(idx)
    );

    return {
      room,
      correctAnswerIndex: currentQuestion.correctAnswerIndex,
      distribution,
      correctCount,
      skippedCount,
      answeredCount: room.getTotalAnsweredCount(),
      totalPlayers: room.answeringPhasePlayerCount,
      connectedPlayerCount: room.getConnectedPlayerCount(),
      explanation: currentQuestion.explanation || null
    };
  }

  async showLeaderboard({ pin, requesterId }) {
    const room = await this._getRoomOrThrow(pin);
    this._throwIfNotHost(room, requesterId);
    if (room.state !== RoomState.SHOW_RESULTS) {
      throw new ValidationError('Leaderboard can only be shown after results');
    }
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
    if (room.state !== RoomState.PODIUM) {
      throw new ValidationError('Results are only available after the game ends');
    }
    const result = { leaderboard: room.getLeaderboard(), podium: room.getPodium() };
    if (room.isTeamMode()) {
      result.teamLeaderboard = room.getTeamLeaderboard();
      result.teamPodium = room.getTeamPodium();
    }
    return result;
  }

  async pauseGame({ pin, requesterId, timerRemainingMs = null, originalDurationMs = null }) {
    const room = await this._getRoomOrThrow(pin);
    // Build timer state only if there's remaining time (i.e. pausing from ANSWERING_PHASE)
    const timerState = (typeof timerRemainingMs === 'number' && timerRemainingMs > 0)
      ? { remainingMs: timerRemainingMs, originalDurationMs }
      : null;
    room.pause(requesterId, timerState);
    await this.roomRepository.save(room);
    return { room, pausedAt: room.pausedAt, pausedFromState: room.pausedFromState };
  }

  async resumeGame({ pin, requesterId }) {
    const room = await this._getRoomOrThrow(pin);
    const pauseDuration = room.getPauseDuration();
    const timerState = room.getPausedTimerState();
    room.resume(requesterId);
    await this.roomRepository.save(room);
    return {
      room,
      pauseDuration,
      resumedState: room.state,
      timerState,
      shouldAutoAdvance: room.state === RoomState.ANSWERING_PHASE ? room.shouldAutoAdvance() : false
    };
  }
}

module.exports = { GameFlowUseCases };
