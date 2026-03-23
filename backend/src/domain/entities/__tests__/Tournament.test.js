const { Tournament, TournamentState } = require('../Tournament');

describe('Tournament', () => {
  const validData = { name: 'Test Tournament', hostUserId: 'host1' };

  describe('constructor', () => {
    it('should create tournament with valid data', () => {
      const t = new Tournament(validData);
      expect(t.name).toBe('Test Tournament');
      expect(t.hostUserId).toBe('host1');
      expect(t.state).toBe(TournamentState.SETUP);
      expect(t.rounds).toEqual([]);
      expect(t.currentRoundIndex).toBe(0);
      expect(t.id).toBeDefined();
    });

    it('should use provided id', () => {
      const t = new Tournament({ ...validData, id: 'custom-id' });
      expect(t.id).toBe('custom-id');
    });

    it('should throw if name is empty', () => {
      expect(() => new Tournament({ name: '', hostUserId: 'h1' })).toThrow('Tournament name is required');
    });

    it('should throw if name is not a string', () => {
      expect(() => new Tournament({ name: 123, hostUserId: 'h1' })).toThrow('Tournament name is required');
    });

    it('should throw if name is whitespace only', () => {
      expect(() => new Tournament({ name: '   ', hostUserId: 'h1' })).toThrow('Tournament name is required');
    });

    it('should throw if name exceeds max length', () => {
      expect(() => new Tournament({ name: 'A'.repeat(101), hostUserId: 'h1' })).toThrow('Tournament name must be at most');
    });

    it('should throw if hostUserId is missing', () => {
      expect(() => new Tournament({ name: 'Test' })).toThrow('Host user ID is required');
    });

    it('should trim the name', () => {
      const t = new Tournament({ name: '  Trimmed  ', hostUserId: 'h1' });
      expect(t.name).toBe('Trimmed');
    });
  });

  describe('addRound', () => {
    it('should add a round', () => {
      const t = new Tournament(validData);
      t.addRound('q1', 'Quiz 1');
      expect(t.rounds).toHaveLength(1);
      expect(t.rounds[0]).toEqual({ quizId: 'q1', quizTitle: 'Quiz 1', roomPin: null, status: 'pending', results: null });
    });

    it('should throw when max rounds reached', () => {
      const t = new Tournament(validData);
      for (let i = 0; i < 10; i++) t.addRound(`q${i}`, `Quiz ${i}`);
      expect(() => t.addRound('q10', 'Quiz 10')).toThrow('Maximum 10 rounds allowed');
    });

    it('should throw if not in SETUP state', () => {
      const t = new Tournament(validData);
      t.addRound('q1', 'Quiz 1');
      t.addRound('q2', 'Quiz 2');
      t.start();
      expect(() => t.addRound('q3', 'Quiz 3')).toThrow('only allowed during setup');
    });
  });

  describe('removeRound', () => {
    it('should remove a round by index', () => {
      const t = new Tournament(validData);
      t.addRound('q1', 'Quiz 1');
      t.addRound('q2', 'Quiz 2');
      t.removeRound(0);
      expect(t.rounds).toHaveLength(1);
      expect(t.rounds[0].quizId).toBe('q2');
    });

    it('should throw for invalid index', () => {
      const t = new Tournament(validData);
      expect(() => t.removeRound(0)).toThrow('Invalid round index');
      expect(() => t.removeRound(-1)).toThrow('Invalid round index');
    });
  });

  describe('reorderRounds', () => {
    it('should reorder rounds', () => {
      const t = new Tournament(validData);
      t.addRound('q1', 'Quiz 1');
      t.addRound('q2', 'Quiz 2');
      t.addRound('q3', 'Quiz 3');
      t.reorderRounds(0, 2);
      expect(t.rounds[0].quizId).toBe('q2');
      expect(t.rounds[2].quizId).toBe('q1');
    });

    it('should throw for invalid indices', () => {
      const t = new Tournament(validData);
      t.addRound('q1', 'Quiz 1');
      expect(() => t.reorderRounds(-1, 0)).toThrow('Invalid round indices');
      expect(() => t.reorderRounds(0, 5)).toThrow('Invalid round indices');
    });
  });

  describe('start', () => {
    it('should start tournament with enough rounds', () => {
      const t = new Tournament(validData);
      t.addRound('q1', 'Quiz 1');
      t.addRound('q2', 'Quiz 2');
      t.start();
      expect(t.state).toBe(TournamentState.IN_PROGRESS);
      expect(t.currentRoundIndex).toBe(0);
      expect(t.rounds[0].status).toBe('in_progress');
    });

    it('should throw if not enough rounds', () => {
      const t = new Tournament(validData);
      t.addRound('q1', 'Quiz 1');
      expect(() => t.start()).toThrow('at least');
    });
  });

  describe('setRoomPin', () => {
    it('should set room pin for a round', () => {
      const t = new Tournament(validData);
      t.addRound('q1', 'Quiz 1');
      t.setRoomPin(0, '123456');
      expect(t.rounds[0].roomPin).toBe('123456');
    });

    it('should throw for invalid index', () => {
      const t = new Tournament(validData);
      expect(() => t.setRoomPin(0, '123456')).toThrow('Invalid round index');
      expect(() => t.setRoomPin(-1, '123456')).toThrow('Invalid round index');
    });
  });

  describe('completeRound', () => {
    let t;
    beforeEach(() => {
      t = new Tournament(validData);
      t.addRound('q1', 'Quiz 1');
      t.addRound('q2', 'Quiz 2');
      t.start();
    });

    it('should complete current round with results', () => {
      const results = { playerResults: [{ nickname: 'Alice', score: 500, rank: 1 }] };
      t.completeRound(0, results);
      expect(t.rounds[0].status).toBe('completed');
      expect(t.state).toBe(TournamentState.BETWEEN_ROUNDS);
    });

    it('should accumulate player scores', () => {
      t.completeRound(0, { playerResults: [{ nickname: 'Alice', score: 500, rank: 1 }] });
      t.nextRound();
      t.completeRound(1, { playerResults: [{ nickname: 'Alice', score: 300, rank: 1 }] });
      const lb = t.getOverallLeaderboard();
      expect(lb[0].totalScore).toBe(800);
      expect(lb[0].roundScores).toHaveLength(2);
    });

    it('should set COMPLETED state when last round finishes', () => {
      t.completeRound(0, { playerResults: [] });
      t.nextRound();
      t.completeRound(1, { playerResults: [] });
      expect(t.state).toBe(TournamentState.COMPLETED);
    });

    it('should throw for invalid round index', () => {
      expect(() => t.completeRound(-1, {})).toThrow('Invalid round index');
      expect(() => t.completeRound(5, {})).toThrow('Invalid round index');
    });

    it('should throw if not in progress', () => {
      t.completeRound(0, {});
      expect(() => t.completeRound(1, {})).toThrow('Tournament must be in progress');
    });

    it('should throw if not completing current round', () => {
      expect(() => t.completeRound(1, {})).toThrow('Can only complete the current round');
    });

    it('should handle results without playerResults', () => {
      t.completeRound(0, {});
      expect(t.rounds[0].status).toBe('completed');
    });

    it('should handle null results', () => {
      t.completeRound(0, null);
      expect(t.rounds[0].status).toBe('completed');
    });
  });

  describe('nextRound', () => {
    it('should advance to next round', () => {
      const t = new Tournament(validData);
      t.addRound('q1', 'Quiz 1');
      t.addRound('q2', 'Quiz 2');
      t.addRound('q3', 'Quiz 3');
      t.start();
      t.completeRound(0, {});
      const round = t.nextRound();
      expect(t.currentRoundIndex).toBe(1);
      expect(t.state).toBe(TournamentState.IN_PROGRESS);
      expect(round.status).toBe('in_progress');
    });

    it('should throw if not between rounds', () => {
      const t = new Tournament(validData);
      t.addRound('q1', 'Quiz 1');
      t.addRound('q2', 'Quiz 2');
      t.start();
      expect(() => t.nextRound()).toThrow('Cannot advance to next round');
    });

    it('should throw if no more rounds', () => {
      const t = new Tournament(validData);
      t.addRound('q1', 'Quiz 1');
      t.addRound('q2', 'Quiz 2');
      t.start();
      t.completeRound(0, {});
      t.nextRound();
      t.completeRound(1, {});
      // Now state is COMPLETED, so nextRound should throw
      expect(() => t.nextRound()).toThrow();
    });
  });

  describe('getCurrentRound', () => {
    it('should return current round', () => {
      const t = new Tournament(validData);
      t.addRound('q1', 'Quiz 1');
      expect(t.getCurrentRound().quizId).toBe('q1');
    });

    it('should return null if index out of bounds', () => {
      const t = new Tournament({ ...validData, currentRoundIndex: 5 });
      expect(t.getCurrentRound()).toBeNull();
    });
  });

  describe('getTotalRounds', () => {
    it('should return round count', () => {
      const t = new Tournament(validData);
      t.addRound('q1', 'Quiz 1');
      t.addRound('q2', 'Quiz 2');
      expect(t.getTotalRounds()).toBe(2);
    });
  });

  describe('getOverallLeaderboard/getPodium', () => {
    it('should return sorted leaderboard', () => {
      const t = new Tournament(validData);
      t.addRound('q1', 'Quiz 1');
      t.addRound('q2', 'Quiz 2');
      t.start();
      t.completeRound(0, {
        playerResults: [
          { nickname: 'Alice', score: 300, rank: 2 },
          { nickname: 'Bob', score: 500, rank: 1 }
        ]
      });
      const lb = t.getOverallLeaderboard();
      expect(lb[0].nickname).toBe('Bob');
      expect(lb[0].totalScore).toBe(500);
      expect(lb[1].nickname).toBe('Alice');
    });

    it('should return top 3 for podium', () => {
      const t = new Tournament(validData);
      t.addRound('q1', 'Quiz 1');
      t.addRound('q2', 'Quiz 2');
      t.start();
      t.completeRound(0, {
        playerResults: [
          { nickname: 'A', score: 100, rank: 4 },
          { nickname: 'B', score: 200, rank: 3 },
          { nickname: 'C', score: 300, rank: 2 },
          { nickname: 'D', score: 400, rank: 1 }
        ]
      });
      expect(t.getOverallPodium()).toHaveLength(3);
    });
  });

  describe('isCompleted', () => {
    it('should return false when not completed', () => {
      const t = new Tournament(validData);
      expect(t.isCompleted()).toBe(false);
    });

    it('should return true when completed', () => {
      const t = new Tournament(validData);
      t.addRound('q1', 'Q1');
      t.addRound('q2', 'Q2');
      t.start();
      t.completeRound(0, {});
      t.nextRound();
      t.completeRound(1, {});
      expect(t.isCompleted()).toBe(true);
    });
  });

  describe('toJSON', () => {
    it('should serialize tournament', () => {
      const t = new Tournament(validData);
      t.addRound('q1', 'Quiz 1');
      t.addRound('q2', 'Quiz 2');
      t.start();
      t.completeRound(0, { playerResults: [{ nickname: 'Alice', score: 100, rank: 1 }] });
      const json = t.toJSON();
      expect(json.id).toBe(t.id);
      expect(json.name).toBe('Test Tournament');
      expect(json.hostUserId).toBe('host1');
      expect(json.rounds).toHaveLength(2);
      expect(json.state).toBe(TournamentState.BETWEEN_ROUNDS);
      expect(json.playerScores).toHaveProperty('Alice');
      expect(json.playerScores.Alice.totalScore).toBe(100);
    });
  });
});
