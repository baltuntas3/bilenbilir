const { Nickname } = require('../value-objects/Nickname');
const { TOKEN_EXPIRATION_MS } = require('../../shared/config/constants');

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

  hasNickname(other) {
    return this._nickname.equalsIgnoreCase(other);
  }

  getNormalizedNickname() {
    return this._nickname.normalized();
  }

  setDisconnected() {
    this.disconnectedAt = new Date();
  }

  isDisconnected() {
    return this.disconnectedAt !== null;
  }

  getDisconnectedDuration() {
    if (!this.disconnectedAt) return 0;
    return Date.now() - this.disconnectedAt.getTime();
  }

  hasValidToken() {
    return this._token !== null &&
           this._token !== undefined &&
           typeof this._token === 'string' &&
           this._token.length > 0;
  }

  isTokenExpired() {
    if (!this.hasValidToken()) return true;
    if (!this.tokenCreatedAt) return true;
    return Date.now() - this.tokenCreatedAt.getTime() > TOKEN_EXPIRATION_MS;
  }

  get token() {
    return this._token;
  }

  set token(value) {
    this._token = value;
    this.tokenCreatedAt = new Date();
  }

  // Backward-compatible aliases for token access
  getToken() {
    return this._token;
  }

  setToken(token) {
    this._token = token;
    this.tokenCreatedAt = new Date();
  }

  reconnect(newSocketId, newToken = null) {
    this.socketId = newSocketId;
    this.disconnectedAt = null;
    if (newToken) {
      this._token = newToken;
      this.tokenCreatedAt = new Date();
    }
  }
}

module.exports = { BaseParticipant, TOKEN_EXPIRATION_MS };
