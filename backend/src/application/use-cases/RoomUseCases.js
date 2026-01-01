const { Room, RoomState, Player } = require('../../domain/entities');
const { PIN, Nickname } = require('../../domain/value-objects');
const { generateId } = require('../../shared/utils/generateId');
const { NotFoundError, ForbiddenError, ValidationError, ConflictError } = require('../../shared/errors');

// Default grace period for player reconnection (2 minutes)
const DEFAULT_PLAYER_GRACE_PERIOD = 120000;

// Default grace period for host reconnection (5 minutes - longer since host is more critical)
const DEFAULT_HOST_GRACE_PERIOD = 300000;

// Lock TTL in milliseconds (10 seconds - should be enough for a join operation)
const JOIN_LOCK_TTL = 10000;

class RoomUseCases {
  constructor(roomRepository, quizRepository, options = {}) {
    this.roomRepository = roomRepository;
    this.quizRepository = quizRepository;
    this.playerGracePeriod = options.playerGracePeriod || DEFAULT_PLAYER_GRACE_PERIOD;
    this.hostGracePeriod = options.hostGracePeriod || DEFAULT_HOST_GRACE_PERIOD;

    // Lock map to prevent nickname collision race conditions
    // Key: "pin:nickname_lowercase", Value: timestamp when lock was acquired
    this.joinLocks = new Map();
  }

  /**
   * Acquire lock for joining room with nickname
   * Uses Nickname VO for consistent normalization
   * Locks expire after TTL to prevent permanent lockout
   * @private
   */
  _acquireJoinLock(pin, nickname) {
    // Use Nickname VO for consistent normalization across the system
    const normalizedNickname = new Nickname(nickname).normalized();
    const lockKey = `${pin}:${normalizedNickname}`;
    const now = Date.now();

    // Check if lock exists and is not expired
    const existingLock = this.joinLocks.get(lockKey);
    if (existingLock && (now - existingLock) < JOIN_LOCK_TTL) {
      throw new ConflictError('Join in progress. Please try again.');
    }

    // Clean up expired lock if exists, then acquire new lock
    this.joinLocks.set(lockKey, now);
    return lockKey;
  }

  /**
   * Release join lock
   * @private
   */
  _releaseJoinLock(lockKey) {
    this.joinLocks.delete(lockKey);
  }

  /**
   * Clean up expired join locks (called periodically if needed)
   * @returns {number} Number of expired locks removed
   */
  cleanupExpiredJoinLocks() {
    const now = Date.now();
    let removedCount = 0;

    for (const [key, timestamp] of this.joinLocks.entries()) {
      if ((now - timestamp) >= JOIN_LOCK_TTL) {
        this.joinLocks.delete(key);
        removedCount++;
      }
    }

    return removedCount;
  }

  /**
   * Get room by PIN or throw NotFoundError
   * @private
   */
  async _getRoomOrThrow(pin) {
    const room = await this.roomRepository.findByPin(pin);
    if (!room) {
      throw new NotFoundError('Room not found');
    }
    return room;
  }

  /**
   * Get quiz by ID or throw NotFoundError
   * @private
   */
  async _getQuizOrThrow(quizId) {
    const quiz = await this.quizRepository.findById(quizId);
    if (!quiz) {
      throw new NotFoundError('Quiz not found');
    }
    return quiz;
  }

  /**
   * Validate that requester is host or throw ForbiddenError
   * @private
   */
  _throwIfNotHost(room, requesterId) {
    if (!room.isHost(requesterId)) {
      throw new ForbiddenError('Only host can perform this action');
    }
  }

