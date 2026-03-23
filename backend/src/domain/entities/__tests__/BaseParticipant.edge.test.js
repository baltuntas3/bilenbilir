const { BaseParticipant } = require('../BaseParticipant');
const { Nickname } = require('../../value-objects/Nickname');

describe('BaseParticipant edge cases', () => {
  it('should accept Nickname instance directly', () => {
    const nickname = new Nickname('TestUser');
    const bp = new BaseParticipant({ id: 'b1', socketId: 's1', nickname, roomPin: '123456' });
    expect(bp.nickname).toBe('TestUser');
  });

  it('should return true for isTokenExpired when tokenCreatedAt is null', () => {
    const bp = new BaseParticipant({ id: 'b1', socketId: 's1', nickname: 'Test', roomPin: '123456', token: 'tok' });
    bp.tokenCreatedAt = null;
    expect(bp.isTokenExpired()).toBe(true);
  });

  it('should return true for isTokenExpired when no valid token', () => {
    const bp = new BaseParticipant({ id: 'b1', socketId: 's1', nickname: 'Test', roomPin: '123456' });
    expect(bp.isTokenExpired()).toBe(true);
  });
});
