const { SharedUseCases } = require('./SharedUseCases');
const { LockManager } = require('../../shared/utils/LockManager');
const { Room, RoomState, Player, Spectator, Team, TEAM_COLORS } = require('../../domain/entities');
const { PIN, Nickname } = require('../../domain/value-objects');
const { generateId } = require('../../shared/utils/generateId');
const { ValidationError, ConflictError } = require('../../shared/errors');
const {
  PLAYER_GRACE_PERIOD_MS,
  HOST_GRACE_PERIOD_MS,
  SPECTATOR_GRACE_PERIOD_MS
} = require('../../shared/config/constants');

class RoomUseCases extends SharedUseCases {
  constructor(roomRepository, quizRepository, options = {}) {
    super(roomRepository, quizRepository);
    this.playerGracePeriod = options.playerGracePeriod || PLAYER_GRACE_PERIOD_MS;
    this.hostGracePeriod = options.hostGracePeriod || HOST_GRACE_PERIOD_MS;
    this.spectatorGracePeriod = options.spectatorGracePeriod || SPECTATOR_GRACE_PERIOD_MS;

    // Lock to prevent nickname collision race conditions (60s TTL)
    this.joinLocks = new LockManager(60000);
  }

  /**
   * Clean up expired join locks (called periodically if needed)
   * @returns {number} Number of expired locks removed
   */
  cleanupExpiredJoinLocks() {
    return this.joinLocks.cleanupExpired();
  }

  async createRoom({ hostId, hostUserId, quizId }) {
    const existingRoom = await this.roomRepository.findByHostUserId(hostUserId);
    if (existingRoom) {
      throw new ConflictError(`You already have an active room (PIN: ${existingRoom.pin}). Close it before creating a new one.`);
    }

    const quiz = await this._getQuizOrThrow(quizId);
    if (quiz.getTotalQuestions() === 0) {
      throw new ValidationError('Cannot create room: quiz has no questions');
    }

    let pin;
    let attempts = 0;
    const maxAttempts = 50;

    do {
      pin = PIN.generate();
      attempts++;
      if (attempts > maxAttempts) {
        throw new ValidationError('Failed to generate unique PIN. System may be at capacity.');
      }
    } while (await this.roomRepository.exists(pin.toString()));

    const hostToken = generateId();

    const room = new Room({
      id: generateId(),
      pin,
      hostId,
      hostUserId,
      hostToken,
      quizId,
      state: RoomState.WAITING_PLAYERS
    });

    await this.roomRepository.save(room);

    return { room, quiz, hostToken };
  }

  async joinRoom({ pin, nickname, socketId }) {
    const normalizedNickname = new Nickname(nickname).normalized();
    const lockKey = `${pin}:${normalizedNickname}`;
    return this.joinLocks.withLock(lockKey, 'Join in progress. Please try again.', async () => {
      const room = await this._getRoomOrThrow(pin);
      const playerToken = generateId();

      const player = new Player({
        id: generateId(),
        socketId,
        nickname,
        roomPin: pin,
        token: playerToken
      });

      room.addPlayer(player);

      await this.roomRepository.save(room);

      return { room, player, playerToken };
    });
  }

  async leaveRoom({ pin, socketId }) {
    const room = await this._getRoomOrThrow(pin);
    const removedPlayer = room.removePlayer(socketId);

    await this.roomRepository.save(room);

    return { room, removedPlayer };
  }

  async getRoom({ pin }) {
    const room = await this._getRoomOrThrow(pin);
    return { room };
  }

  async getPlayers({ pin }) {
    const room = await this._getRoomOrThrow(pin);
    return { players: room.getAllPlayers() };
  }

  async closeRoom({ pin, requesterId }) {
    const room = await this._getRoomOrThrow(pin);
    this._throwIfNotHost(room, requesterId);

    const wasGameInProgress = room.state !== RoomState.WAITING_PLAYERS &&
                              room.state !== RoomState.PODIUM;
    const playerCount = room.getPlayerCount();
    const spectatorCount = room.getSpectatorCount();

    await this.roomRepository.delete(pin);

    return {
      success: true,
      wasGameInProgress,
      disconnectedPlayers: playerCount,
      disconnectedSpectators: spectatorCount
    };
  }

