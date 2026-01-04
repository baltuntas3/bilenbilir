const { BaseParticipant } = require('../BaseParticipant');

describe('BaseParticipant', () => {
  let participant;

  beforeEach(() => {
    participant = new BaseParticipant({
      id: 'participant-1',
      socketId: 'socket-1',
      nickname: 'TestUser',
      roomPin: '123456'
    });
  });

  describe('constructor', () => {
    it('should create participant with default values', () => {
      expect(participant.id).toBe('participant-1');
      expect(participant.socketId).toBe('socket-1');
      expect(participant.nickname).toBe('TestUser');
      expect(participant.roomPin).toBe('123456');
      expect(participant.disconnectedAt).toBeNull();
      expect(participant.joinedAt).toBeInstanceOf(Date);
    });

    it('should create participant with token', () => {
      const withToken = new BaseParticipant({
        id: 'p-1',
        socketId: 's-1',
        nickname: 'User1',
        roomPin: '111111',
        token: 'test-token-123'
      });

      expect(withToken.getToken()).toBe('test-token-123');
      expect(withToken.tokenCreatedAt).toBeInstanceOf(Date);
    });
  });

  describe('nickname methods', () => {
    it('should return nickname as string', () => {
      expect(participant.nickname).toBe('TestUser');
    });

    it('should check nickname case-insensitively', () => {
      expect(participant.hasNickname('TestUser')).toBe(true);
      expect(participant.hasNickname('testuser')).toBe(true);
      expect(participant.hasNickname('TESTUSER')).toBe(true);
      expect(participant.hasNickname('OtherUser')).toBe(false);
    });

    it('should return normalized nickname', () => {
      expect(participant.getNormalizedNickname()).toBe('testuser');
    });
  });

  describe('disconnect and reconnect', () => {
    it('should track disconnection', () => {
      expect(participant.isDisconnected()).toBe(false);

      participant.setDisconnected();

      expect(participant.isDisconnected()).toBe(true);
      expect(participant.disconnectedAt).toBeInstanceOf(Date);
    });

    it('should calculate disconnection duration', () => {
      expect(participant.getDisconnectedDuration()).toBe(0);

      participant.setDisconnected();

      expect(participant.getDisconnectedDuration()).toBeGreaterThanOrEqual(0);
    });

    it('should reconnect with new socket id', () => {
      participant.setDisconnected();
      participant.reconnect('new-socket-id');

      expect(participant.isDisconnected()).toBe(false);
      expect(participant.socketId).toBe('new-socket-id');
      expect(participant.disconnectedAt).toBeNull();
    });

    it('should rotate token on reconnect', () => {
      participant.setToken('old-token');
      participant.setDisconnected();
      participant.reconnect('new-socket-id', 'new-token');

      expect(participant.getToken()).toBe('new-token');
      expect(participant.tokenCreatedAt).toBeInstanceOf(Date);
    });
  });

  describe('token management', () => {
    it('should return false for hasValidToken when no token', () => {
      expect(participant.hasValidToken()).toBe(false);
    });

    it('should return true for hasValidToken when token exists', () => {
      participant.setToken('valid-token');
      expect(participant.hasValidToken()).toBe(true);
    });

    it('should return true for isTokenExpired when no token', () => {
      expect(participant.isTokenExpired()).toBe(true);
    });

    it('should return false for isTokenExpired when token is fresh', () => {
      participant.setToken('fresh-token');
      expect(participant.isTokenExpired()).toBe(false);
    });

    it('should set and get token', () => {
      participant.setToken('my-token');
      expect(participant.getToken()).toBe('my-token');
    });
  });

  describe('TOKEN_EXPIRATION_MS', () => {
    it('should be 24 hours', () => {
      expect(BaseParticipant.TOKEN_EXPIRATION_MS).toBe(24 * 60 * 60 * 1000);
    });
  });
});
