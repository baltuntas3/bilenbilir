const { AnswerUseCases } = require('./AnswerUseCases');
const { GameFlowUseCases } = require('./GameFlowUseCases');
const { GameArchiveUseCases } = require('./GameArchiveUseCases');

/**
 * GameUseCases - Facade that delegates to focused use case classes
 * Maintained for backward compatibility with existing handlers
 */
class GameUseCases {
  constructor(roomRepository, quizRepository, gameSessionRepository = null) {
    this._answer = new AnswerUseCases(roomRepository, quizRepository);
    this._flow = new GameFlowUseCases(roomRepository, quizRepository);
    this._archive = new GameArchiveUseCases(roomRepository, quizRepository, gameSessionRepository);
    this.roomRepository = roomRepository;
  }

  cleanupExpiredLocks() {
    return {
      pendingAnswers: this._answer.cleanupExpiredLocks(),
      pendingArchives: 0
    };
  }

  get pendingAnswers() { return this._answer.pendingAnswers; }

  async roomExists(pin) { return await this.roomRepository.exists(pin); }

  async getNicknameForSocket(pin, socketId) {
    const room = await this.roomRepository.findByPin(pin);
    if (!room) return null;
    const player = room.getPlayer(socketId);
    if (player) return player.nickname;
    if (room.isHost(socketId)) return 'Host';
    const spectator = room.getSpectator?.(socketId);
    if (spectator) return spectator.nickname;
    return null;
  }

  // Game flow delegation
  startGame(params) { return this._flow.startGame(params); }
  startAnsweringPhase(params) {
    return this._flow.startAnsweringPhase({ ...params, pendingAnswers: this._answer.pendingAnswers });
  }
  endAnsweringPhase(params) { return this._flow.endAnsweringPhase(params); }
  showLeaderboard(params) { return this._flow.showLeaderboard(params); }
  nextQuestion(params) { return this._flow.nextQuestion(params); }
  getResults(params) { return this._flow.getResults(params); }
  pauseGame(params) { return this._flow.pauseGame(params); }
  resumeGame(params) { return this._flow.resumeGame(params); }

  // Answer delegation
  submitAnswer(params) { return this._answer.submitAnswer(params); }
  usePowerUp(params) { return this._answer.usePowerUp(params); }
  getServerElapsedTime(timerService, pin) { return this._answer.getServerElapsedTime(timerService, pin); }

  // Archive delegation
  archiveGame({ pin }) {
    return this._archive.archiveGame({ pin, pendingAnswers: this._answer.pendingAnswers });
  }
  saveInterruptedGame(params) { return this._archive.saveInterruptedGame(params); }
  saveAllInterruptedGames(reason) { return this._archive.saveAllInterruptedGames(reason); }
}

module.exports = { GameUseCases };
