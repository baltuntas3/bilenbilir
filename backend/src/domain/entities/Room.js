/**
 * Room is the Aggregate Root for the game session.
 * All Player operations must go through Room.
 * External code should not modify Players directly.
 */

const { PIN } = require('../value-objects/PIN');
const { ValidationError, ForbiddenError, UnauthorizedError, ConflictError } = require('../../shared/errors');

const MAX_PLAYERS = 50;

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
  static MAX_PLAYERS = MAX_PLAYERS;

  constructor({ id, pin, hostId, hostUserId, hostToken, quizId, state = RoomState.WAITING_PLAYERS, currentQuestionIndex = 0, createdAt = new Date() }) {
    this.id = id;
    this._pin = pin instanceof PIN ? pin : new PIN(pin);
    this.hostId = hostId; // Socket ID (changes on reconnect)
    this.hostUserId = hostUserId; // MongoDB User ID (persistent, for archiving)
    this.hostToken = hostToken;
    this.quizId = quizId;
    this.state = state;
    // Validate currentQuestionIndex is a non-negative integer
    if (typeof currentQuestionIndex !== 'number' || !Number.isInteger(currentQuestionIndex) || currentQuestionIndex < 0) {
      throw new ValidationError('currentQuestionIndex must be a non-negative integer');
    }
    this.currentQuestionIndex = currentQuestionIndex;
    this.createdAt = createdAt;
    this.players = [];
    this.hostDisconnectedAt = null;
    // Track all answers for archiving
    this.answerHistory = [];
    // Immutable quiz snapshot - set when game starts to prevent mid-game modifications
    this.quizSnapshot = null;
    // Track when game actually started (for accurate archiving)
    this.gameStartedAt = null;
  }

  /**
   * Set the quiz snapshot when game starts
   * This creates an immutable copy that won't be affected by quiz modifications
   * Also records the game start time for accurate archiving
   * @param {Quiz} quiz - The quiz to snapshot (should be a cloned copy)
   */
  setQuizSnapshot(quiz) {
    if (this.quizSnapshot !== null) {
      throw new ValidationError('Quiz snapshot already set');
    }
    this.quizSnapshot = quiz;
    this.gameStartedAt = new Date();
  }

  /**
   * Get when the game started (quiz snapshot was set)
   * @returns {Date|null}
   */
  getGameStartedAt() {
    return this.gameStartedAt;
  }

  /**
   * Get the quiz snapshot for game operations
   * @returns {Quiz|null} The frozen quiz or null if game hasn't started
   */
  getQuizSnapshot() {
    return this.quizSnapshot;
  }

  /**
   * Check if game has a quiz snapshot
   */
  hasQuizSnapshot() {
    return this.quizSnapshot !== null;
  }

  get pin() {
    return this._pin.toString();
  }

  setHostDisconnected() {
    this.hostDisconnectedAt = new Date();
  }

  /**
   * Reconnect host with token validation and optional grace period check
   * @param {string} newSocketId - New socket ID for the host
   * @param {string} token - Host token for authentication
   * @param {number|null} gracePeriodMs - Optional grace period in ms (null to skip check)
   * @throws {UnauthorizedError} If token is invalid or missing
   * @throws {ForbiddenError} If grace period has expired
   */
  reconnectHost(newSocketId, token, gracePeriodMs = null) {
    // Validate token is provided and non-empty
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      throw new UnauthorizedError('Host token is required');
    }

    // Validate stored host token exists
    if (!this.hostToken) {
      throw new UnauthorizedError('Room has no host token configured');
    }

    // Validate token matches
    if (token !== this.hostToken) {
      throw new UnauthorizedError('Invalid host token');
    }

    // Validate newSocketId is provided
    if (!newSocketId || typeof newSocketId !== 'string') {
      throw new ValidationError('Valid socket ID is required for reconnection');
    }

    // Check grace period if specified and host was disconnected
    if (gracePeriodMs !== null && this.isHostDisconnected()) {
      const disconnectedDuration = this.getHostDisconnectedDuration();
      if (disconnectedDuration > gracePeriodMs) {
        throw new ForbiddenError('Host reconnection timeout expired');
      }
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
      throw new ValidationError('Players can only join during lobby phase');
    }

    if (this.players.length >= MAX_PLAYERS) {
      throw new ValidationError(`Room is full (maximum ${MAX_PLAYERS} players)`);
    }

    // Use Player's VO-backed case-insensitive comparison
    const nicknameExists = this.players.some(p => p.hasNickname(player.nickname));
    if (nicknameExists) {
      throw new ConflictError('Nickname already taken');
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

  reconnectPlayer(playerToken, newSocketId, gracePeriodMs = null, newToken = null) {
    const player = this.getPlayerByToken(playerToken);
    if (!player) {
      throw new UnauthorizedError('Invalid player token');
    }

    // Check if token has expired
    if (player.isTokenExpired()) {
      throw new UnauthorizedError('Player token has expired');
    }

    // Check if player exceeded grace period
    if (gracePeriodMs !== null && player.isDisconnected()) {
      const disconnectedDuration = player.getDisconnectedDuration();
      if (disconnectedDuration > gracePeriodMs) {
        throw new ForbiddenError('Reconnection timeout expired');
      }
    }

    // Rotate token on reconnect for security
    player.reconnect(newSocketId, newToken);
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

  /**
   * Get count of connected (non-disconnected) players
   */
  getConnectedPlayerCount() {
    return this.players.filter(p => !p.isDisconnected()).length;
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
   * Check if all connected players have answered
   * Disconnected players are excluded from this check
   */
  haveAllPlayersAnswered() {
    const connectedPlayers = this.players.filter(p => !p.isDisconnected());
    if (connectedPlayers.length === 0) return true;
    return connectedPlayers.every(p => p.hasAnswered());
  }

  /**
   * Get count of connected players who have answered
   */
  getAnsweredCount() {
    return this.players.filter(p => !p.isDisconnected() && p.hasAnswered()).length;
  }

  isHost(socketId) {
    return this.hostId === socketId;
  }

  startGame(requesterId) {
    if (!this.isHost(requesterId)) {
      throw new ForbiddenError('Only host can start the game');
    }
    if (this.state !== RoomState.WAITING_PLAYERS) {
      throw new ValidationError('Game can only start from lobby');
    }
    if (this.players.length === 0) {
      throw new ValidationError('At least one player required');
    }
  }

  nextQuestion(requesterId, totalQuestions) {
    if (!this.isHost(requesterId)) {
      throw new ForbiddenError('Only host can advance questions');
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
      throw new ValidationError(`Invalid state transition: ${this.state} → ${newState}`);
    }
    this.state = newState;
  }

  /**
   * Get answer distribution for current question
   * @param {number} optionCount - Number of options in the question
   * @param {Function} isCorrectFn - Function to check if answer index is correct
   * @returns {{ distribution: number[], correctCount: number, skippedCount: number }} Distribution array, correct answer count, and count of invalid answers skipped
   */
  getAnswerDistribution(optionCount, isCorrectFn) {
    // Validate optionCount
    if (typeof optionCount !== 'number' || !Number.isInteger(optionCount) || optionCount < 1) {
      throw new ValidationError('optionCount must be a positive integer');
    }
    if (optionCount > 100) {
      throw new ValidationError('optionCount exceeds maximum allowed value');
    }

    const distribution = new Array(optionCount).fill(0);
    let correctCount = 0;
    let skippedCount = 0;

    this.players.forEach(player => {
      if (player.hasAnswered()) {
        const idx = player.answerAttempt.answerIndex;

        // Validate answer index is within valid range
        if (typeof idx !== 'number' || idx < 0 || idx >= distribution.length) {
          // Log corrupted/invalid answer data for debugging
          console.warn(`[Room ${this.pin}] Invalid answer index ${idx} from player ${player.nickname} (expected 0-${distribution.length - 1})`);
          skippedCount++;
          return;
        }

        distribution[idx]++;
        if (isCorrectFn(idx)) {
          correctCount++;
        }
      }
    });

    return { distribution, correctCount, skippedCount };
  }

  getLeaderboard() {
    return [...this.players].sort((a, b) => b.score - a.score);
  }

  getPodium() {
    return this.getLeaderboard().slice(0, 3);
  }

  /**
   * Record an answer for archiving
   * Validates required fields to ensure data integrity
   * @param {object} answerData - Answer data to record
   * @param {string} answerData.playerId - Player ID
   * @param {string} answerData.playerNickname - Player nickname
   * @param {string} answerData.questionId - Question ID
   * @param {number} answerData.answerIndex - Selected answer index
   * @param {boolean} answerData.isCorrect - Whether answer was correct
   * @param {number} answerData.elapsedTimeMs - Response time in milliseconds
   * @param {number} answerData.score - Points earned
   * @param {number} [answerData.streak] - Current streak (optional)
   */
  recordAnswer(answerData) {
    // Validate required fields
    if (!answerData || typeof answerData !== 'object') {
      throw new ValidationError('Answer data is required');
    }
    if (!answerData.playerNickname || typeof answerData.playerNickname !== 'string') {
      throw new ValidationError('Player nickname is required for answer record');
    }
    if (typeof answerData.answerIndex !== 'number' || answerData.answerIndex < 0) {
      throw new ValidationError('Valid answer index is required');
    }
    if (typeof answerData.isCorrect !== 'boolean') {
      throw new ValidationError('isCorrect must be a boolean');
    }

    this.answerHistory.push({
      playerId: answerData.playerId,
      playerNickname: answerData.playerNickname,
      questionId: answerData.questionId,
      answerIndex: answerData.answerIndex,
      isCorrect: answerData.isCorrect,
      elapsedTimeMs: Math.max(0, answerData.elapsedTimeMs || 0),
      score: Math.max(0, answerData.score || 0),
      streak: Math.max(0, answerData.streak || 0),
      questionIndex: this.currentQuestionIndex,
      timestamp: new Date()
    });
  }

  /**
   * Get all recorded answers for archiving
   */
  getAnswerHistory() {
    return [...this.answerHistory];
  }
}

module.exports = { Room, RoomState };