  /**
   * Create a new room for a quiz
   */
  async createRoom({ hostId, quizId }) {
    const quiz = await this._getQuizOrThrow(quizId);

    // Generate unique PIN with exponential backoff info
    let pin;
    let attempts = 0;
    const maxAttempts = 50; // Supports up to ~980,000 active rooms with 99.9% success

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
      pin, // Pass PIN Value Object directly
      hostId,
      hostToken,
      quizId,
      state: RoomState.WAITING_PLAYERS
    });

    await this.roomRepository.save(room);

    return { room, quiz, hostToken };
  }

  /**
   * Join an existing room
   * Uses lock to prevent race condition when two clients try to join with same nickname
   */
  async joinRoom({ pin, nickname, socketId }) {
    // Acquire lock to prevent race condition
    const lockKey = this._acquireJoinLock(pin, nickname);

    try {
      const room = await this._getRoomOrThrow(pin);
      const playerToken = generateId(); // Token for player reconnection

      const player = new Player({
        id: generateId(),
        socketId,
        nickname,
        roomPin: pin,
        playerToken
      });

      room.addPlayer(player); // Entity validates state and nickname uniqueness

      await this.roomRepository.save(room);

      return { room, player, playerToken };
    } finally {
      // Always release lock
      this._releaseJoinLock(lockKey);
    }
  }

  /**
   * Leave a room
   */
  async leaveRoom({ pin, socketId }) {
    const room = await this._getRoomOrThrow(pin);
    room.removePlayer(socketId);

    await this.roomRepository.save(room);

    return { room };
  }

  /**
   * Get room by PIN
   */
  async getRoom({ pin }) {
    const room = await this._getRoomOrThrow(pin);
    return { room };
  }

  /**
   * Get players in a room
   */
  async getPlayers({ pin }) {
    const room = await this._getRoomOrThrow(pin);
    return { players: room.getAllPlayers() };
  }

  /**
   * Close/delete a room (host only)
   */
  async closeRoom({ pin, requesterId }) {
    const room = await this._getRoomOrThrow(pin);
    this._throwIfNotHost(room, requesterId);
    await this.roomRepository.delete(pin);
    return { success: true };
  }

  /**
   * Handle socket disconnect - mark as disconnected instead of removing
   * Allows for reconnection during grace period
   * Uses O(1) index lookup for performance
   */
  async handleDisconnect({ socketId }) {
    // Use O(1) index lookup instead of iterating all rooms
    const result = await this.roomRepository.findBySocketId(socketId);

    if (!result) {
      return { type: 'not_in_room' };
    }

    const { room, role, player } = result;

    if (role === 'host') {
      // Mark host as disconnected instead of deleting room immediately
      room.setHostDisconnected();
      await this.roomRepository.save(room);
      return {
        type: 'host_disconnected',
        pin: room.pin,
        gracePeriod: true // Host can reconnect
      };
    }

    if (role === 'player' && player) {
      // During lobby, remove player completely
      // During game, mark as disconnected for potential reconnection
      if (room.state === RoomState.WAITING_PLAYERS) {
        room.removePlayer(socketId);
      } else {
        room.setPlayerDisconnected(socketId);
      }
      await this.roomRepository.save(room);
      return {
        type: 'player_disconnected',
        pin: room.pin,
        player,
        playerCount: room.getPlayerCount(),
        canReconnect: room.state !== RoomState.WAITING_PLAYERS
      };
    }

    return { type: 'not_in_room' };
  }

  /**
   * Reconnect host to room using hostToken
   * Validates grace period to prevent reconnection after timeout
   */
  async reconnectHost({ pin, hostToken, newSocketId }) {
    const room = await this._getRoomOrThrow(pin);
    room.reconnectHost(newSocketId, hostToken, this.hostGracePeriod);
    await this.roomRepository.save(room);
    const quiz = await this.quizRepository.findById(room.quizId);
    return { room, quiz };
  }

  /**
   * Reconnect player to room using playerToken
   * Rotates token on successful reconnect for security
   */
  async reconnectPlayer({ pin, playerToken, newSocketId }) {
    const room = await this._getRoomOrThrow(pin);
    // Generate new token for security (token rotation)
    const newPlayerToken = generateId();
    const player = room.reconnectPlayer(playerToken, newSocketId, this.playerGracePeriod, newPlayerToken);
    await this.roomRepository.save(room);
    // Return new token so client can update stored token
    return { room, player, newPlayerToken };
  }

  /**
   * Find room by host token (for reconnection)
   * Uses O(1) index lookup for performance
   */
  async findRoomByHostToken({ hostToken }) {
    const room = await this.roomRepository.findByHostToken(hostToken);

    if (!room) {
      return null;
    }

    return { room };
  }

  /**
   * Find room by player token (for reconnection)
   * Uses O(1) index lookup for performance
   */
  async findRoomByPlayerToken({ playerToken }) {
    return await this.roomRepository.findByPlayerToken(playerToken);
  }

  /**
   * Find room where socket is participating (as host or player)
   * Used to prevent same socket from joining multiple rooms
   * Uses O(1) index lookup for performance
   */
  async findRoomBySocketId({ socketId }) {
    return await this.roomRepository.findBySocketId(socketId);
  }
}

module.exports = { RoomUseCases };
