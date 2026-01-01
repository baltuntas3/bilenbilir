/**
 * Room Cleanup Service
 * Periodically cleans up stale rooms
 */
class RoomCleanupService {
  constructor(roomRepository, io, options = {}) {
    this.roomRepository = roomRepository;
    this.io = io;
    this.intervalId = null;

    // Configuration
    this.checkInterval = options.checkInterval || 30000; // Check every 30 seconds
    this.hostGracePeriod = options.hostGracePeriod || 60000; // 1 minute for host to reconnect
    this.emptyRoomTimeout = options.emptyRoomTimeout || 300000; // 5 minutes for empty rooms
    this.idleRoomTimeout = options.idleRoomTimeout || 3600000; // 1 hour for idle rooms
  }

  start() {
    if (this.intervalId) {
      return; // Already running
    }

    console.log('Room cleanup service started');
    this.intervalId = setInterval(() => this.cleanup(), this.checkInterval);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('Room cleanup service stopped');
    }
  }

  async cleanup() {
    try {
      const rooms = await this.roomRepository.getAll();
      const now = Date.now();

      for (const room of rooms) {
        let shouldDelete = false;
        let reason = '';

        // Check if host has been disconnected too long
        if (room.isHostDisconnected()) {
          const disconnectedDuration = room.getHostDisconnectedDuration();
          if (disconnectedDuration > this.hostGracePeriod) {
            shouldDelete = true;
            reason = 'Host reconnection timeout';
          }
        }

        // Check if room is empty for too long
        if (!shouldDelete && room.getPlayerCount() === 0) {
          const roomAge = now - room.createdAt.getTime();
          if (roomAge > this.emptyRoomTimeout) {
            shouldDelete = true;
            reason = 'Empty room timeout';
          }
        }

        // Check if room has been idle too long
        if (!shouldDelete) {
          const roomAge = now - room.createdAt.getTime();
          if (roomAge > this.idleRoomTimeout) {
            shouldDelete = true;
            reason = 'Idle room timeout';
          }
        }

        if (shouldDelete) {
          console.log(`Cleaning up room ${room.pin}: ${reason}`);

          // Notify all clients in room
          if (this.io) {
            this.io.to(room.pin).emit('room_closed', { reason });
            this.io.in(room.pin).socketsLeave(room.pin);
          }

          await this.roomRepository.delete(room.pin);
        }
      }
    } catch (error) {
      console.error('Room cleanup error:', error.message);
    }
  }
}

module.exports = { RoomCleanupService };
