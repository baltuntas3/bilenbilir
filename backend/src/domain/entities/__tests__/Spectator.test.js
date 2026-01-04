const { Spectator } = require('../Spectator');

describe('Spectator', () => {
  let spectator;

  beforeEach(() => {
    spectator = new Spectator({
      id: 'spectator-1',
      socketId: 'socket-1',
      nickname: 'Watcher',
      roomPin: '123456'
    });
  });

  describe('constructor', () => {
    it('should create spectator with default values', () => {
      expect(spectator.id).toBe('spectator-1');
      expect(spectator.socketId).toBe('socket-1');
      expect(spectator.nickname).toBe('Watcher');
      expect(spectator.roomPin).toBe('123456');
      expect(spectator.spectatorToken).toBeNull();
      expect(spectator.disconnectedAt).toBeNull();
      expect(spectator.joinedAt).toBeInstanceOf(Date);
    });

    it('should create spectator with token', () => {
      const withToken = new Spectator({
        id: 's-1',
        socketId: 'socket-1',
        nickname: 'Viewer',
        roomPin: '111111',
        spectatorToken: 'token-123'
      });

      expect(withToken.spectatorToken).toBe('token-123');
      expect(withToken.tokenCreatedAt).toBeInstanceOf(Date);
    });
  });

  describe('spectatorToken property', () => {
    it('should get and set spectatorToken', () => {
      spectator.spectatorToken = 'new-token';
      expect(spectator.spectatorToken).toBe('new-token');
    });
  });

  describe('nickname methods (inherited from BaseParticipant)', () => {
    it('should return nickname as string', () => {
      expect(spectator.nickname).toBe('Watcher');
    });

    it('should check nickname case-insensitively', () => {
      expect(spectator.hasNickname('Watcher')).toBe(true);
      expect(spectator.hasNickname('watcher')).toBe(true);
      expect(spectator.hasNickname('WATCHER')).toBe(true);
      expect(spectator.hasNickname('Other')).toBe(false);
    });

    it('should return normalized nickname', () => {
      expect(spectator.getNormalizedNickname()).toBe('watcher');
    });
  });

  describe('disconnect and reconnect (inherited from BaseParticipant)', () => {
    it('should track disconnection', () => {
      expect(spectator.isDisconnected()).toBe(false);

      spectator.setDisconnected();

      expect(spectator.isDisconnected()).toBe(true);
    });

    it('should reconnect with new socket id', () => {
      spectator.setDisconnected();
      spectator.reconnect('new-socket-id');

      expect(spectator.isDisconnected()).toBe(false);
      expect(spectator.socketId).toBe('new-socket-id');
    });

    it('should rotate token on reconnect', () => {
      spectator.spectatorToken = 'old-token';
      spectator.setDisconnected();
      spectator.reconnect('new-socket-id', 'new-token');

      expect(spectator.spectatorToken).toBe('new-token');
    });
  });

  describe('token management (inherited from BaseParticipant)', () => {
    it('should return false for hasValidToken when no token', () => {
      expect(spectator.hasValidToken()).toBe(false);
    });

    it('should return true for hasValidToken when token exists', () => {
      spectator.spectatorToken = 'valid-token';
      // Need to also set tokenCreatedAt for hasValidToken to work properly
      spectator.tokenCreatedAt = new Date();
      expect(spectator.hasValidToken()).toBe(true);
    });

    it('should return true for isTokenExpired when no token', () => {
      expect(spectator.isTokenExpired()).toBe(true);
    });
  });

  describe('toJSON', () => {
    it('should return serialized object', () => {
      const json = spectator.toJSON();

      expect(json).toEqual({
        id: 'spectator-1',
        nickname: 'Watcher',
        joinedAt: spectator.joinedAt,
        isDisconnected: false
      });
    });

    it('should reflect disconnection status', () => {
      spectator.setDisconnected();
      const json = spectator.toJSON();

      expect(json.isDisconnected).toBe(true);
    });
  });

  describe('TOKEN_EXPIRATION_MS', () => {
    it('should be 24 hours', () => {
      expect(Spectator.TOKEN_EXPIRATION_MS).toBe(24 * 60 * 60 * 1000);
    });
  });
});
