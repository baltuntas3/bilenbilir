const { Room, RoomState, Player } = require('../../domain/entities');
const { PIN } = require('../../domain/value-objects');
const { generateId } = require('../../shared/utils/generateId');

class RoomUseCases {
  constructor(roomRepository, quizRepository) {
    this.roomRepository = roomRepository;
    this.quizRepository = quizRepository;
  }

  /**
   * Create a new room for a quiz
   */
  async createRoom({ hostId, quizId }) {
    // Verify quiz exists
    const quiz = await this.quizRepository.findById(quizId);
    if (!quiz) {
      throw new Error('Quiz not found');
    }

    // Generate unique PIN
    let pin;
    let attempts = 0;
    do {
      pin = PIN.generate();
      attempts++;
      if (attempts > 10) {
        throw new Error('Failed to generate unique PIN');
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
   */
  async joinRoom({ pin, nickname, socketId }) {
    const room = await this.roomRepository.findByPin(pin);
    if (!room) {
      throw new Error('Room not found');
    }

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
  }

  /**
   * Leave a room
   */
  async leaveRoom({ pin, socketId }) {
    const room = await this.roomRepository.findByPin(pin);
    if (!room) {
      throw new Error('Room not found');
    }

    room.removePlayer(socketId);

    await this.roomRepository.save(room);

    return { room };
  }

  /**
   * Get room by PIN
   */
  async getRoom({ pin }) {
    const room = await this.roomRepository.findByPin(pin);
    if (!room) {
      throw new Error('Room not found');
    }

    return { room };
  }

  /**
   * Get players in a room
   */
  async getPlayers({ pin }) {
    const room = await this.roomRepository.findByPin(pin);
    if (!room) {
      throw new Error('Room not found');
    }

    return { players: room.getAllPlayers() };
  }

  /**
   * Close/delete a room (host only)
   */
  async closeRoom({ pin, requesterId }) {
    const room = await this.roomRepository.findByPin(pin);
    if (!room) {
      throw new Error('Room not found');
    }

    if (!room.isHost(requesterId)) {
      throw new Error('Only host can close the room');
    }

    await this.roomRepository.delete(pin);

    return { success: true };
  }

  /**
   * Handle socket disconnect - mark as disconnected instead of removing
   * Allows for reconnection during grace period
   */
  async handleDisconnect({ socketId }) {
    const rooms = await this.roomRepository.getAll();

    for (const room of rooms) {
      // Check if disconnected user is host
      if (room.isHost(socketId)) {
        // Mark host as disconnected instead of deleting room immediately
        room.setHostDisconnected();
        await this.roomRepository.save(room);
        return {
          type: 'host_disconnected',
          pin: room.pin,
          gracePeriod: true // Host can reconnect
        };
      }

      // Check if disconnected user is a player
      const player = room.getPlayer(socketId);
      if (player) {
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
    }

    return { type: 'not_in_room' };
  }

  /**
   * Reconnect host to room using hostToken
   */
  async reconnectHost({ pin, hostToken, newSocketId }) {
    const room = await this.roomRepository.findByPin(pin);
    if (!room) {
      throw new Error('Room not found');
    }

    room.reconnectHost(newSocketId, hostToken);
    await this.roomRepository.save(room);

    const quiz = await this.quizRepository.findById(room.quizId);

    return { room, quiz };
  }

  /**
   * Reconnect player to room using playerToken
   */
  async reconnectPlayer({ pin, playerToken, newSocketId }) {
    const room = await this.roomRepository.findByPin(pin);
    if (!room) {
      throw new Error('Room not found');
    }

    const player = room.reconnectPlayer(playerToken, newSocketId);
    await this.roomRepository.save(room);

    return { room, player };
  }

  /**
   * Find room by host token (for reconnection)
   */
  async findRoomByHostToken({ hostToken }) {
    const rooms = await this.roomRepository.getAll();
    const room = rooms.find(r => r.hostToken === hostToken);

    if (!room) {
      return null;
    }

    return { room };
  }

  /**
   * Find room by player token (for reconnection)
   */
  async findRoomByPlayerToken({ playerToken }) {
    const rooms = await this.roomRepository.getAll();

    for (const room of rooms) {
      const player = room.getPlayerByToken(playerToken);
      if (player) {
        return { room, player };
      }
    }

    return null;
  }
}

module.exports = { RoomUseCases };
