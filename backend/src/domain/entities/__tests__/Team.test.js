const { Team, TEAM_COLORS, MAX_TEAMS } = require('../Team');

describe('Team', () => {
  describe('constructor', () => {
    it('should create a team with valid data', () => {
      const team = new Team({ id: 't1', name: 'Alpha', color: '#e74c3c' });
      expect(team.id).toBe('t1');
      expect(team.name).toBe('Alpha');
      expect(team.color).toBe('#e74c3c');
      expect(team.playerIds).toEqual([]);
    });

    it('should trim the name', () => {
      const team = new Team({ id: 't1', name: '  Beta  ', color: '#fff' });
      expect(team.name).toBe('Beta');
    });

    it('should clone playerIds array', () => {
      const ids = ['p1', 'p2'];
      const team = new Team({ id: 't1', name: 'Test', color: '#fff', playerIds: ids });
      expect(team.playerIds).toEqual(['p1', 'p2']);
      ids.push('p3');
      expect(team.playerIds).toEqual(['p1', 'p2']);
    });

    it('should throw if name is empty', () => {
      expect(() => new Team({ id: 't1', name: '', color: '#fff' })).toThrow('Team name is required');
    });

    it('should throw if name is not a string', () => {
      expect(() => new Team({ id: 't1', name: 123, color: '#fff' })).toThrow('Team name is required');
    });

    it('should throw if name is null', () => {
      expect(() => new Team({ id: 't1', name: null, color: '#fff' })).toThrow('Team name is required');
    });

    it('should throw if name is only whitespace', () => {
      expect(() => new Team({ id: 't1', name: '   ', color: '#fff' })).toThrow('Team name is required');
    });

    it('should throw if name exceeds max length', () => {
      expect(() => new Team({ id: 't1', name: 'A'.repeat(21), color: '#fff' })).toThrow('Team name must be at most 20 characters');
    });
  });

  describe('addPlayer', () => {
    it('should add a player', () => {
      const team = new Team({ id: 't1', name: 'Test', color: '#fff' });
      team.addPlayer('p1');
      expect(team.playerIds).toContain('p1');
    });

    it('should not add duplicate player', () => {
      const team = new Team({ id: 't1', name: 'Test', color: '#fff' });
      team.addPlayer('p1');
      team.addPlayer('p1');
      expect(team.playerIds).toEqual(['p1']);
    });
  });

  describe('removePlayer', () => {
    it('should remove a player', () => {
      const team = new Team({ id: 't1', name: 'Test', color: '#fff', playerIds: ['p1', 'p2'] });
      team.removePlayer('p1');
      expect(team.playerIds).toEqual(['p2']);
    });

    it('should do nothing for non-existent player', () => {
      const team = new Team({ id: 't1', name: 'Test', color: '#fff', playerIds: ['p1'] });
      team.removePlayer('p99');
      expect(team.playerIds).toEqual(['p1']);
    });
  });

  describe('hasPlayer', () => {
    it('should return true if player exists', () => {
      const team = new Team({ id: 't1', name: 'Test', color: '#fff', playerIds: ['p1'] });
      expect(team.hasPlayer('p1')).toBe(true);
    });

    it('should return false if player does not exist', () => {
      const team = new Team({ id: 't1', name: 'Test', color: '#fff' });
      expect(team.hasPlayer('p1')).toBe(false);
    });
  });

  describe('getPlayerCount', () => {
    it('should return correct count', () => {
      const team = new Team({ id: 't1', name: 'Test', color: '#fff', playerIds: ['p1', 'p2', 'p3'] });
      expect(team.getPlayerCount()).toBe(3);
    });

    it('should return 0 for empty team', () => {
      const team = new Team({ id: 't1', name: 'Test', color: '#fff' });
      expect(team.getPlayerCount()).toBe(0);
    });
  });

  describe('exports', () => {
    it('should export TEAM_COLORS array', () => {
      expect(TEAM_COLORS).toHaveLength(8);
    });

    it('should export MAX_TEAMS', () => {
      expect(MAX_TEAMS).toBe(8);
    });
  });
});
