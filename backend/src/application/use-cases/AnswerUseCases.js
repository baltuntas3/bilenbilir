const { SharedUseCases } = require('./SharedUseCases');
const { LockManager } = require('../../shared/utils/LockManager');
const { RoomState } = require('../../domain/entities');
const { Answer, PowerUpType, powerUpRegistry, MAX_ANSWER_SCORE } = require('../../domain/value-objects');
const { NotFoundError, ValidationError, ConflictError } = require('../../shared/errors');
const { ANSWER_LOCK_TIMEOUT_MS } = require('../../shared/config/constants');

class AnswerUseCases extends SharedUseCases {
  constructor(roomRepository, quizRepository) {
    super(roomRepository, quizRepository);
    this.pendingAnswers = new LockManager(ANSWER_LOCK_TIMEOUT_MS);
  }

  cleanupExpiredLocks() {
    return this.pendingAnswers.cleanupExpired();
  }

  async submitAnswer({ pin, socketId, answerIndex, elapsedTimeMs, effectiveTimeLimitMs = null }) {
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
      if (room.state !== RoomState.ANSWERING_PHASE) throw new ConflictError('Not in answering phase');

      const player = room.getPlayer(socketId);
      if (!player) throw new NotFoundError('Player not found');
      if (player.isDisconnected()) throw new ValidationError('Disconnected players cannot submit answers');
      if (player.hasAnswered()) throw new ConflictError('Already answered');

      const currentQuestion = this._getQuestionFromSnapshot(room, room.currentQuestionIndex);
      if (!currentQuestion.options || !Array.isArray(currentQuestion.options) || currentQuestion.options.length === 0) {
        throw new ValidationError('Question has invalid or missing options');
      }
      if (answerIndex >= currentQuestion.options.length) throw new ValidationError('Answer index out of bounds');

      const streakBeforeAnswer = player.streak;
      const answer = Answer.create({
        playerId: player.id,
        questionId: currentQuestion.id,
        roomPin: pin,
        answerIndex,
        question: currentQuestion,
        elapsedTimeMs: validElapsedTime,
        currentStreak: streakBeforeAnswer,
        effectiveTimeLimitMs
      });

      player.submitAnswer(answerIndex, validElapsedTime);
      let actualScore = 0;
      const hasDoublePoints = player.hasActivePowerUp(PowerUpType.DOUBLE_POINTS);
      // Clear active power-up immediately after checking — it's been consumed
      player.clearActivePowerUp();

      if (answer.isCorrect) {
        player.incrementStreak();
        const baseScore = answer.score;
        const streakBonus = answer.streakBonus;
        if (hasDoublePoints) {
          // Design note: DOUBLE_POINTS is intentionally applied here in the use-case layer
          // rather than inside Answer (domain value object). Moving it into Answer or Question
          // would require passing power-up state into value objects, breaking their purity.
          // The current approach keeps domain objects free of power-up concerns while the
          // use-case layer orchestrates the interaction between Answer scoring and power-ups.
          // Only double the base score; streak bonus is a fixed reward, not subject to multipliers
          actualScore = Math.min(baseScore * 2 + streakBonus, MAX_ANSWER_SCORE);
        } else {
          actualScore = answer.getTotalScore();
        }
        player.addScore(actualScore);
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
        score: actualScore,
        streak: streakBeforeAnswer,
        streakBonus: answer.streakBonus,
        optionCount: currentQuestion.options.length
      });

      await this.roomRepository.save(room);
      return {
        answer,
        player,
        actualScore,
        allAnswered: room.haveAllPlayersAnswered(),
        answeredCount: room.getAnsweredCount(),
        totalPlayers: room.answeringPhasePlayerCount,
        connectedPlayerCount: room.getConnectedPlayerCount()
      };
    });
  }

  async usePowerUp({ pin, socketId, powerUpType }) {
    // Use same lock key as submitAnswer to prevent race condition where
    // power-up is consumed but not applied because answer runs concurrently
    const playerKey = `${pin}:${socketId}`;
    return this.pendingAnswers.withLock(playerKey, 'Power-up usage in progress', async () => {
      const room = await this._getRoomOrThrow(pin);
      if (room.state !== RoomState.ANSWERING_PHASE) throw new ValidationError('Power-ups can only be used during answering phase');

      const player = room.getPlayer(socketId);
      if (!player) throw new NotFoundError('Player not found');
      if (player.isDisconnected()) throw new ValidationError('Disconnected players cannot use power-ups');
      if (player.hasAnswered()) throw new ConflictError('Cannot use power-up after answering');

      // Validate power-up count BEFORE executing to prevent using unavailable power-ups
      if (player.getPowerUpCount(powerUpType) <= 0) {
        throw new ValidationError(`No ${powerUpType} power-up remaining`);
      }

      const currentQuestion = this._getQuestionFromSnapshot(room, room.currentQuestionIndex);
      const { result, emitActions } = powerUpRegistry.execute(powerUpType, { room, socketId, currentQuestion });

      // Decrement after successful execution
      player.usePowerUp(powerUpType);
      result.nickname = player.nickname;

      await this.roomRepository.save(room);
      return { result, emitActions };
    });
  }

  async refundPowerUp({ pin, socketId, powerUpType }) {
    if (!pin || !socketId || !powerUpType) return;
    const room = await this._getRoomOrThrow(pin);
    const player = room.getPlayer(socketId);
    if (!player) return;
    // refundPowerUp validates powerUpType internally via PowerUpType check
    player.refundPowerUp(powerUpType);
    await this.roomRepository.save(room);
  }

  getServerElapsedTime(timerService, pin) {
    const elapsedTimeMs = timerService.getElapsedTime(pin);
    if (elapsedTimeMs === null || timerService.isTimeExpired(pin)) {
      throw new ValidationError('Time expired');
    }
    // Cap elapsed time to timer duration to prevent score underflow
    const timerSync = timerService.getTimerSync(pin);
    const maxTime = timerSync?.duration || Infinity;
    return Math.min(elapsedTimeMs, maxTime);
  }
}

module.exports = { AnswerUseCases };
