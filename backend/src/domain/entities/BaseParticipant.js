const { Nickname } = require('../value-objects/Nickname');

// Token expires after 24 hours
const TOKEN_EXPIRATION_MS = 24 * 60 * 60 * 1000;

/**
 * Base class for Player and Spectator entities
 * Contains shared logic for nickname, token, and disconnection handling
 */
class BaseParticipant {
  static TOKEN_EXPIRATION_MS = TOKEN_EXPIRATION_MS;

  constructor({ id, socketId, nickname, roomPin, token = null, tokenCreatedAt = null, joinedAt = new Date() }) {
    this.id = id;
    this.socketId = socketId;
    this._nickname = nickname instanceof Nickname ? nickname : new Nickname(nickname);
    this.roomPin = roomPin;
    this._token = token;
    this.tokenCreatedAt = tokenCreatedAt || (token ? new Date() : null);
    this.joinedAt = joinedAt;
    this.disconnectedAt = null;
  }

  get nickname() {
    return this._nickname.toString();
  }

  /**
   * Check if participant has the given nickname (case-insensitive)
   * @param {string|Nickname} other - Nickname to compare
   * @returns {boolean}
   */
  hasNickname(other) {
    return this._nickname.equalsIgnoreCase(other);
  }

  /**
   * Get normalized (lowercase) nickname for lookups
   * @returns {string}
   */
  getNormalizedNickname() {
    return this._nickname.normalized();
  }

  /**
   * Mark participant as disconnected
   */
  setDisconnected() {
    this.disconnectedAt = new Date();
  }

  /**
   * Check if participant is disconnected
   * @returns {boolean}
   */
  isDisconnected() {
    return this.disconnectedAt !== null;
  }

  /**
   * Get disconnection duration in milliseconds
   * @returns {number}
   */
  getDisconnectedDuration() {
    if (!this.disconnectedAt) return 0;
    return Date.now() - this.disconnectedAt.getTime();
  }

  /**
   * Check if the participant has a valid token
   * @returns {boolean}
   */
  hasValidToken() {
    return this._token !== null &&
           this._token !== undefined &&
           typeof this._token === 'string' &&
           this._token.length > 0;
  }

  /**
   * Check if the participant token has expired
   * @returns {boolean}
   */
  isTokenExpired() {
    if (!this.hasValidToken()) return true;
    if (!this.tokenCreatedAt) return true;
    return Date.now() - this.tokenCreatedAt.getTime() > TOKEN_EXPIRATION_MS;
  }

  /**
   * Reconnect participant with new socket ID
   * @param {string} newSocketId - New socket ID
   * @param {string|null} newToken - Optional new token for rotation
   */
  reconnect(newSocketId, newToken = null) {
    this.socketId = newSocketId;
    this.disconnectedAt = null;
    // Rotate token on reconnect for security
    if (newToken) {
      this._token = newToken;
      this.tokenCreatedAt = new Date();
    }
  }

  /**
   * Get the token (to be overridden by subclasses for proper property name)
   * @returns {string|null}
   */
  getToken() {
    return this._token;
  }

  /**
   * Set the token (to be overridden by subclasses for proper property name)
   * @param {string} token
   */
  setToken(token) {
    this._token = token;
    this.tokenCreatedAt = new Date();
  }
}

module.exports = { BaseParticipant, TOKEN_EXPIRATION_MS };
