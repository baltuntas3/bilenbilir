/**
 * In-memory Room Repository
 * Stores rooms in memory for real-time game sessions
 *
 * TODO: Redis Integration & Recovery Mechanism
 * =============================================
 * Current limitations:
 * 1. Data is lost on server restart - all active games are terminated
 * 2. Single-server only - cannot scale horizontally
 * 3. No recovery mechanism for interrupted games
 *
 * Future implementation with Redis:
 * - Replace Map with Redis client (ioredis recommended)
 * - Serialize Room entities to JSON for storage
 * - Implement pub/sub for multi-server synchronization
 * - Add session recovery: on startup, restore active rooms from Redis
 * - Implement TTL-based auto-cleanup for abandoned rooms
 * - Consider Redis Cluster for high availability
 *
 * Recovery mechanism requirements:
 * - Store room state with timestamp on each save
 * - On server restart, emit 'room_recovered' event to reconnecting clients
 * - Handle timer state restoration (pause/resume logic)
 * - Notify players of recovery with sync data
 */
class RoomRepository {
  constructor() {
    this.rooms = new Map(); // pin -> Room

    // Secondary indexes for O(1) lookups
    this.hostTokenIndex = new Map(); // hostToken -> pin
    this.socketIdIndex = new Map(); // socketId -> pin (for host, players, and spectators)
    this.playerTokenIndex = new Map(); // playerToken -> pin
    this.spectatorTokenIndex = new Map(); // spectatorToken -> pin
  }

  /**
   * Safely index a socket ID, removing any stale entry from other rooms first
   * Prevents race condition where same socket could be indexed to multiple rooms
   * @private
   */
  _safeIndexSocket(socketId, pin) {
    if (!socketId) return;

    const existingPin = this.socketIdIndex.get(socketId);
    if (existingPin && existingPin !== pin) {
      // Socket was indexed to different room - this shouldn't happen normally
      // but clean it up as a safety measure
      console.warn(`Socket ${socketId} was indexed to room ${existingPin}, re-indexing to ${pin}`);
    }
    this.socketIdIndex.set(socketId, pin);
  }

  /**
   * Update secondary indexes when saving a room
   * @private
   */
  _updateIndexes(room) {
    const pin = room.pin;

    // Clear old indexes for this room first
    this._clearIndexesForRoom(pin);

    // Index host token
    if (room.hostToken) {
      this.hostTokenIndex.set(room.hostToken, pin);
    }

    // Index host socket ID (with safety check)
    this._safeIndexSocket(room.hostId, pin);

    // Index all player tokens and socket IDs (skip expired tokens)
    for (const player of room.getAllPlayers()) {
      // Only index non-expired tokens
      if (player.playerToken && !player.isTokenExpired()) {
        this.playerTokenIndex.set(player.playerToken, pin);
      }
      // Safe index with race condition prevention
      this._safeIndexSocket(player.socketId, pin);
    }

    // Index all spectator tokens and socket IDs (skip expired tokens)
    for (const spectator of room.getAllSpectators()) {
      // Only index non-expired tokens
      if (spectator.spectatorToken && !spectator.isTokenExpired()) {
        this.spectatorTokenIndex.set(spectator.spectatorToken, pin);
      }
      // Safe index with race condition prevention
      this._safeIndexSocket(spectator.socketId, pin);
    }
  }

  /**
   * Clear all indexes for a specific room
   * @private
   */
  _clearIndexesForRoom(pin) {
    const room = this.rooms.get(pin);
    if (!room) return;

    // Remove host token index
    if (room.hostToken) {
      this.hostTokenIndex.delete(room.hostToken);
    }

    // Remove host socket ID index
    if (room.hostId) {
      this.socketIdIndex.delete(room.hostId);
    }

    // Remove all player indexes
    for (const player of room.getAllPlayers()) {
      if (player.playerToken) {
        this.playerTokenIndex.delete(player.playerToken);
      }
      if (player.socketId) {
        this.socketIdIndex.delete(player.socketId);
      }
    }

    // Remove all spectator indexes
    for (const spectator of room.getAllSpectators()) {
      if (spectator.spectatorToken) {
        this.spectatorTokenIndex.delete(spectator.spectatorToken);
      }
      if (spectator.socketId) {
        this.socketIdIndex.delete(spectator.socketId);
      }
    }
  }

  async save(room) {
    this._updateIndexes(room);
    this.rooms.set(room.pin, room);
    return room;
  }

  async findByPin(pin) {
    return this.rooms.get(pin) || null;
  }

  async findById(id) {
    for (const room of this.rooms.values()) {
      if (room.id === id) return room;
    }
    return null;
  }

  /**
   * Find room by host token - O(1) lookup
   * Automatically cleans up stale index entries
   */
  async findByHostToken(hostToken) {
    const pin = this.hostTokenIndex.get(hostToken);
    if (!pin) return null;

    const room = this.rooms.get(pin);
    if (!room) {
      // Room doesn't exist, clean up stale index entry
      this.hostTokenIndex.delete(hostToken);
      return null;
    }

    // Verify the token still matches
    if (room.hostToken !== hostToken) {
      // Token mismatch, clean up stale index entry
      this.hostTokenIndex.delete(hostToken);
      return null;
    }

    return room;
  }

