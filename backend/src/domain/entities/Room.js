/**
 * Room is the Aggregate Root for the game session.
 * All Player operations must go through Room.
 * External code should not modify Players directly.
 */

const { PIN } = require('../value-objects/PIN');

const RoomState = {
  WAITING_PLAYERS: 'WAITING_PLAYERS',
  QUESTION_INTRO: 'QUESTION_INTRO',
  ANSWERING_PHASE: 'ANSWERING_PHASE',
  SHOW_RESULTS: 'SHOW_RESULTS',
  LEADERBOARD: 'LEADERBOARD',
  PODIUM: 'PODIUM'
};

// Valid state transitions map
const validTransitions = {
  [RoomState.WAITING_PLAYERS]: [RoomState.QUESTION_INTRO],
  [RoomState.QUESTION_INTRO]: [RoomState.ANSWERING_PHASE],
  [RoomState.ANSWERING_PHASE]: [RoomState.SHOW_RESULTS],
  [RoomState.SHOW_RESULTS]: [RoomState.LEADERBOARD],
  [RoomState.LEADERBOARD]: [RoomState.QUESTION_INTRO, RoomState.PODIUM],
  [RoomState.PODIUM]: [] // Terminal state
};

class Room {
  constructor({ id, pin, hostId, hostToken, quizId, state = RoomState.WAITING_PLAYERS, currentQuestionIndex = 0, createdAt = new Date() }) {
    this.id = id;
    this._pin = pin instanceof PIN ? pin : new PIN(pin);
    this.hostId = hostId;
    this.hostToken = hostToken;
    this.quizId = quizId;
    this.state = state;
    this.currentQuestionIndex = currentQuestionIndex;
    this.createdAt = createdAt;
    this.players = [];
    this.hostDisconnectedAt = null;
  }

  get pin() {
    return this._pin.toString();
  }

  setHostDisconnected() {
    this.hostDisconnectedAt = new Date();
  }

  reconnectHost(newSocketId, token) {
    if (token !== this.hostToken) {
      throw new Error('Invalid host token');
    }
    this.hostId = newSocketId;
    this.hostDisconnectedAt = null;
  }

  isHostDisconnected() {
    return this.hostDisconnectedAt !== null;
  }

  getHostDisconnectedDuration() {
    if (!this.hostDisconnectedAt) return 0;
    return Date.now() - this.hostDisconnectedAt.getTime();
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

  setPlayerDisconnected(socketId) {
    const player = this.getPlayer(socketId);
    if (player) {
      player.setDisconnected();
    }
    return player;
  }

  getPlayer(socketId) {
    return this.players.find(p => p.socketId === socketId) || null;
  }

  getPlayerByToken(playerToken) {
    return this.players.find(p => p.playerToken === playerToken) || null;
  }

  reconnectPlayer(playerToken, newSocketId, gracePeriodMs = null) {
    const player = this.getPlayerByToken(playerToken);
    if (!player) {
      throw new Error('Invalid player token');
    }

    // Check if player exceeded grace period
    if (gracePeriodMs !== null && player.isDisconnected()) {
      const disconnectedDuration = player.getDisconnectedDuration();
      if (disconnectedDuration > gracePeriodMs) {
        throw new Error('Reconnection timeout expired');
      }
    }

    player.reconnect(newSocketId);
    return player;
  }

  /**
   * Remove players who have been disconnected longer than grace period
   * @param {number} gracePeriodMs - Grace period in milliseconds
   * @returns {Player[]} Removed players
   */
  removeStaleDisconnectedPlayers(gracePeriodMs) {
    const stalePlayers = this.players.filter(p =>
      p.isDisconnected() && p.getDisconnectedDuration() > gracePeriodMs
    );

    this.players = this.players.filter(p =>
      !p.isDisconnected() || p.getDisconnectedDuration() <= gracePeriodMs
    );

    return stalePlayers;
  }

  /**
   * Get all disconnected players
   */
  getDisconnectedPlayers() {
    return this.players.filter(p => p.isDisconnected());
  }

  getPlayerCount() {
    return this.players.length;
  }

  getAllPlayers() {
    return [...this.players];
  }

  /**
   * Clear all player answer attempts for new question
   * Maintains Aggregate Root encapsulation
   */
  clearAllAnswerAttempts() {
    this.players.forEach(player => {
      player.clearAnswerAttempt();
    });
  }

  /**
   * Check if all players have answered
   */
  haveAllPlayersAnswered() {
    return this.players.every(p => p.hasAnswered());
  }

  /**
   * Get count of players who have answered
   */
  getAnsweredCount() {
    return this.players.filter(p => p.hasAnswered()).length;
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
    const allowedTransitions = validTransitions[this.state];
    if (!allowedTransitions || !allowedTransitions.includes(newState)) {
      throw new Error(`Invalid state transition: ${this.state} → ${newState}`);
    }
    this.state = newState;
  }

  /**
   * Get answer distribution for current question
   * @param {number} optionCount - Number of options in the question
   * @returns {{ distribution: number[], correctCount: number }} Distribution array and correct answer count
   */
  getAnswerDistribution(optionCount, isCorrectFn) {
    const distribution = new Array(optionCount).fill(0);
    let correctCount = 0;

    this.players.forEach(player => {
      if (player.hasAnswered()) {
        const idx = player.answerAttempt.answerIndex;
        if (idx >= 0 && idx < distribution.length) {
          distribution[idx]++;
        }
        if (isCorrectFn(idx)) {
          correctCount++;
        }
      }
    });

    return { distribution, correctCount };
  }

  getLeaderboard() {
    return [...this.players].sort((a, b) => b.score - a.score);
  }

  getPodium() {
    return this.getLeaderboard().slice(0, 3);
  }
}

module.exports = { Room, RoomState };
