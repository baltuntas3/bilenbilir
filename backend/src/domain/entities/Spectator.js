const { BaseParticipant, TOKEN_EXPIRATION_MS } = require('./BaseParticipant');

/**
 * Spectator Entity
 * Represents a viewer who can watch the game but cannot participate
 * Extends BaseParticipant for shared nickname/token/disconnect logic
 */
class Spectator extends BaseParticipant {
  static TOKEN_EXPIRATION_MS = TOKEN_EXPIRATION_MS;

  constructor({ id, socketId, nickname, roomPin, token = null, spectatorToken = null, tokenCreatedAt = null, joinedAt = new Date() }) {
    super({ id, socketId, nickname, roomPin, token: token || spectatorToken, tokenCreatedAt, joinedAt });
  }

  // Backward-compatible alias for token
  get spectatorToken() {
    return this.token;
  }

  set spectatorToken(value) {
    this.token = value;
  }

  /**
   * Convert to plain object for serialization
   */
  toJSON() {
    return {
      id: this.id,
      nickname: this.nickname,
      joinedAt: this.joinedAt,
      isDisconnected: this.isDisconnected()
    };
  }
}

module.exports = { Spectator };
