/**
 * Room is the Aggregate Root for the game session.
 * All Player operations must go through Room.
 * External code should not modify Players directly.
 */

const RoomState = {
  IDLE: 'IDLE',
  WAITING_PLAYERS: 'WAITING_PLAYERS',
  GAME_STARTING: 'GAME_STARTING',
  QUESTION_INTRO: 'QUESTION_INTRO',
  ANSWERING_PHASE: 'ANSWERING_PHASE',
  CALCULATING: 'CALCULATING',
  SHOW_RESULTS: 'SHOW_RESULTS',
  LEADERBOARD: 'LEADERBOARD',
  PODIUM: 'PODIUM',
  ARCHIVED: 'ARCHIVED'
};

class Room {
  constructor({ id, pin, hostId, quizId, state = RoomState.IDLE, currentQuestionIndex = 0, createdAt = new Date() }) {
    this.id = id;
    this.pin = pin;
    this.hostId = hostId;
    this.quizId = quizId;
    this.state = state;
    this.currentQuestionIndex = currentQuestionIndex;
    this.createdAt = createdAt;
    this.players = [];
  }

  addPlayer(player) {
    if (this.state !== RoomState.WAITING_PLAYERS) {
      throw new Error('Players can only join during lobby phase');
    }

    const nicknameExists = this.players.some(p => p.nickname.toLowerCase() === player.nickname.toLowerCase());
    if (nicknameExists) {
      throw new Error('Nickname already taken');
    }

    this.players.push(player);
  }

  removePlayer(socketId) {
    this.players = this.players.filter(p => p.socketId !== socketId);
  }

  getPlayer(socketId) {
    return this.players.find(p => p.socketId === socketId) || null;
  }

  getPlayerCount() {
    return this.players.length;
  }

  getAllPlayers() {
    return [...this.players];
  }

  isHost(socketId) {
    return this.hostId === socketId;
  }

  startGame(requesterId) {
    if (!this.isHost(requesterId)) {
      throw new Error('Only host can start the game');
    }
    if (this.state !== RoomState.WAITING_PLAYERS) {
      throw new Error('Game can only start from lobby');
    }
    if (this.players.length === 0) {
      throw new Error('At least one player required');
    }
    this.state = RoomState.GAME_STARTING;
  }

  nextQuestion(requesterId, totalQuestions) {
    if (!this.isHost(requesterId)) {
      throw new Error('Only host can advance questions');
    }
    if (this.currentQuestionIndex >= totalQuestions - 1) {
      this.state = RoomState.PODIUM;
      return false;
    }
    this.currentQuestionIndex++;
    this.state = RoomState.QUESTION_INTRO;
    return true;
  }

  setState(newState) {
    this.state = newState;
  }

  getLeaderboard() {
    return [...this.players].sort((a, b) => b.score - a.score);
  }

  getPodium() {
    return this.getLeaderboard().slice(0, 3);
  }
}

module.exports = { Room, RoomState };
