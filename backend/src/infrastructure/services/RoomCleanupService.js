const { RoomState } = require('../../domain/entities');
const {
  HOST_GRACE_PERIOD_MS,
  PLAYER_GRACE_PERIOD_MS,
  SPECTATOR_GRACE_PERIOD_MS,
  ROOM_CLEANUP_INTERVAL_MS,
  MAX_EXTENDED_TIMER_SECONDS
} = require('../../shared/config/constants');

/**
 * Room Cleanup Service
 * Periodically cleans up stale rooms and related resources
 */
class RoomCleanupService {
  constructor(roomRepository, io, options = {}) {
    this.roomRepository = roomRepository;
    this.io = io;
    this.roomUseCases = options.roomUseCases || null;
    this.gameUseCases = options.gameUseCases || null;
    this.timerService = options.timerService || null;
    // Injected from outside to avoid infrastructure → API layer dependency
    this.autoAdvanceToResults = options.autoAdvanceToResults || null;
    this.endAnsweringLocks = options.endAnsweringLocks || null;
    // Additional LockManagers to clean up expired entries periodically
    this.managedLocks = options.managedLocks || [];
    this.intervalId = null;
    this.isCleanupRunning = false;

    // Configuration — defaults sourced from shared constants to prevent drift
    this.checkInterval = options.checkInterval || ROOM_CLEANUP_INTERVAL_MS;
    this.hostGracePeriod = options.hostGracePeriod || HOST_GRACE_PERIOD_MS;
    this.playerGracePeriod = options.playerGracePeriod || PLAYER_GRACE_PERIOD_MS;
    this.spectatorGracePeriod = options.spectatorGracePeriod || SPECTATOR_GRACE_PERIOD_MS;
    this.emptyRoomTimeout = options.emptyRoomTimeout || 300000; // 5 minutes for empty rooms
    this.idleRoomTimeout = options.idleRoomTimeout || 3600000; // 1 hour for idle rooms
    this.maxPauseDuration = options.maxPauseDuration || 1800000; // 30 minutes max pause
    this.podiumTimeout = options.podiumTimeout || 300000; // 5 minutes for finished games

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
   * After removing stale players, check if remaining connected players have all answered.
   * If so, auto-advance to prevent the game from getting stuck in ANSWERING_PHASE.
   * @private
   */
  async _checkAutoAdvanceAfterRemoval(room) {
    if (!this.autoAdvanceToResults || !this.io) return;
    if (!room.shouldAutoAdvance()) return;
    await this._forceAutoAdvance(room.pin);
  }

  /**
   * Force auto-advance from ANSWERING_PHASE to SHOW_RESULTS.
   * Shared by stale-player removal and paused-game resume paths.
   * @private
   */
  async _forceAutoAdvance(pin) {
    if (!this.autoAdvanceToResults || !this.io) return;
    await this.autoAdvanceToResults({
      io: this.io,
      pin,
      endAnsweringLocks: this.endAnsweringLocks,
      timerService: this.timerService,
      gameUseCases: this.gameUseCases
    });
  }

  /**
   * Handle timer restart or auto-advance after resuming to ANSWERING_PHASE.
   * Prevents the game from getting stuck without a running timer.
   * @private
   */
  async _handleAnsweringPhaseResume(room, pausedTimerState) {
    if (room.shouldAutoAdvance()) {
      await this._forceAutoAdvance(room.pin);
      return;
    }
    if (this.timerService && pausedTimerState && pausedTimerState.remainingMs > 0) {
      const remainingSeconds = Math.max(1, Math.round(pausedTimerState.remainingMs / 1000));
      this.timerService.startTimer(room.pin, remainingSeconds, async () => {
        if (this.io) this.io.to(room.pin).emit('time_expired');
        await this._forceAutoAdvance(room.pin);
      }, {
        minDuration: 1,
        maxDuration: MAX_EXTENDED_TIMER_SECONDS,
        originalDurationMs: pausedTimerState.originalDurationMs
      });
    } else {
      // No timer state or no time remaining — force end
      if (this.io) this.io.to(room.pin).emit('time_expired');
      await this._forceAutoAdvance(room.pin);
    }
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
    // Safety timeout to prevent permanent lock if cleanup hangs
    const safetyTimeout = setTimeout(() => {
      if (this.isCleanupRunning) {
        console.error('Cleanup safety timeout reached, releasing lock');
        this.isCleanupRunning = false;
      }
    }, this.checkInterval * 3);
    try {
      const rooms = await this.roomRepository.getAll();

      for (const room of rooms) {
        try {
          const now = Date.now();
          const roomAge = now - room.createdAt.getTime();
          const hasDisconnectedHost = room.isHostDisconnected();
          const hasNoPlayers = room.getPlayerCount() === 0;
          const isActiveGame = this._isActiveGame(room);

          // Fast path: skip rooms that are clearly healthy
          // (host connected, has players, not idle, game active or recently created)
          if (!hasDisconnectedHost && !hasNoPlayers && roomAge < this.emptyRoomTimeout) {
            // Collect all stale removals BEFORE saving — single save prevents stale reference issues
            const stalePlayers = room.removeStaleDisconnectedPlayers(this.playerGracePeriod);
            const staleSpectators = room.removeStaleDisconnectedSpectators(this.spectatorGracePeriod);
            const hasChanges = stalePlayers.length > 0 || staleSpectators.length > 0;

            if (hasChanges) {
              // Emit notifications
              if (this.io) {
                stalePlayers.forEach(player => {
                  this.io.to(room.pin).emit('player_removed', {
                    playerId: player.id,
                    nickname: player.nickname,
                    reason: 'reconnection_timeout',
                    playerCount: room.getPlayerCount(),
                    connectedPlayerCount: room.getConnectedPlayerCount()
                  });
                });
                staleSpectators.forEach(spectator => {
                  this.io.to(room.pin).emit('spectator_left', {
                    spectatorId: spectator.id,
                    nickname: spectator.nickname,
                    spectatorCount: room.getSpectatorCount()
                  });
                });
              }
              // Single save for all mutations
              await this.roomRepository.save(room);
            }
            // Auto-advance check AFTER save — autoAdvance loads fresh room from repo
            if (stalePlayers.length > 0) {
              // Notify host when all players have left during an active game
              if (room.getConnectedPlayerCount() === 0 && this._isActiveGame(room) && this.io) {
                this.io.to(room.pin).emit('all_players_left');
              }
              await this._checkAutoAdvanceAfterRemoval(room);
            }
            continue;
          }

          let shouldDelete = false;
          let reason = '';

          // Collect all stale removals BEFORE saving — single save prevents stale reference issues
          const stalePlayers = room.removeStaleDisconnectedPlayers(this.playerGracePeriod);
          const staleSpectators = room.removeStaleDisconnectedSpectators(this.spectatorGracePeriod);

          if (stalePlayers.length > 0 || staleSpectators.length > 0) {
            if (stalePlayers.length > 0) console.log(`Removed ${stalePlayers.length} stale players from room ${room.pin}`);
            if (staleSpectators.length > 0) console.log(`Removed ${staleSpectators.length} stale spectators from room ${room.pin}`);

            if (this.io) {
              stalePlayers.forEach(player => {
                this.io.to(room.pin).emit('player_removed', {
                  playerId: player.id,
                  nickname: player.nickname,
                  reason: 'reconnection_timeout'
                });
              });
              staleSpectators.forEach(spectator => {
                this.io.to(room.pin).emit('spectator_left', {
                  spectatorId: spectator.id,
                  nickname: spectator.nickname,
                  spectatorCount: room.getSpectatorCount()
                });
              });
            }

            // Single save for all mutations
            await this.roomRepository.save(room);

            // Auto-advance check AFTER save — autoAdvance loads fresh room from repo
            if (stalePlayers.length > 0) {
              // Notify host when all players have left during an active game
              if (room.getConnectedPlayerCount() === 0 && this._isActiveGame(room) && this.io) {
                this.io.to(room.pin).emit('all_players_left');
              }
              await this._checkAutoAdvanceAfterRemoval(room);
            }
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

          // Check if game has been paused too long
          if (!shouldDelete && room.state === RoomState.PAUSED) {
            const pauseDuration = room.getPauseDuration();
            if (pauseDuration > this.maxPauseDuration) {
              // If host is disconnected, no one can control the game — archive and close
              if (room.isHostDisconnected()) {
                shouldDelete = true;
                reason = 'Paused game timeout (host unavailable)';
              } else {
                // Host is connected: auto-resume to previous state
                try {
                  // Capture timer state BEFORE resume clears it
                  const pausedTimerState = room.getPausedTimerState();
                  room.resume(room.hostId);
                  await this.roomRepository.save(room);
                  console.log(`Auto-resumed room ${room.pin} after ${Math.round(pauseDuration / 1000)}s pause`);

                  if (room.state === RoomState.ANSWERING_PHASE) {
                    // Check if auto-advance is needed BEFORE emitting game_resumed
                    // to prevent a brief ANSWERING_PHASE flash on clients.
                    const needsAutoAdvance = room.shouldAutoAdvance()
                      || !pausedTimerState || pausedTimerState.remainingMs <= 0;

                    if (needsAutoAdvance) {
                      if (!room.shouldAutoAdvance() && this.io) {
                        this.io.to(room.pin).emit('time_expired');
                      }
                      await this._forceAutoAdvance(room.pin);
                    } else {
                      if (this.io) {
                        this.io.to(room.pin).emit('game_resumed', {
                          state: room.state,
                          pauseDuration
                        });
                      }
                      await this._handleAnsweringPhaseResume(room, pausedTimerState);
                    }
                  } else {
                    if (this.io) {
                      this.io.to(room.pin).emit('game_resumed', {
                        state: room.state,
                        pauseDuration
                      });
                    }
                  }
                } catch (resumeError) {
                  console.error(`Auto-resume failed for room ${room.pin}:`, resumeError.message);
                  shouldDelete = true;
                  reason = 'Paused game timeout (resume failed)';
                }
              }
            }
          }

          // Clean up finished games (PODIUM) after podiumTimeout
          if (!shouldDelete && room.state === RoomState.PODIUM) {
            const podiumReachedAt = room.getPodiumReachedAt();
            const podiumAge = podiumReachedAt
              ? Date.now() - podiumReachedAt.getTime()
              : roomAge;
            if (podiumAge > this.podiumTimeout) {
              shouldDelete = true;
              reason = 'Finished game cleanup (PODIUM timeout)';
            }
          }

          // Active game with no connected players — host is stuck.
          // Give host 2 minutes to end the game manually before auto-closing.
          if (!shouldDelete && isActiveGame && !hasDisconnectedHost && room.getConnectedPlayerCount() === 0) {
            if (hasNoPlayers || roomAge > this.playerGracePeriod) {
              shouldDelete = true;
              reason = 'Active game with no players (all players left)';
            }
          }

          // Check if room is empty for too long (no players at all)
          if (!shouldDelete && hasNoPlayers && !isActiveGame) {
            if (roomAge > this.emptyRoomTimeout) {
              shouldDelete = true;
              reason = 'Empty room timeout';
            }
          }

          // Check if room has been idle too long
          // Use longer timeout for active games
          if (!shouldDelete) {
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

            // Stop any active timer for this room
            if (this.timerService) {
              this.timerService.stopTimer(room.pin);
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
      // Clean up expired entries in all managed LockManagers
      for (const lock of this.managedLocks) {
        try { lock.cleanupExpired(); } catch { /* best-effort */ }
      }
      clearTimeout(safetyTimeout);
      this.isCleanupRunning = false;
    }
  }
}

module.exports = { RoomCleanupService };
