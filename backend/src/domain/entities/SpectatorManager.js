const { ValidationError, UnauthorizedError, ForbiddenError } = require('../../shared/errors');
const { MAX_SPECTATORS } = require('../../shared/config/constants');

class SpectatorManager {
  constructor() {
    this.spectators = [];
  }

  add(spectator, players, bannedNicknames = []) {
    if (this.spectators.length >= MAX_SPECTATORS) {
      throw new ValidationError(`Room is full (maximum ${MAX_SPECTATORS} spectators)`);
    }
    const nicknameExistsPlayer = players.some(p => p.hasNickname(spectator.nickname));
    const nicknameExistsSpectator = this.spectators.some(s => s.hasNickname(spectator.nickname));
    if (nicknameExistsPlayer || nicknameExistsSpectator) {
      throw new ValidationError('Nickname already taken');
    }
    // Check banned nicknames using the same normalization as Room._normalizeNickname
    if (bannedNicknames.length > 0) {
      const { Nickname } = require('../value-objects/Nickname');
      let normalized;
      try {
        normalized = new Nickname(spectator.nickname).normalized();
      } catch {
        // Invalid nicknames cannot be normalized consistently — return empty
        // to avoid mismatches between ban check and Nickname VO validation
        normalized = '';
      }
      if (normalized && bannedNicknames.includes(normalized)) {
        throw new ForbiddenError('This nickname is banned from this room');
      }
    }
    this.spectators.push(spectator);
  }

  remove(socketId) {
    const spectator = this.getBySocketId(socketId);
    this.spectators = this.spectators.filter(s => s.socketId !== socketId);
    return spectator || null;
  }

  getBySocketId(socketId) {
    return this.spectators.find(s => s.socketId === socketId) || null;
  }

  getByToken(spectatorToken) {
    return this.spectators.find(s => s.token === spectatorToken) || null;
  }

  getCount() {
    return this.spectators.length;
  }

  getAll() {
    return [...this.spectators];
  }

  isSpectator(socketId) {
    return this.spectators.some(s => s.socketId === socketId);
  }

  setDisconnected(socketId) {
    const spectator = this.getBySocketId(socketId);
    if (spectator) spectator.setDisconnected();
    return spectator;
  }

  reconnect(spectatorToken, newSocketId, gracePeriodMs = null, newToken = null) {
    const spectator = this.getByToken(spectatorToken);
    if (!spectator) throw new UnauthorizedError('Invalid spectator token');
    if (spectator.isTokenExpired()) throw new UnauthorizedError('Spectator token has expired');
    if (gracePeriodMs !== null && spectator.isDisconnected()) {
      if (spectator.getDisconnectedDuration() > gracePeriodMs) {
        throw new ForbiddenError('Reconnection timeout expired');
      }
    }
    spectator.reconnect(newSocketId, newToken);
    return spectator;
  }

  removeStaleDisconnected(gracePeriodMs) {
    // Single pass partition to avoid time-dependent double evaluation
    const stale = [];
    const remaining = [];
    for (const spectator of this.spectators) {
      if (spectator.isDisconnected() && spectator.getDisconnectedDuration() > gracePeriodMs) {
        stale.push(spectator);
      } else {
        remaining.push(spectator);
      }
    }
    if (stale.length > 0) this.spectators = remaining;
    return stale;
  }

  getDisconnected() {
    return this.spectators.filter(s => s.isDisconnected());
  }

  getConnectedCount() {
    return this.spectators.filter(s => !s.isDisconnected()).length;
  }
}

module.exports = { SpectatorManager };
