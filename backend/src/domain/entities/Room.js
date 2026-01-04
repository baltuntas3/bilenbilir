/**
 * Room is the Aggregate Root for the game session.
 * All Player operations must go through Room.
 * External code should not modify Players directly.
 */

const { PIN } = require('../value-objects/PIN');
const { Nickname } = require('../value-objects/Nickname');
const { ValidationError, ForbiddenError, UnauthorizedError, ConflictError } = require('../../shared/errors');

const MAX_PLAYERS = 50;
const MAX_SPECTATORS = 10;
const MAX_STREAK = 1000; // Same as Player.js for consistency

const RoomState = {
  WAITING_PLAYERS: 'WAITING_PLAYERS',
  QUESTION_INTRO: 'QUESTION_INTRO',
  ANSWERING_PHASE: 'ANSWERING_PHASE',
  SHOW_RESULTS: 'SHOW_RESULTS',
  LEADERBOARD: 'LEADERBOARD',
  PAUSED: 'PAUSED',
  PODIUM: 'PODIUM'
};

// Valid state transitions map
const validTransitions = {
  [RoomState.WAITING_PLAYERS]: [RoomState.QUESTION_INTRO],
  [RoomState.QUESTION_INTRO]: [RoomState.ANSWERING_PHASE],
  [RoomState.ANSWERING_PHASE]: [RoomState.SHOW_RESULTS],
  [RoomState.SHOW_RESULTS]: [RoomState.LEADERBOARD],
  [RoomState.LEADERBOARD]: [RoomState.QUESTION_INTRO, RoomState.PODIUM, RoomState.PAUSED],
  [RoomState.PAUSED]: [RoomState.LEADERBOARD, RoomState.QUESTION_INTRO],
  [RoomState.PODIUM]: [] // Terminal state
};

class Room {
  static MAX_PLAYERS = MAX_PLAYERS;
  static MAX_SPECTATORS = MAX_SPECTATORS;

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
    this.spectators = [];
    this.bannedNicknames = [];
    this.hostDisconnectedAt = null;
    // Track all answers for archiving
    this.answerHistory = [];
    // Immutable quiz snapshot - set when game starts to prevent mid-game modifications
    this.quizSnapshot = null;
    // Track when game actually started (for accurate archiving)
    this.gameStartedAt = null;
    // Pause state tracking
    this.pausedAt = null;
    this.pausedFromState = null;
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

