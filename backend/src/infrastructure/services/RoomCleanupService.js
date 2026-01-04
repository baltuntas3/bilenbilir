const { RoomState } = require('../../domain/entities');

/**
 * Room Cleanup Service
 * Periodically cleans up stale rooms and related resources
 */
class RoomCleanupService {
  constructor(roomRepository, io, options = {}) {
    this.roomRepository = roomRepository;
    this.io = io;
    this.roomUseCases = options.roomUseCases || null; // Optional: for join lock cleanup
    this.gameUseCases = options.gameUseCases || null; // Optional: for interrupted game archival
    this.intervalId = null;
    this.isCleanupRunning = false; // Lock to prevent concurrent cleanup

    // Configuration
    this.checkInterval = options.checkInterval || 30000; // Check every 30 seconds
    this.hostGracePeriod = options.hostGracePeriod || 60000; // 1 minute for host to reconnect
    this.playerGracePeriod = options.playerGracePeriod || 120000; // 2 minutes for player to reconnect
    this.emptyRoomTimeout = options.emptyRoomTimeout || 300000; // 5 minutes for empty rooms
    this.idleRoomTimeout = options.idleRoomTimeout || 3600000; // 1 hour for idle rooms

    // States that indicate an active game (should not be cleaned up aggressively)
    this.activeGameStates = [
      RoomState.QUESTION_INTRO,
      RoomState.ANSWERING_PHASE,
      RoomState.SHOW_RESULTS,
      RoomState.LEADERBOARD
    ];
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

  /**
   * Check if room is in an active game state
   * @private
   */
  _isActiveGame(room) {
    return this.activeGameStates.includes(room.state);
  }

  /**
   * Map cleanup reason to interruption code for archival
   * @private
   */
  _mapReasonToInterruptionCode(reason) {
    if (reason.includes('Orphan')) return 'orphan_room';
    if (reason.includes('Host')) return 'host_timeout';
    if (reason.includes('Empty')) return 'empty_room';
    if (reason.includes('Active game timeout')) return 'game_timeout';
    if (reason.includes('Idle')) return 'idle_timeout';
    return 'cleanup';
  }

  async cleanup() {
    // Prevent concurrent cleanup runs
    if (this.isCleanupRunning) {
      console.log('Cleanup already in progress, skipping...');
      return;
    }

    this.isCleanupRunning = true;
    try {
      const rooms = await this.roomRepository.getAll();
      const now = Date.now();

      for (const room of rooms) {
        try {
          let shouldDelete = false;
          let reason = '';

          // Skip aggressive cleanup for rooms with active games (but still clean stale players)
          const isActiveGame = this._isActiveGame(room);

          // Clean up stale disconnected players (always do this, even in active games)
          const stalePlayers = room.removeStaleDisconnectedPlayers(this.playerGracePeriod);
          if (stalePlayers.length > 0) {
            console.log(`Removed ${stalePlayers.length} stale players from room ${room.pin}`);

            // Notify room about removed players
            if (this.io) {
              stalePlayers.forEach(player => {
                this.io.to(room.pin).emit('player_removed', {
                  playerId: player.id,
                  nickname: player.nickname,
                  reason: 'reconnection_timeout'
                });
              });
            }

            await this.roomRepository.save(room);
          }

          // Check if host has been disconnected too long
          if (room.isHostDisconnected()) {
            const disconnectedDuration = room.getHostDisconnectedDuration();

            // Warn players when host is disconnected (every check interval)
            if (this.io && disconnectedDuration <= this.hostGracePeriod) {
              const remainingTime = Math.max(0, this.hostGracePeriod - disconnectedDuration);
              this.io.to(room.pin).emit('host_disconnected_warning', {
                remainingSeconds: Math.ceil(remainingTime / 1000),
                message: 'Host disconnected. Room will close if host does not reconnect.'
              });
            }

            if (disconnectedDuration > this.hostGracePeriod) {
              shouldDelete = true;
              reason = 'Host reconnection timeout';
            }
          }

          // Check for orphan room: host disconnected AND no connected players
          // This handles the case where everyone abandons an active game
          if (!shouldDelete && room.isHostDisconnected() && room.getConnectedPlayerCount() === 0) {
            const hostDisconnectedDuration = room.getHostDisconnectedDuration();
            // Use shorter timeout for orphan rooms since no one can interact
            const orphanTimeout = Math.min(this.hostGracePeriod, this.playerGracePeriod);
            if (hostDisconnectedDuration > orphanTimeout) {
              shouldDelete = true;
              reason = 'Orphan room (host and all players disconnected)';
            }
          }

          // Check if room is empty for too long (skip if game is active with no players - edge case)
          if (!shouldDelete && room.getPlayerCount() === 0 && !isActiveGame) {
            const roomAge = now - room.createdAt.getTime();
            if (roomAge > this.emptyRoomTimeout) {
              shouldDelete = true;
              reason = 'Empty room timeout';
            }
          }

          // Check if room has been idle too long
          // Use longer timeout for active games
          if (!shouldDelete) {
            const roomAge = now - room.createdAt.getTime();
            const timeout = isActiveGame ? this.idleRoomTimeout * 2 : this.idleRoomTimeout;
            if (roomAge > timeout) {
              shouldDelete = true;
              reason = isActiveGame ? 'Active game timeout (exceeded 2 hours)' : 'Idle room timeout';
            }
          }

          if (shouldDelete) {
            console.log(`Cleaning up room ${room.pin}: ${reason}`);

            // Archive as interrupted game if game had started
            if (this.gameUseCases && room.hasQuizSnapshot()) {
              try {
                await this.gameUseCases.saveInterruptedGame({
                  pin: room.pin,
                  reason: this._mapReasonToInterruptionCode(reason)
                });
                console.log(`Archived interrupted game for room ${room.pin}`);
              } catch (archiveError) {
                // Log but don't fail cleanup - room will still be deleted
                console.error(`Failed to archive interrupted game ${room.pin}:`, archiveError.message);
              }
            }

            // Notify all clients in room
            if (this.io) {
              this.io.to(room.pin).emit('room_closed', { reason });
              this.io.in(room.pin).socketsLeave(room.pin);
            }

            // Atomically delete room - handle race condition where archival already deleted it
            try {
              const deleted = await this.roomRepository.delete(room.pin);
              if (!deleted) {
                // Room was already deleted (by archival or another process) - this is expected
                console.log(`Room ${room.pin} already deleted by archival process`);
              }
            } catch (deleteError) {
              // Log but don't fail - room may have been deleted by concurrent operation
              console.warn(`Room ${room.pin} delete failed (may already be deleted):`, deleteError.message);
            }
          }
        } catch (roomError) {
          // Log error for this room but continue processing others
          console.error(`Error processing room ${room.pin}:`, roomError.message);
        }
      }

      // Clean up expired player tokens from repository indexes
      try {
        const expiredTokensRemoved = this.roomRepository.cleanupExpiredTokens();
        if (expiredTokensRemoved > 0) {
          console.log(`Cleaned up ${expiredTokensRemoved} expired player tokens`);
        }
      } catch (tokenError) {
        console.error('Token cleanup error:', tokenError.message);
      }

      // Clean up expired join locks to prevent memory leak
      if (this.roomUseCases) {
        try {
          const expiredLocksRemoved = this.roomUseCases.cleanupExpiredJoinLocks();
          if (expiredLocksRemoved > 0) {
            console.log(`Cleaned up ${expiredLocksRemoved} expired join locks`);
          }
        } catch (lockError) {
          console.error('Join lock cleanup error:', lockError.message);
        }
      }

      // Clean up expired game locks (pending answers and archives) to prevent memory leak
      if (this.gameUseCases) {
        try {
          const { pendingAnswers, pendingArchives } = this.gameUseCases.cleanupExpiredLocks();
          if (pendingAnswers > 0 || pendingArchives > 0) {
            console.log(`Cleaned up ${pendingAnswers} expired pending answers, ${pendingArchives} expired pending archives`);
          }
        } catch (lockError) {
          console.error('Game lock cleanup error:', lockError.message);
        }
      }
    } catch (error) {
      console.error('Room cleanup error:', error.message);
    } finally {
      // Always release the lock
      this.isCleanupRunning = false;
    }
  }
}

module.exports = { RoomCleanupService };
