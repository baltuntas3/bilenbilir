const { TournamentUseCases } = require('../TournamentUseCases');

function createMocks() {
  return {
    tournamentRepo: {
      findById: jest.fn(),
      findByHost: jest.fn(),
      save: jest.fn(),
      delete: jest.fn()
    },
    quizRepo: {
      findById: jest.fn()
    }
  };
}

describe('TournamentUseCases', () => {
  let uc, mocks;

  beforeEach(() => {
    mocks = createMocks();
    uc = new TournamentUseCases(mocks.tournamentRepo, mocks.quizRepo);
  });

  describe('_getTournamentOrThrow', () => {
    it('should throw if not found', async () => {
      mocks.tournamentRepo.findById.mockResolvedValue(null);
      await expect(uc._getTournamentOrThrow('t1', 'u1')).rejects.toThrow('not found');
    });

    it('should throw if not authorized', async () => {
      mocks.tournamentRepo.findById.mockResolvedValue({ hostUserId: 'other' });
      await expect(uc._getTournamentOrThrow('t1', 'u1')).rejects.toThrow('Not authorized');
    });
  });

  describe('createTournament', () => {
    it('should create tournament with rounds', async () => {
      mocks.quizRepo.findById.mockResolvedValue({ title: 'Quiz', isPublic: true });
      mocks.tournamentRepo.save.mockResolvedValue({});
      const result = await uc.createTournament({ name: 'Tourney', hostUserId: 'u1', quizIds: ['q1', 'q2'] });
      expect(result.tournament).toBeDefined();
    });

    it('should throw if quiz not found', async () => {
      mocks.quizRepo.findById.mockResolvedValue(null);
      await expect(uc.createTournament({ name: 'T', hostUserId: 'u1', quizIds: ['q1'] })).rejects.toThrow('not found');
    });

    it('should throw for private quiz not owned', async () => {
      mocks.quizRepo.findById.mockResolvedValue({ isPublic: false, createdBy: 'other' });
      await expect(uc.createTournament({ name: 'T', hostUserId: 'u1', quizIds: ['q1'] })).rejects.toThrow('Not authorized');
    });
  });

  describe('getTournament', () => {
    it('should return tournament', async () => {
      mocks.tournamentRepo.findById.mockResolvedValue({ hostUserId: 'u1' });
      const result = await uc.getTournament('t1', 'u1');
      expect(result.tournament).toBeDefined();
    });
  });

  describe('getMyTournaments', () => {
    it('should return tournaments', async () => {
      mocks.tournamentRepo.findByHost.mockResolvedValue([]);
      const result = await uc.getMyTournaments('u1');
      expect(result.tournaments).toEqual([]);
    });
  });

  describe('addRound', () => {
    it('should add round', async () => {
      const { Tournament } = require('../../../domain/entities/Tournament');
      const t = new Tournament({ name: 'T', hostUserId: 'u1' });
      mocks.tournamentRepo.findById.mockResolvedValue(t);
      mocks.quizRepo.findById.mockResolvedValue({ title: 'Quiz', isPublic: true });
      mocks.tournamentRepo.save.mockResolvedValue({});
      const result = await uc.addRound({ tournamentId: 't1', quizId: 'q1', requesterId: 'u1' });
      expect(result.tournament).toBeDefined();
    });

    it('should throw for private quiz not owned', async () => {
      const { Tournament } = require('../../../domain/entities/Tournament');
      const t = new Tournament({ name: 'T', hostUserId: 'u1' });
      mocks.tournamentRepo.findById.mockResolvedValue(t);
      mocks.quizRepo.findById.mockResolvedValue({ isPublic: false, createdBy: 'other' });
      await expect(uc.addRound({ tournamentId: 't1', quizId: 'q1', requesterId: 'u1' })).rejects.toThrow('Not authorized');
    });
  });

  describe('removeRound', () => {
    it('should remove round', async () => {
      const { Tournament } = require('../../../domain/entities/Tournament');
      const t = new Tournament({ name: 'T', hostUserId: 'u1' });
      t.addRound('q1', 'Q1');
      mocks.tournamentRepo.findById.mockResolvedValue(t);
      mocks.tournamentRepo.save.mockResolvedValue({});
      const result = await uc.removeRound({ tournamentId: 't1', roundIndex: 0, requesterId: 'u1' });
      expect(result.tournament).toBeDefined();
    });
  });

  describe('startTournament', () => {
    it('should start tournament', async () => {
      const { Tournament } = require('../../../domain/entities/Tournament');
      const t = new Tournament({ name: 'T', hostUserId: 'u1' });
      t.addRound('q1', 'Q1');
      t.addRound('q2', 'Q2');
      mocks.tournamentRepo.findById.mockResolvedValue(t);
      mocks.tournamentRepo.save.mockResolvedValue({});
      const result = await uc.startTournament({ tournamentId: 't1', requesterId: 'u1' });
      expect(result.currentRound).toBeDefined();
    });
  });

  describe('completeRound', () => {
    it('should complete round', async () => {
      const { Tournament } = require('../../../domain/entities/Tournament');
      const t = new Tournament({ name: 'T', hostUserId: 'u1' });
      t.addRound('q1', 'Q1');
      t.addRound('q2', 'Q2');
      t.start();
      mocks.tournamentRepo.findById.mockResolvedValue(t);
      mocks.tournamentRepo.save.mockResolvedValue({});
      const result = await uc.completeRound({ tournamentId: 't1', roundIndex: 0, results: {}, requesterId: 'u1' });
      expect(result.isCompleted).toBe(false);
    });
  });

  describe('nextRound', () => {
    it('should advance to next round', async () => {
      const { Tournament } = require('../../../domain/entities/Tournament');
      const t = new Tournament({ name: 'T', hostUserId: 'u1' });
      t.addRound('q1', 'Q1');
      t.addRound('q2', 'Q2');
      t.addRound('q3', 'Q3');
      t.start();
      t.completeRound(0, {});
      mocks.tournamentRepo.findById.mockResolvedValue(t);
      mocks.tournamentRepo.save.mockResolvedValue({});
      const result = await uc.nextRound({ tournamentId: 't1', requesterId: 'u1' });
      expect(result.currentRound).toBeDefined();
    });
  });

  describe('deleteTournament', () => {
    it('should delete tournament', async () => {
      mocks.tournamentRepo.findById.mockResolvedValue({ hostUserId: 'u1' });
      const result = await uc.deleteTournament({ tournamentId: 't1', requesterId: 'u1' });
      expect(result.message).toContain('deleted');
    });
  });
});