  async handleDisconnect({ socketId }) {
    const result = await this.roomRepository.findBySocketId(socketId);

    if (!result) {
      return { type: 'not_in_room' };
    }

    const { room, role, player, spectator } = result;

    if (role === 'host') {
      room.setHostDisconnected();
      await this.roomRepository.save(room);
      return {
        type: 'host_disconnected',
        pin: room.pin,
        gracePeriod: true
      };
    }

    if (role === 'player' && player) {
      if (room.state === RoomState.WAITING_PLAYERS) {
        room.removePlayer(socketId);
      } else {
        room.setPlayerDisconnected(socketId);
      }
      await this.roomRepository.save(room);

      // Check if remaining connected players have all answered (auto-advance trigger)
      // Also trigger when no connected players remain to prevent stuck ANSWERING_PHASE
      const isAnswering = room.state === RoomState.ANSWERING_PHASE;
      const noConnectedPlayers = room.getConnectedPlayerCount() === 0;
      const allAnswered = isAnswering && (room.haveAllPlayersAnswered() || noConnectedPlayers);

      return {
        type: 'player_disconnected',
        pin: room.pin,
        player,
        playerCount: room.getPlayerCount(),
        canReconnect: room.state !== RoomState.WAITING_PLAYERS,
        allAnswered
      };
    }

    if (role === 'spectator' && spectator) {
      room.setSpectatorDisconnected(socketId);
      await this.roomRepository.save(room);
      return {
        type: 'spectator_disconnected',
        pin: room.pin,
        spectator,
        spectatorCount: room.getSpectatorCount(),
        canReconnect: true
      };
    }

    return { type: 'not_in_room' };
  }

  async reconnectHost({ pin, hostToken, newSocketId }) {
    const room = await this._getRoomOrThrow(pin);
    room.reconnectHost(newSocketId, hostToken, this.hostGracePeriod);
    await this.roomRepository.save(room);
    const quiz = await this.quizRepository.findById(room.quizId);
    return { room, quiz };
  }

  async reconnectPlayer({ pin, playerToken, newSocketId }) {
    const room = await this._getRoomOrThrow(pin);
    const newPlayerToken = generateId();
    const player = room.reconnectPlayer(playerToken, newSocketId, this.playerGracePeriod, newPlayerToken);
    // Only clear power-up state if the player has already answered the current question
    // (if they haven't answered, they may still use their power-up from before disconnect)
    if (player.hasAnswered()) {
      player.clearActivePowerUp();
      player.eliminatedOptions = [];
    }
    await this.roomRepository.save(room);
    return { room, player, newPlayerToken };
  }

  async findRoomByHostToken({ hostToken }) {
    const room = await this.roomRepository.findByHostToken(hostToken);

    if (!room) {
      return null;
    }

    return { room };
  }

  async findRoomByPlayerToken({ playerToken }) {
    return await this.roomRepository.findByPlayerToken(playerToken);
  }

  async findRoomBySpectatorToken({ spectatorToken }) {
    return await this.roomRepository.findBySpectatorToken(spectatorToken);
  }

  async getHostRoom({ hostUserId }) {
    const room = await this.roomRepository.findByHostUserId(hostUserId);

    if (!room) {
      return null;
    }

    return {
      pin: room.pin,
      hostToken: room.hostToken,
      state: room.state,
      playerCount: room.getPlayerCount(),
      connectedPlayerCount: room.getConnectedPlayerCount(),
      currentQuestionIndex: room.currentQuestionIndex,
      quizId: room.quizId,
      createdAt: room.createdAt,
      isHostDisconnected: room.isHostDisconnected(),
    };
  }

  async forceCloseHostRoom({ hostUserId }) {
    const room = await this.roomRepository.findByHostUserId(hostUserId);

    if (!room) {
      return { closed: false, reason: 'No active room found' };
    }

    await this.roomRepository.delete(room.pin);

    return {
      closed: true,
      pin: room.pin,
      state: room.state,
      playerCount: room.getPlayerCount()
    };
  }

  async findRoomBySocketId({ socketId }) {
    return await this.roomRepository.findBySocketId(socketId);
  }