    // Check if nickname is banned
    if (this.isNicknameBanned(player.nickname)) {
      throw new ForbiddenError('This nickname is banned from this room');
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
   * Returns false if no connected players exist to prevent incorrect game advancement
   */
  haveAllPlayersAnswered() {
    const connectedPlayers = this.players.filter(p => !p.isDisconnected());
    // Return false if no connected players - game should not advance automatically
    if (connectedPlayers.length === 0) return false;
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

    // Validate totalQuestions parameter
    if (typeof totalQuestions !== 'number' || !Number.isInteger(totalQuestions) || totalQuestions < 1) {
      throw new ValidationError('totalQuestions must be a positive integer');
    }

    // Validate current index is within bounds before proceeding
    if (this.currentQuestionIndex < 0 || this.currentQuestionIndex >= totalQuestions) {
      throw new ValidationError(`currentQuestionIndex ${this.currentQuestionIndex} is out of bounds (0-${totalQuestions - 1})`);
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
   * Creates a snapshot of player answers to prevent race conditions during iteration
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

    // Validate isCorrectFn
    if (typeof isCorrectFn !== 'function') {
      throw new ValidationError('isCorrectFn must be a function');
    }

    const distribution = new Array(optionCount).fill(0);
    let correctCount = 0;
    let skippedCount = 0;

    // Create a snapshot of player answers to prevent race conditions
    // Capture answer data upfront before any processing
    const answerSnapshots = this.players
      .filter(player => player.hasAnswered() && player.answerAttempt)
      .map(player => ({
        nickname: player.nickname,
        answerIndex: player.answerAttempt.answerIndex
      }));

    // Process the snapshot (immutable data)
    for (const snapshot of answerSnapshots) {
      const idx = snapshot.answerIndex;

      // Validate answer index is within valid range
      if (typeof idx !== 'number' || !Number.isInteger(idx) || idx < 0 || idx >= distribution.length) {
        console.warn(`[Room ${this.pin}] Invalid answer index ${idx} from player ${snapshot.nickname} (expected 0-${distribution.length - 1})`);
        skippedCount++;
        continue;
      }

      distribution[idx]++;
      if (isCorrectFn(idx)) {
        correctCount++;
      }
    }

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
   * @param {number} answerData.optionCount - Number of options in question (required for validation)
   */
  recordAnswer(answerData) {
    // Validate required fields
    if (!answerData || typeof answerData !== 'object') {
      throw new ValidationError('Answer data is required');
    }
    // Validate playerId
    if (!answerData.playerId || typeof answerData.playerId !== 'string') {
      throw new ValidationError('Player ID is required and must be a string');
    }
    if (!answerData.playerNickname || typeof answerData.playerNickname !== 'string') {
      throw new ValidationError('Player nickname is required for answer record');
    }
    // Validate questionId
    if (!answerData.questionId || typeof answerData.questionId !== 'string') {
      throw new ValidationError('Question ID is required and must be a string');
    }
    if (typeof answerData.answerIndex !== 'number' || !Number.isInteger(answerData.answerIndex) || answerData.answerIndex < 0) {
      throw new ValidationError('Valid answer index is required');
    }
    // Validate optionCount is provided for bounds checking
    if (typeof answerData.optionCount !== 'number' || !Number.isInteger(answerData.optionCount) || answerData.optionCount < 2) {
      throw new ValidationError('optionCount is required and must be at least 2');
    }
    // Validate answer index is within valid range
    if (answerData.answerIndex >= answerData.optionCount) {
      throw new ValidationError(`Answer index ${answerData.answerIndex} is out of range (0-${answerData.optionCount - 1})`);
    }
    if (typeof answerData.isCorrect !== 'boolean') {
      throw new ValidationError('isCorrect must be a boolean');
    }

    // Sanitize streak with upper bound
    const safeStreak = Math.min(Math.max(0, answerData.streak || 0), MAX_STREAK);

    this.answerHistory.push({
      playerId: answerData.playerId,
      playerNickname: answerData.playerNickname,
      questionId: answerData.questionId,
      answerIndex: answerData.answerIndex,
      isCorrect: answerData.isCorrect,
      elapsedTimeMs: Math.max(0, answerData.elapsedTimeMs || 0),
      score: Math.max(0, answerData.score || 0),
      streak: safeStreak,
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

  // ==================== KICK/BAN METHODS ====================

  /**
   * Get player by ID
   * @param {string} playerId - Player ID
   * @returns {Player|null}
   */
  getPlayerById(playerId) {
    return this.players.find(p => p.id === playerId) || null;
  }

  /**
   * Kick a player from the room (host only)
   * @param {string} playerId - Player ID to kick
   * @param {string} requesterId - Socket ID of requester
   * @returns {Player} The kicked player
   */
  kickPlayer(playerId, requesterId) {
    if (!this.isHost(requesterId)) {
      throw new ForbiddenError('Only host can kick players');
    }

    const player = this.getPlayerById(playerId);
    if (!player) {
      throw new ValidationError('Player not found');
    }

    this.players = this.players.filter(p => p.id !== playerId);
    return player;
  }

  /**
   * Ban a player from the room (host only)
   * Kicks the player and adds their nickname to ban list
   * @param {string} playerId - Player ID to ban
   * @param {string} requesterId - Socket ID of requester
   * @returns {Player} The banned player
   */
  banPlayer(playerId, requesterId) {
    const player = this.kickPlayer(playerId, requesterId);

    // Add normalized nickname to ban list (using Player's VO method)
    const normalizedNickname = player.getNormalizedNickname();
    if (!this.bannedNicknames.includes(normalizedNickname)) {
      this.bannedNicknames.push(normalizedNickname);
    }

    return player;
  }

  /**
   * Normalize nickname for consistent comparisons
   * Uses Nickname VO when valid, falls back to toLowerCase for edge cases
   * @private
   */
  _normalizeNickname(nickname) {
    if (!nickname || typeof nickname !== 'string') {
      return '';
    }
    try {
      return new Nickname(nickname).normalized();
    } catch {
      // Fallback for invalid nicknames (shouldn't happen in normal flow)
      return nickname.toLowerCase().trim();
    }
  }

  /**
   * Check if a nickname is banned
   * @param {string} nickname - Nickname to check
   * @returns {boolean}
   */
  isNicknameBanned(nickname) {
    // Null/undefined check to prevent crash
    if (!nickname || typeof nickname !== 'string') {
      return false;
    }
    const normalizedNickname = this._normalizeNickname(nickname);
    return this.bannedNicknames.includes(normalizedNickname);
  }

  /**
   * Unban a nickname (host only)
   * @param {string} nickname - Nickname to unban
   * @param {string} requesterId - Socket ID of requester
   */
  unbanNickname(nickname, requesterId) {
    if (!this.isHost(requesterId)) {
      throw new ForbiddenError('Only host can unban players');
    }

    // Validate nickname
    if (!nickname || typeof nickname !== 'string') {
      throw new ValidationError('Valid nickname is required');
    }

    const normalizedNickname = this._normalizeNickname(nickname);
    this.bannedNicknames = this.bannedNicknames.filter(n => n !== normalizedNickname);
  }

  /**
   * Get list of banned nicknames
   * @returns {string[]}
   */
  getBannedNicknames() {
    return [...this.bannedNicknames];
  }

  // ==================== SPECTATOR METHODS ====================

  /**
   * Add a spectator to the room
   * @param {Spectator} spectator - Spectator to add
   */
  addSpectator(spectator) {
    if (this.spectators.length >= MAX_SPECTATORS) {
      throw new ValidationError(`Room is full (maximum ${MAX_SPECTATORS} spectators)`);
    }

    // Check if nickname is already taken by player or spectator (using VO methods)
    const nicknameExistsPlayer = this.players.some(p => p.hasNickname(spectator.nickname));
    const nicknameExistsSpectator = this.spectators.some(s => s.hasNickname(spectator.nickname));

    if (nicknameExistsPlayer || nicknameExistsSpectator) {
      throw new ConflictError('Nickname already taken');
    }

    this.spectators.push(spectator);
  }

  /**
   * Remove a spectator from the room
   * @param {string} socketId - Socket ID of spectator to remove
   */
  removeSpectator(socketId) {
    this.spectators = this.spectators.filter(s => s.socketId !== socketId);
  }

  /**
   * Get spectator by socket ID
   * @param {string} socketId - Socket ID
   * @returns {Spectator|null}
   */
  getSpectator(socketId) {
    return this.spectators.find(s => s.socketId === socketId) || null;
  }

  /**
   * Get spectator count
   * @returns {number}
   */
  getSpectatorCount() {
    return this.spectators.length;
  }

  /**
   * Get all spectators
   * @returns {Spectator[]}
   */
  getAllSpectators() {
    return [...this.spectators];
  }

  /**
   * Check if socket is a spectator
   * @param {string} socketId - Socket ID
   * @returns {boolean}
   */
  isSpectator(socketId) {
    return this.spectators.some(s => s.socketId === socketId);
  }

  /**
   * Get spectator by token
   * @param {string} spectatorToken - Spectator token
   * @returns {Spectator|null}
   */
  getSpectatorByToken(spectatorToken) {
    return this.spectators.find(s => s.spectatorToken === spectatorToken) || null;
  }

  /**
   * Mark spectator as disconnected
   * @param {string} socketId - Socket ID
   * @returns {Spectator|null} The disconnected spectator
   */
  setSpectatorDisconnected(socketId) {
    const spectator = this.getSpectator(socketId);
    if (spectator) {
      spectator.setDisconnected();
    }
    return spectator;
  }

  /**
   * Reconnect spectator with token validation
   * @param {string} spectatorToken - Spectator token
   * @param {string} newSocketId - New socket ID
   * @param {number|null} gracePeriodMs - Grace period in ms (null to skip check)
   * @param {string|null} newToken - New token for rotation
   * @returns {Spectator} The reconnected spectator
   */
  reconnectSpectator(spectatorToken, newSocketId, gracePeriodMs = null, newToken = null) {
    const spectator = this.getSpectatorByToken(spectatorToken);
    if (!spectator) {
      throw new UnauthorizedError('Invalid spectator token');
    }

    // Check if token has expired
    if (spectator.isTokenExpired()) {
      throw new UnauthorizedError('Spectator token has expired');
    }

    // Check if spectator exceeded grace period
    if (gracePeriodMs !== null && spectator.isDisconnected()) {
      const disconnectedDuration = spectator.getDisconnectedDuration();
      if (disconnectedDuration > gracePeriodMs) {
        throw new ForbiddenError('Reconnection timeout expired');
      }
    }

    // Rotate token on reconnect for security
    spectator.reconnect(newSocketId, newToken);
    return spectator;
  }

  /**
   * Remove spectators who have been disconnected longer than grace period
   * @param {number} gracePeriodMs - Grace period in milliseconds
   * @returns {Spectator[]} Removed spectators
   */
  removeStaleDisconnectedSpectators(gracePeriodMs) {
    const staleSpectators = this.spectators.filter(s =>
      s.isDisconnected() && s.getDisconnectedDuration() > gracePeriodMs
    );

    this.spectators = this.spectators.filter(s =>
      !s.isDisconnected() || s.getDisconnectedDuration() <= gracePeriodMs
    );

    return staleSpectators;
  }

  /**
   * Get all disconnected spectators
   * @returns {Spectator[]}
   */
  getDisconnectedSpectators() {
    return this.spectators.filter(s => s.isDisconnected());
  }

  /**
   * Get count of connected (non-disconnected) spectators
   * @returns {number}
   */
  getConnectedSpectatorCount() {
    return this.spectators.filter(s => !s.isDisconnected()).length;
  }

  // ==================== PAUSE/RESUME METHODS ====================

  /**
   * Pause the game (host only, only from LEADERBOARD state)
   * @param {string} requesterId - Socket ID of requester
   */
  pause(requesterId) {
    if (!this.isHost(requesterId)) {
      throw new ForbiddenError('Only host can pause the game');
    }

    if (this.state !== RoomState.LEADERBOARD) {
      throw new ValidationError('Game can only be paused from leaderboard');
    }

    this.pausedFromState = this.state;
    this.pausedAt = new Date();
    this.state = RoomState.PAUSED;
  }

  /**
   * Resume the game (host only)
   * @param {string} requesterId - Socket ID of requester
   */
  resume(requesterId) {
    if (!this.isHost(requesterId)) {
      throw new ForbiddenError('Only host can resume the game');
    }

    if (this.state !== RoomState.PAUSED) {
      throw new ValidationError('Game is not paused');
    }

    this.state = this.pausedFromState || RoomState.LEADERBOARD;
    this.pausedAt = null;
    this.pausedFromState = null;
  }

  /**
   * Check if game is paused
   * @returns {boolean}
   */
  isPaused() {
    return this.state === RoomState.PAUSED;
  }

  /**
   * Get pause duration in milliseconds
   * @returns {number}
   */
  getPauseDuration() {
    if (!this.pausedAt) return 0;
    return Date.now() - this.pausedAt.getTime();
  }
}

module.exports = { Room, RoomState };
