/**
 * In-memory Room Repository
 * Stores rooms in memory - can be swapped with Redis later
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
