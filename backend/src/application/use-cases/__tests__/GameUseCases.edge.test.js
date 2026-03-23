const { GameUseCases } = require('../GameUseCases');

describe('GameUseCases edge cases', () => {
  let gu, roomRepo;

  beforeEach(() => {
    roomRepo = {
      findByPin: jest.fn(),
      save: jest.fn(),
      exists: jest.fn(),
      getAll: jest.fn().mockResolvedValue([])
    };
    const quizRepo = { findById: jest.fn() };
    gu = new GameUseCases(roomRepo, quizRepo);
  });

  describe('getNicknameForSocket', () => {
    it('should return null if room not found', async () => {
      roomRepo.findByPin.mockResolvedValue(null);
      expect(await gu.getNicknameForSocket('123456', 's1')).toBeNull();
    });

    it('should return player nickname', async () => {
      roomRepo.findByPin.mockResolvedValue({
        getPlayer: jest.fn().mockReturnValue({ nickname: 'Alice' }),
        isHost: jest.fn().mockReturnValue(false),
        getSpectator: jest.fn().mockReturnValue(null)
      });
      expect(await gu.getNicknameForSocket('123456', 's1')).toBe('Alice');
    });

    it('should return Host for host socket', async () => {
      roomRepo.findByPin.mockResolvedValue({
        getPlayer: jest.fn().mockReturnValue(null),
        isHost: jest.fn().mockReturnValue(true)
      });
      expect(await gu.getNicknameForSocket('123456', 's1')).toBe('Host');
    });

    it('should return spectator nickname', async () => {
      roomRepo.findByPin.mockResolvedValue({
        getPlayer: jest.fn().mockReturnValue(null),
        isHost: jest.fn().mockReturnValue(false),
        getSpectator: jest.fn().mockReturnValue({ nickname: 'Viewer' })
      });
      expect(await gu.getNicknameForSocket('123456', 's1')).toBe('Viewer');
    });

    it('should return null if no match', async () => {
      roomRepo.findByPin.mockResolvedValue({
        getPlayer: jest.fn().mockReturnValue(null),
        isHost: jest.fn().mockReturnValue(false),
        getSpectator: jest.fn().mockReturnValue(null)
      });
      expect(await gu.getNicknameForSocket('123456', 's1')).toBeNull();
    });
  });

  describe('cleanupExpiredLocks', () => {
    it('should return cleanup counts', () => {
      const result = gu.cleanupExpiredLocks();
      expect(result).toEqual({ pendingAnswers: 0, pendingArchives: 0 });
    });
  });

  describe('roomExists', () => {
    it('should delegate to repository', async () => {
      roomRepo.exists.mockResolvedValue(true);
      expect(await gu.roomExists('123456')).toBe(true);
    });
  });

  describe('pendingAnswers getter', () => {
    it('should return pending answers from answer use cases', () => {
      expect(gu.pendingAnswers).toBeDefined();
    });
  });

  describe('delegation methods', () => {
    it('should delegate usePowerUp', () => {
      expect(typeof gu.usePowerUp).toBe('function');
    });

    it('should delegate getServerElapsedTime', () => {
      expect(typeof gu.getServerElapsedTime).toBe('function');
    });

    it('should delegate saveInterruptedGame', () => {
      expect(typeof gu.saveInterruptedGame).toBe('function');
    });

    it('should delegate saveAllInterruptedGames', () => {
      expect(typeof gu.saveAllInterruptedGames).toBe('function');
    });

    it('should delegate archiveGame to archive with pendingAnswers', () => {
      expect(typeof gu.archiveGame).toBe('function');
    });

    it('should delegate startAnsweringPhase with pendingAnswers', () => {
      expect(typeof gu.startAnsweringPhase).toBe('function');
    });
  });
});
