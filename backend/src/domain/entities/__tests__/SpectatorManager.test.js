const { SpectatorManager } = require('../SpectatorManager');
const { Spectator } = require('../Spectator');

function createSpectator(overrides = {}) {
  return new Spectator({
    id: 'spec-1',
    socketId: 'sock-1',
    nickname: 'Viewer',
    roomPin: '123456',
    token: 'tok-1',
    ...overrides
  });
}

describe('SpectatorManager', () => {
  let sm;

  beforeEach(() => {
    sm = new SpectatorManager();
  });

  describe('add', () => {
    it('should add a spectator', () => {
      sm.add(createSpectator(), []);
      expect(sm.getCount()).toBe(1);
    });

    it('should throw when max spectators reached', () => {
      for (let i = 0; i < 10; i++) {
        sm.add(createSpectator({ id: `s${i}`, socketId: `sock-${i}`, nickname: `V${i}`, token: `t${i}` }), []);
      }
      expect(() => sm.add(createSpectator({ id: 's10', socketId: 'sock-10', nickname: 'V10', token: 't10' }), []))
        .toThrow('maximum');
    });

    it('should throw if nickname collides with player', () => {
      const players = [{ hasNickname: (n) => n.toLowerCase() === 'viewer' }];
      expect(() => sm.add(createSpectator(), players)).toThrow('Nickname already taken');
    });

    it('should throw if nickname collides with other spectator', () => {
      sm.add(createSpectator(), []);
      expect(() => sm.add(createSpectator({ id: 's2', socketId: 'sock-2', token: 'tok-2' }), []))
        .toThrow('Nickname already taken');
    });

    it('should throw if nickname is banned', () => {
      const bannedNicknames = ['viewer'];
      expect(() => sm.add(createSpectator(), [], bannedNicknames)).toThrow('banned');
    });

    it('should handle banned nickname with invalid nickname format', () => {
      // nickname that fails Nickname validation falls back to toLowerCase
      const spec = createSpectator({ nickname: 'AB' }); // valid, short but >= 2
      const bannedNicknames = ['ab'];
      expect(() => sm.add(spec, [], bannedNicknames)).toThrow('banned');
    });
  });

  describe('remove', () => {
    it('should remove spectator by socketId', () => {
      sm.add(createSpectator(), []);
      sm.remove('sock-1');
      expect(sm.getCount()).toBe(0);
    });
  });

  describe('getBySocketId', () => {
    it('should find spectator', () => {
      sm.add(createSpectator(), []);
      expect(sm.getBySocketId('sock-1')).not.toBeNull();
    });

    it('should return null if not found', () => {
      expect(sm.getBySocketId('nonexistent')).toBeNull();
    });
  });

  describe('getByToken', () => {
    it('should find spectator by token', () => {
      sm.add(createSpectator(), []);
      expect(sm.getByToken('tok-1')).not.toBeNull();
    });

    it('should return null if not found', () => {
      expect(sm.getByToken('nonexistent')).toBeNull();
    });
  });

  describe('isSpectator', () => {
    it('should return true for existing spectator', () => {
      sm.add(createSpectator(), []);
      expect(sm.isSpectator('sock-1')).toBe(true);
    });

    it('should return false for non-spectator', () => {
      expect(sm.isSpectator('nonexistent')).toBe(false);
    });
  });

  describe('setDisconnected', () => {
    it('should mark spectator as disconnected', () => {
      sm.add(createSpectator(), []);
      const spec = sm.setDisconnected('sock-1');
      expect(spec.isDisconnected()).toBe(true);
    });

    it('should return null if not found', () => {
      expect(sm.setDisconnected('nonexistent')).toBeNull();
    });
  });

  describe('reconnect', () => {
    it('should reconnect spectator', () => {
      sm.add(createSpectator(), []);
      sm.setDisconnected('sock-1');
      const spec = sm.reconnect('tok-1', 'new-sock');
      expect(spec.socketId).toBe('new-sock');
      expect(spec.isDisconnected()).toBe(false);
    });

    it('should throw for invalid token', () => {
      expect(() => sm.reconnect('bad-token', 'sock')).toThrow('Invalid spectator token');
    });

    it('should throw for expired token', () => {
      sm.add(createSpectator(), []);
      const spec = sm.getBySocketId('sock-1');
      spec.tokenCreatedAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
      expect(() => sm.reconnect('tok-1', 'new-sock')).toThrow('expired');
    });

    it('should throw if grace period exceeded', () => {
      sm.add(createSpectator(), []);
      const spec = sm.getBySocketId('sock-1');
      spec.setDisconnected();
      spec.disconnectedAt = new Date(Date.now() - 60000);
      expect(() => sm.reconnect('tok-1', 'new-sock', 1000)).toThrow('Reconnection timeout expired');
    });

    it('should allow reconnect within grace period', () => {
      sm.add(createSpectator(), []);
      const spec = sm.getBySocketId('sock-1');
      spec.setDisconnected();
      const result = sm.reconnect('tok-1', 'new-sock', 300000);
      expect(result.socketId).toBe('new-sock');
    });

    it('should reconnect with new token', () => {
      sm.add(createSpectator(), []);
      sm.setDisconnected('sock-1');
      const spec = sm.reconnect('tok-1', 'new-sock', null, 'new-token');
      expect(spec.token).toBe('new-token');
    });
  });

  describe('removeStaleDisconnected', () => {
    it('should remove stale spectators', () => {
      sm.add(createSpectator(), []);
      const spec = sm.getBySocketId('sock-1');
      spec.setDisconnected();
      spec.disconnectedAt = new Date(Date.now() - 60000);
      const stale = sm.removeStaleDisconnected(1000);
      expect(stale).toHaveLength(1);
      expect(sm.getCount()).toBe(0);
    });

    it('should keep non-stale spectators', () => {
      sm.add(createSpectator(), []);
      sm.setDisconnected('sock-1');
      const stale = sm.removeStaleDisconnected(300000);
      expect(stale).toHaveLength(0);
      expect(sm.getCount()).toBe(1);
    });
  });

  describe('getDisconnected', () => {
    it('should return only disconnected spectators', () => {
      sm.add(createSpectator(), []);
      sm.add(createSpectator({ id: 's2', socketId: 'sock-2', nickname: 'V2', token: 't2' }), []);
      sm.setDisconnected('sock-1');
      expect(sm.getDisconnected()).toHaveLength(1);
    });
  });

  describe('getConnectedCount', () => {
    it('should return connected count', () => {
      sm.add(createSpectator(), []);
      sm.add(createSpectator({ id: 's2', socketId: 'sock-2', nickname: 'V2', token: 't2' }), []);
      sm.setDisconnected('sock-1');
      expect(sm.getConnectedCount()).toBe(1);
    });
  });

  describe('getAll', () => {
    it('should return a copy', () => {
      sm.add(createSpectator(), []);
      const all = sm.getAll();
      expect(all).toHaveLength(1);
      all.push(createSpectator({ id: 'extra', socketId: 'extra', nickname: 'VX', token: 'tx' }));
      expect(sm.getCount()).toBe(1);
    });
  });
});
