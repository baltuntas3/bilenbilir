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
  }

  async save(room) {
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

  async delete(pin) {
    return this.rooms.delete(pin);
  }

  async exists(pin) {
    return this.rooms.has(pin);
  }

  async findByHostId(hostId) {
    for (const room of this.rooms.values()) {
      if (room.hostId === hostId) return room;
    }
    return null;
  }

  async getAll() {
    return Array.from(this.rooms.values());
  }

  async clear() {
    this.rooms.clear();
  }
}

// Singleton instance
const roomRepository = new RoomRepository();

module.exports = { RoomRepository, roomRepository };