  /**
   * Find room by socket ID - O(1) lookup
   * Automatically cleans up stale index entries
   * @returns {{ room: Room, role: 'host' | 'player' | 'spectator', player?: Player, spectator?: Spectator } | null}
   */
  async findBySocketId(socketId) {
    const pin = this.socketIdIndex.get(socketId);
    if (!pin) return null;

    const room = this.rooms.get(pin);
    if (!room) {
      // Room doesn't exist, clean up stale index entry
      this.socketIdIndex.delete(socketId);
      return null;
    }

    // Determine if socket is host, player, or spectator
    if (room.isHost(socketId)) {
      return { room, role: 'host' };
    }

    const player = room.getPlayer(socketId);
    if (player) {
      return { room, role: 'player', player };
    }

    const spectator = room.getSpectator(socketId);
    if (spectator) {
      return { room, role: 'spectator', spectator };
    }

    // Socket not found in room, clean up stale index entry
    this.socketIdIndex.delete(socketId);
    return null;
  }

  /**
   * Find room by player token - O(1) lookup
   * Automatically removes expired tokens from index
   * @returns {{ room: Room, player: Player } | null}
   */
  async findByPlayerToken(playerToken) {
    const pin = this.playerTokenIndex.get(playerToken);
    if (!pin) return null;

    const room = this.rooms.get(pin);
    if (!room) {
      // Room doesn't exist, clean up stale index entry
      this.playerTokenIndex.delete(playerToken);
      return null;
    }

    const player = room.getPlayerByToken(playerToken);
    if (!player) {
      // Player not found, clean up stale index entry
      this.playerTokenIndex.delete(playerToken);
      return null;
    }

    // Check if token is expired
    if (player.isTokenExpired()) {
      // Token expired, remove from index
      this.playerTokenIndex.delete(playerToken);
      return null;
    }

    return { room, player };
  }

  /**
   * Find room by spectator token - O(1) lookup
   * Automatically removes expired tokens from index
   * @returns {{ room: Room, spectator: Spectator } | null}
   */
  async findBySpectatorToken(spectatorToken) {
    const pin = this.spectatorTokenIndex.get(spectatorToken);
    if (!pin) return null;

    const room = this.rooms.get(pin);
    if (!room) {
      // Room doesn't exist, clean up stale index entry
      this.spectatorTokenIndex.delete(spectatorToken);
      return null;
    }

    const spectator = room.getSpectatorByToken(spectatorToken);
    if (!spectator) {
      // Spectator not found, clean up stale index entry
      this.spectatorTokenIndex.delete(spectatorToken);
      return null;
    }

    // Check if token is expired
    if (spectator.isTokenExpired()) {
      // Token expired, remove from index
      this.spectatorTokenIndex.delete(spectatorToken);
      return null;
    }

    return { room, spectator };
  }

  /**
   * Clean up expired tokens from all indexes
   * Called periodically by cleanup service
   * @returns {number} Number of expired tokens removed
   */
  cleanupExpiredTokens() {
    let removedCount = 0;

    // Clean up expired player tokens
    for (const [token, pin] of this.playerTokenIndex.entries()) {
      const room = this.rooms.get(pin);
      if (!room) {
        this.playerTokenIndex.delete(token);
        removedCount++;
        continue;
      }

      const player = room.getPlayerByToken(token);
      if (!player || player.isTokenExpired()) {
        this.playerTokenIndex.delete(token);
        removedCount++;
      }
    }

    // Clean up expired spectator tokens
    for (const [token, pin] of this.spectatorTokenIndex.entries()) {
      const room = this.rooms.get(pin);
      if (!room) {
        this.spectatorTokenIndex.delete(token);
        removedCount++;
        continue;
      }

      const spectator = room.getSpectatorByToken(token);
      if (!spectator || spectator.isTokenExpired()) {
        this.spectatorTokenIndex.delete(token);
        removedCount++;
      }
    }

    return removedCount;
  }

  async delete(pin) {
    this._clearIndexesForRoom(pin);
    return this.rooms.delete(pin);
  }

  async exists(pin) {
    return this.rooms.has(pin);
  }

  async getAll() {
    return Array.from(this.rooms.values());
  }

  /**
   * Find room by host user ID (MongoDB User ID)
   * Used to enforce one room per host
   * @param {string} hostUserId - Host's MongoDB User ID
   * @returns {Room|null}
   */
  async findByHostUserId(hostUserId) {
    if (!hostUserId) return null;

    for (const room of this.rooms.values()) {
      if (room.hostUserId === hostUserId) {
        return room;
      }
    }
    return null;
  }

  async clear() {
    this.rooms.clear();
    this.hostTokenIndex.clear();
    this.socketIdIndex.clear();
    this.playerTokenIndex.clear();
    this.spectatorTokenIndex.clear();
  }
}

// Singleton instance
const roomRepository = new RoomRepository();

module.exports = { RoomRepository, roomRepository };