  // ==================== LIGHTNING ROUND ====================

  async setLightningRound({ pin, enabled, questionCount, requesterId }) {
    const room = await this._getRoomOrThrow(pin);
    this._throwIfNotHost(room, requesterId);

    room.setLightningRound(enabled, questionCount);
    await this.roomRepository.save(room);

    return { room };
  }

  // ==================== KICK/BAN METHODS ====================

  async kickPlayer({ pin, playerId, requesterId }) {
    const room = await this._getRoomOrThrow(pin);
    const player = room.kickPlayer(playerId, requesterId);
    await this.roomRepository.save(room);
    return { room, player };
  }

  async banPlayer({ pin, playerId, requesterId }) {
    const room = await this._getRoomOrThrow(pin);
    const player = room.banPlayer(playerId, requesterId);
    await this.roomRepository.save(room);
    return { room, player };
  }

  async unbanNickname({ pin, nickname, requesterId }) {
    const room = await this._getRoomOrThrow(pin);
    room.unbanNickname(nickname, requesterId);
    await this.roomRepository.save(room);
    return { room };
  }

  async getBannedNicknames({ pin }) {
    const room = await this._getRoomOrThrow(pin);
    return { bannedNicknames: room.getBannedNicknames() };
  }

  // ==================== SPECTATOR METHODS ====================

  async joinAsSpectator({ pin, nickname, socketId }) {
    const room = await this._getRoomOrThrow(pin);
    const spectatorToken = generateId();

    const spectator = new Spectator({
      id: generateId(),
      socketId,
      nickname,
      roomPin: pin,
      token: spectatorToken
    });

    room.addSpectator(spectator);
    await this.roomRepository.save(room);

    return { room, spectator, spectatorToken };
  }

  async leaveAsSpectator({ pin, socketId }) {
    const room = await this._getRoomOrThrow(pin);
    room.removeSpectator(socketId);
    await this.roomRepository.save(room);
    return { room };
  }

  async reconnectSpectator({ pin, spectatorToken, newSocketId }) {
    const room = await this._getRoomOrThrow(pin);
    const newSpectatorToken = generateId();
    const spectator = room.reconnectSpectator(
      spectatorToken,
      newSocketId,
      this.spectatorGracePeriod,
      newSpectatorToken
    );
    await this.roomRepository.save(room);
    return { room, spectator, newSpectatorToken };
  }

  async getSpectators({ pin }) {
    const room = await this._getRoomOrThrow(pin);
    return { spectators: room.getAllSpectators() };
  }

  // ==================== TEAM MODE METHODS ====================

  async enableTeamMode({ pin, requesterId }) {
    const room = await this._getRoomOrThrow(pin);
    this._throwIfNotHost(room, requesterId);

    room.enableTeamMode();
    await this.roomRepository.save(room);

    return { room };
  }

  async disableTeamMode({ pin, requesterId }) {
    const room = await this._getRoomOrThrow(pin);
    this._throwIfNotHost(room, requesterId);

    room.disableTeamMode();
    await this.roomRepository.save(room);

    return { room };
  }

  async addTeam({ pin, name, requesterId }) {
    const room = await this._getRoomOrThrow(pin);
    this._throwIfNotHost(room, requesterId);

    // Auto-assign color based on current team count
    const colorIndex = room.getAllTeams().length % TEAM_COLORS.length;
    const color = TEAM_COLORS[colorIndex];

    const team = new Team({
      id: generateId(),
      name,
      color
    });

    room.addTeam(team);
    await this.roomRepository.save(room);

    return { room, team };
  }

  async removeTeam({ pin, teamId, requesterId }) {
    const room = await this._getRoomOrThrow(pin);
    this._throwIfNotHost(room, requesterId);

    room.removeTeam(teamId);
    await this.roomRepository.save(room);

    return { room };
  }

  async assignPlayerToTeam({ pin, playerId, teamId, requesterId }) {
    const room = await this._getRoomOrThrow(pin);
    this._throwIfNotHost(room, requesterId);

    room.assignPlayerToTeam(playerId, teamId);
    await this.roomRepository.save(room);

    return { room };
  }
}

module.exports = { RoomUseCases };
