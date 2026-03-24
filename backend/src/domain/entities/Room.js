/**
 * Room is the Aggregate Root for the game session.
 * All Player operations must go through Room.
 * External code should not modify Players directly.
 */

const { PIN } = require('../value-objects/PIN');
const { Nickname } = require('../value-objects/Nickname');
const { ValidationError, ForbiddenError, UnauthorizedError, ConflictError } = require('../../shared/errors');
const { MAX_PLAYERS, MAX_SPECTATORS, MAX_STREAK } = require('../../shared/config/constants');
const { SpectatorManager } = require('./SpectatorManager');
const { TeamManager } = require('./TeamManager');
const { PauseManager } = require('./PauseManager');

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
  [RoomState.SHOW_RESULTS]: [RoomState.LEADERBOARD, RoomState.PAUSED],
  [RoomState.LEADERBOARD]: [RoomState.QUESTION_INTRO, RoomState.PODIUM, RoomState.PAUSED],
  [RoomState.PAUSED]: [RoomState.LEADERBOARD, RoomState.SHOW_RESULTS],
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
    this.bannedNicknames = [];
    this.hostDisconnectedAt = null;
    // Track all answers for archiving
    this.answerHistory = [];
    // Immutable quiz snapshot - set when game starts to prevent mid-game modifications
    this.quizSnapshot = null;
    // Track when game actually started (for accurate archiving)
    this.gameStartedAt = null;
    // Track when game reached PODIUM state (for cleanup timeout)
    this.podiumReachedAt = null;
    // Managers for delegated concerns
    this._spectatorManager = new SpectatorManager();
    this._teamManager = new TeamManager();
    this._pauseManager = new PauseManager();
    // Lightning round
    this.lightningRound = { enabled: false, questionCount: 3 };
    // Snapshot of connected player count at the start of answering phase
    // Used for consistent progress reporting (answeredCount / totalPlayersInPhase)
    this.answeringPhasePlayerCount = 0;
  }

  // Backward compatibility getters for managers' internal state
  get spectators() { return this._spectatorManager.spectators; }
  get teams() { return this._teamManager.teams; }
  get teamMode() { return this._teamManager.teamMode; }
  get pausedAt() { return this._pauseManager.pausedAt; }
  get pausedFromState() { return this._pauseManager.pausedFromState; }

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
   * Get when the game reached PODIUM state
   * @returns {Date|null}
   */
  getPodiumReachedAt() {
    return this.podiumReachedAt;
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
  reconnectHost(newSocketId, token, gracePeriodMs = null, newToken = null) {
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
    // Rotate token on reconnect for security (same pattern as player/spectator)
    if (newToken) {
      this.hostToken = newToken;
    }
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
    const player = this.getPlayer(socketId);
    if (player) {
      this._teamManager.removePlayer(player.id);
    }
    this.players = this.players.filter(p => p.socketId !== socketId);
    return player || null;
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
    return this.players.find(p => p.token === playerToken) || null;
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

    if (stalePlayers.length > 0) {
      // Remove team assignments for stale players
      for (const player of stalePlayers) {
        this._teamManager.removePlayer(player.id);
      }

      this.players = this.players.filter(p =>
        !p.isDisconnected() || p.getDisconnectedDuration() <= gracePeriodMs
      );

      // answeringPhasePlayerCount is intentionally NOT decremented here.
      // It is a snapshot taken at phase start for consistent progress reporting.
    }

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
   * Reset player answers between questions (e.g. when entering QUESTION_INTRO).
   * Does NOT update answeringPhasePlayerCount — that is only set when entering ANSWERING_PHASE.
   */
  resetPlayerAnswersForNextQuestion() {
    this.players.forEach(player => {
      player.clearAnswerAttempt();
    });
  }

  /**
   * Clear all player answer attempts and snapshot connected player count for answering phase.
   * Maintains Aggregate Root encapsulation.
   */
  clearAllAnswerAttempts() {
    this.answeringPhasePlayerCount = this.getConnectedPlayerCount();
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
   * Get count of connected players who have answered (used for auto-advance checks)
   */
  getAnsweredCount() {
    return this.players.filter(p => !p.isDisconnected() && p.hasAnswered()).length;
  }

  /**
   * Get count of all players who have answered, including disconnected (used for reporting)
   */
  getTotalAnsweredCount() {
    return this.players.filter(p => p.hasAnswered()).length;
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

    // Enforce valid state — nextQuestion only allowed from LEADERBOARD
    if (this.state !== RoomState.LEADERBOARD) {
      throw new ValidationError(`Cannot advance question from ${this.state} state (must be in LEADERBOARD)`);
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
      this.setState(RoomState.PODIUM);
      return false;
    }
    this.currentQuestionIndex++;
    this.setState(RoomState.QUESTION_INTRO);
    return true;
  }

  setState(newState) {
    const allowedTransitions = validTransitions[this.state];
    if (!allowedTransitions || !allowedTransitions.includes(newState)) {
      throw new ValidationError(`Invalid state transition: ${this.state} \u2192 ${newState}`);
    }
    this.state = newState;
    if (newState === RoomState.PODIUM) {
      this.podiumReachedAt = new Date();
    }
  }

  /**
   * Get answer distribution for current question
   * Creates a snapshot of player answers to prevent race conditions during iteration
   * @param {number} optionCount - Number of options in the question
   * @param {Function} isCorrectFn - Function to check if answer index is correct
   * @returns {{ distribution: number[], correctCount: number, skippedCount: number, unansweredCount: number }}
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

    const unansweredCount = this.players.filter(p => !p.isDisconnected() && !p.hasAnswered()).length;

    return { distribution, correctCount, skippedCount, unansweredCount };
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
   */
  recordAnswer(answerData) {
    // Validate required fields
    if (!answerData || typeof answerData !== 'object') {
      throw new ValidationError('Answer data is required');
    }
    if (!answerData.playerId || typeof answerData.playerId !== 'string') {
      throw new ValidationError('Player ID is required and must be a string');
    }
    if (!answerData.playerNickname || typeof answerData.playerNickname !== 'string') {
      throw new ValidationError('Player nickname is required for answer record');
    }
    if (!answerData.questionId || typeof answerData.questionId !== 'string') {
      throw new ValidationError('Question ID is required and must be a string');
    }
    if (typeof answerData.answerIndex !== 'number' || !Number.isInteger(answerData.answerIndex) || answerData.answerIndex < 0) {
      throw new ValidationError('Valid answer index is required');
    }
    if (typeof answerData.optionCount !== 'number' || !Number.isInteger(answerData.optionCount) || answerData.optionCount < 2) {
      throw new ValidationError('optionCount is required and must be at least 2');
    }
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

  // ==================== POWER-UP METHODS ====================

  /**
   * Get indices of 2 random wrong options for 50:50 power-up
   */
  getFiftyFiftyOptions(socketId, correctAnswerIndex, optionCount) {
    const player = this.getPlayer(socketId);
    if (!player) {
      throw new ValidationError('Player not found');
    }
    if (player.hasAnswered()) {
      throw new ValidationError('Cannot use power-up after answering');
    }

    // Build list of wrong option indices
    const wrongIndices = [];
    for (let i = 0; i < optionCount; i++) {
      if (i !== correctAnswerIndex) {
        wrongIndices.push(i);
      }
    }

    // Always leave at least 1 wrong option so 50:50 doesn't reveal the answer
    const maxToEliminate = Math.max(0, wrongIndices.length - 1);
    const eliminateCount = Math.min(2, maxToEliminate);

    if (eliminateCount === 0) {
      throw new ValidationError('50:50 cannot be used on questions with 2 or fewer options');
    }

    // Shuffle and pick
    for (let i = wrongIndices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [wrongIndices[i], wrongIndices[j]] = [wrongIndices[j], wrongIndices[i]];
    }

    return wrongIndices.slice(0, eliminateCount);
  }

  // ==================== KICK/BAN METHODS ====================

  getPlayerById(playerId) {
    return this.players.find(p => p.id === playerId) || null;
  }

  kickPlayer(playerId, requesterId) {
    if (!this.isHost(requesterId)) {
      throw new ForbiddenError('Only host can kick players');
    }

    const player = this.getPlayerById(playerId);
    if (!player) {
      throw new ValidationError('Player not found');
    }

    this._teamManager.removePlayer(playerId);
    this.players = this.players.filter(p => p.id !== playerId);
    return player;
  }

  banPlayer(playerId, requesterId) {
    const player = this.kickPlayer(playerId, requesterId);

    const normalizedNickname = player.getNormalizedNickname();
    if (!this.bannedNicknames.includes(normalizedNickname)) {
      this.bannedNicknames.push(normalizedNickname);
    }

    return player;
  }

  _normalizeNickname(nickname) {
    if (!nickname || typeof nickname !== 'string') {
      return '';
    }
    try {
      return new Nickname(nickname).normalized();
    } catch {
      // Invalid nicknames cannot be normalized consistently — return empty
      // to avoid mismatches between ban check and Nickname VO validation
      return '';
    }
  }

  isNicknameBanned(nickname) {
    if (!nickname || typeof nickname !== 'string') {
      return false;
    }
    const normalizedNickname = this._normalizeNickname(nickname);
    return this.bannedNicknames.includes(normalizedNickname);
  }

  unbanNickname(nickname, requesterId) {
    if (!this.isHost(requesterId)) {
      throw new ForbiddenError('Only host can unban players');
    }

    if (!nickname || typeof nickname !== 'string') {
      throw new ValidationError('Valid nickname is required');
    }

    const normalizedNickname = this._normalizeNickname(nickname);
    this.bannedNicknames = this.bannedNicknames.filter(n => n !== normalizedNickname);
  }

  getBannedNicknames() {
    return [...this.bannedNicknames];
  }

  // ==================== SPECTATOR METHODS (delegated to SpectatorManager) ====================

  addSpectator(spectator) {
    if (this.state === RoomState.PODIUM) {
      throw new ValidationError('Spectators cannot join a finished game');
    }
    this._spectatorManager.add(spectator, this.players, this.bannedNicknames);
  }

  removeSpectator(socketId) {
    return this._spectatorManager.remove(socketId);
  }

  getSpectator(socketId) {
    return this._spectatorManager.getBySocketId(socketId);
  }

  getSpectatorCount() {
    return this._spectatorManager.getCount();
  }

  getAllSpectators() {
    return this._spectatorManager.getAll();
  }

  isSpectator(socketId) {
    return this._spectatorManager.isSpectator(socketId);
  }

  getSpectatorByToken(spectatorToken) {
    return this._spectatorManager.getByToken(spectatorToken);
  }

  setSpectatorDisconnected(socketId) {
    return this._spectatorManager.setDisconnected(socketId);
  }

  reconnectSpectator(spectatorToken, newSocketId, gracePeriodMs = null, newToken = null) {
    return this._spectatorManager.reconnect(spectatorToken, newSocketId, gracePeriodMs, newToken);
  }

  removeStaleDisconnectedSpectators(gracePeriodMs) {
    return this._spectatorManager.removeStaleDisconnected(gracePeriodMs);
  }

  getDisconnectedSpectators() {
    return this._spectatorManager.getDisconnected();
  }

  getConnectedSpectatorCount() {
    return this._spectatorManager.getConnectedCount();
  }

  // ==================== PAUSE/RESUME METHODS (delegated to PauseManager) ====================

  pause(requesterId) {
    const { pausedState, fromState } = this._pauseManager.pause(
      this.state,
      this.isHost(requesterId),
      [RoomState.LEADERBOARD, RoomState.SHOW_RESULTS],
      RoomState.PAUSED
    );
    // setState validates the transition — if it throws, no pause state is written
    this.setState(pausedState);
    this._pauseManager.applyPause(fromState);
  }

  resume(requesterId) {
    const resumeState = this._pauseManager.resume(
      this.state,
      this.isHost(requesterId),
      RoomState.PAUSED,
      RoomState.LEADERBOARD
    );
    // setState validates the transition — if it throws, pause state is preserved
    this.setState(resumeState);
    this._pauseManager.applyResume();
  }

  isPaused() {
    return this._pauseManager.isPaused(this.state, RoomState.PAUSED);
  }

  getPauseDuration() {
    return this._pauseManager.getDuration();
  }

  // ==================== LIGHTNING ROUND METHODS ====================

  setLightningRound(enabled, questionCount) {
    if (this.state !== RoomState.WAITING_PLAYERS) {
      throw new ValidationError('Lightning round can only be configured in lobby');
    }
    if (typeof enabled !== 'boolean') {
      throw new ValidationError('enabled must be a boolean');
    }
    if (enabled) {
      if (typeof questionCount !== 'number' || !Number.isInteger(questionCount) || questionCount < 1 || questionCount > 10) {
        throw new ValidationError('Lightning round question count must be between 1 and 10');
      }
    }
    this.lightningRound = { enabled: !!enabled, questionCount: enabled ? questionCount : this.lightningRound.questionCount };
  }

  isLightningQuestion(currentIndex, totalQuestions) {
    if (!this.lightningRound.enabled) return false;
    // Clamp to 0 to prevent all questions becoming lightning when questionCount > totalQuestions
    const lightningStart = Math.max(0, totalQuestions - this.lightningRound.questionCount);
    return currentIndex >= lightningStart;
  }

  getLightningConfig() {
    return { ...this.lightningRound };
  }

  // ==================== TEAM MODE METHODS (delegated to TeamManager) ====================

  enableTeamMode() {
    if (this.state !== RoomState.WAITING_PLAYERS) {
      throw new ValidationError('Team mode can only be changed in lobby');
    }
    this._teamManager.enable();
  }

  disableTeamMode() {
    if (this.state !== RoomState.WAITING_PLAYERS) {
      throw new ValidationError('Team mode can only be changed in lobby');
    }
    this._teamManager.disable();
  }

  isTeamMode() {
    return this._teamManager.isEnabled();
  }

  addTeam(team) {
    this._teamManager.addTeam(team);
  }

  removeTeam(teamId) {
    this._teamManager.removeTeam(teamId);
  }

  assignPlayerToTeam(playerId, teamId) {
    this._teamManager.assignPlayer(playerId, teamId, (id) => this.getPlayerById(id));
  }

  getTeamForPlayer(playerId) {
    return this._teamManager.getTeamForPlayer(playerId);
  }

  getTeamLeaderboard() {
    return this._teamManager.getLeaderboard((id) => this.getPlayerById(id));
  }

  getTeamPodium() {
    return this._teamManager.getPodium((id) => this.getPlayerById(id));
  }

  getAllTeams() {
    return this._teamManager.getAll();
  }
}

module.exports = { Room, RoomState };
