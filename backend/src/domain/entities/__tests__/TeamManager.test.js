const { TeamManager } = require('../TeamManager');
const { Team } = require('../Team');

describe('TeamManager', () => {
  let tm;

  beforeEach(() => {
    tm = new TeamManager();
  });

  describe('enable/disable', () => {
    it('should enable team mode', () => {
      tm.enable();
      expect(tm.isEnabled()).toBe(true);
      expect(tm.teamMode).toBe(true);
    });

    it('should disable team mode and clear teams', () => {
      tm.enable();
      tm.addTeam(new Team({ id: 't1', name: 'A', color: '#fff' }));
      tm.disable();
      expect(tm.isEnabled()).toBe(false);
      expect(tm.teams).toEqual([]);
    });
  });

  describe('addTeam', () => {
    it('should add a team', () => {
      const team = new Team({ id: 't1', name: 'Alpha', color: '#e74c3c' });
      tm.addTeam(team);
      expect(tm.teams).toHaveLength(1);
    });

    it('should throw on duplicate team name (case-insensitive)', () => {
      tm.addTeam(new Team({ id: 't1', name: 'Alpha', color: '#e74c3c' }));
      expect(() => tm.addTeam(new Team({ id: 't2', name: 'alpha', color: '#3498db' }))).toThrow('Team name already exists');
    });

    it('should throw when max teams reached', () => {
      for (let i = 0; i < 8; i++) {
        tm.addTeam(new Team({ id: `t${i}`, name: `Team${i}`, color: '#fff' }));
      }
      expect(() => tm.addTeam(new Team({ id: 't8', name: 'Team8', color: '#fff' }))).toThrow('Maximum 8 teams allowed');
    });
  });

  describe('removeTeam', () => {
    it('should remove a team by id', () => {
      tm.addTeam(new Team({ id: 't1', name: 'Alpha', color: '#fff' }));
      tm.removeTeam('t1');
      expect(tm.teams).toHaveLength(0);
    });

    it('should throw if team not found', () => {
      expect(() => tm.removeTeam('nonexistent')).toThrow('Team not found');
    });
  });

  describe('assignPlayer', () => {
    it('should assign player to team', () => {
      const team = new Team({ id: 't1', name: 'Alpha', color: '#fff' });
      tm.addTeam(team);
      const getPlayer = jest.fn().mockReturnValue({ id: 'p1' });
      tm.assignPlayer('p1', 't1', getPlayer);
      expect(team.hasPlayer('p1')).toBe(true);
    });

    it('should move player from old team to new team', () => {
      const team1 = new Team({ id: 't1', name: 'Alpha', color: '#fff' });
      const team2 = new Team({ id: 't2', name: 'Beta', color: '#000' });
      tm.addTeam(team1);
      tm.addTeam(team2);
      const getPlayer = jest.fn().mockReturnValue({ id: 'p1' });
      tm.assignPlayer('p1', 't1', getPlayer);
      tm.assignPlayer('p1', 't2', getPlayer);
      expect(team1.hasPlayer('p1')).toBe(false);
      expect(team2.hasPlayer('p1')).toBe(true);
    });

    it('should throw if player not found', () => {
      tm.addTeam(new Team({ id: 't1', name: 'Alpha', color: '#fff' }));
      const getPlayer = jest.fn().mockReturnValue(null);
      expect(() => tm.assignPlayer('p1', 't1', getPlayer)).toThrow('Player not found');
    });

    it('should throw if team not found', () => {
      const getPlayer = jest.fn().mockReturnValue({ id: 'p1' });
      expect(() => tm.assignPlayer('p1', 'nonexistent', getPlayer)).toThrow('Team not found');
    });
  });

  describe('getTeamForPlayer', () => {
    it('should return team for player', () => {
      const team = new Team({ id: 't1', name: 'Alpha', color: '#fff', playerIds: ['p1'] });
      tm.addTeam(team);
      expect(tm.getTeamForPlayer('p1')).toBe(team);
    });

    it('should return null if player has no team', () => {
      expect(tm.getTeamForPlayer('p1')).toBeNull();
    });
  });

  describe('getLeaderboard', () => {
    it('should return teams sorted by score descending', () => {
      const team1 = new Team({ id: 't1', name: 'Alpha', color: '#e74c3c', playerIds: ['p1', 'p2'] });
      const team2 = new Team({ id: 't2', name: 'Beta', color: '#3498db', playerIds: ['p3'] });
      tm.addTeam(team1);
      tm.addTeam(team2);

      const players = { p1: { score: 100 }, p2: { score: 200 }, p3: { score: 500 } };
      const getPlayer = (id) => players[id] || null;

      const lb = tm.getLeaderboard(getPlayer);
      expect(lb[0].name).toBe('Beta');
      expect(lb[0].score).toBe(500);
      expect(lb[1].name).toBe('Alpha');
      expect(lb[1].score).toBe(300);
    });

    it('should handle missing players gracefully', () => {
      const team = new Team({ id: 't1', name: 'Alpha', color: '#fff', playerIds: ['p1', 'missing'] });
      tm.addTeam(team);
      const getPlayer = (id) => id === 'p1' ? { score: 100 } : null;
      const lb = tm.getLeaderboard(getPlayer);
      expect(lb[0].score).toBe(100);
    });
  });

  describe('getPodium', () => {
    it('should return top 3 teams', () => {
      for (let i = 0; i < 5; i++) {
        tm.addTeam(new Team({ id: `t${i}`, name: `Team${i}`, color: '#fff', playerIds: [`p${i}`] }));
      }
      const getPlayer = (id) => ({ score: parseInt(id.replace('p', '')) * 100 });
      const podium = tm.getPodium(getPlayer);
      expect(podium).toHaveLength(3);
    });
  });

  describe('getAll', () => {
    it('should return a copy of teams array', () => {
      const team = new Team({ id: 't1', name: 'Alpha', color: '#fff' });
      tm.addTeam(team);
      const all = tm.getAll();
      expect(all).toHaveLength(1);
      all.push(new Team({ id: 't2', name: 'Beta', color: '#000' }));
      expect(tm.teams).toHaveLength(1);
    });
  });
});
