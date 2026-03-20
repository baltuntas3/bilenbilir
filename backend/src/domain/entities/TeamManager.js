const { ValidationError, ConflictError } = require('../../shared/errors');
const { MAX_TEAMS } = require('../../shared/config/constants');

class TeamManager {
  constructor() {
    this.teams = [];
    this.teamMode = false;
  }

  enable() {
    this.teamMode = true;
  }

  disable() {
    this.teamMode = false;
    this.teams = [];
  }

  isEnabled() {
    return this.teamMode;
  }

  addTeam(team) {
    if (this.teams.length >= MAX_TEAMS) {
      throw new ValidationError(`Maximum ${MAX_TEAMS} teams allowed`);
    }
    const nameExists = this.teams.some(
      t => t.name.toLowerCase() === team.name.toLowerCase()
    );
    if (nameExists) throw new ConflictError('Team name already exists');
    this.teams.push(team);
  }

  removeTeam(teamId) {
    const team = this.teams.find(t => t.id === teamId);
    if (!team) throw new ValidationError('Team not found');
    this.teams = this.teams.filter(t => t.id !== teamId);
  }

  assignPlayer(playerId, teamId, getPlayerById) {
    const player = getPlayerById(playerId);
    if (!player) throw new ValidationError('Player not found');
    const team = this.teams.find(t => t.id === teamId);
    if (!team) throw new ValidationError('Team not found');
    for (const t of this.teams) t.removePlayer(playerId);
    team.addPlayer(playerId);
  }

  getTeamForPlayer(playerId) {
    return this.teams.find(t => t.hasPlayer(playerId)) || null;
  }

  getLeaderboard(getPlayerById) {
    return this.teams
      .map(team => {
        const teamScore = team.playerIds.reduce((sum, pid) => {
          const player = getPlayerById(pid);
          return sum + (player ? player.score : 0);
        }, 0);
        return {
          id: team.id,
          name: team.name,
          color: team.color,
          score: teamScore,
          playerCount: team.getPlayerCount()
        };
      })
      .sort((a, b) => b.score - a.score);
  }

  getPodium(getPlayerById) {
    return this.getLeaderboard(getPlayerById).slice(0, 3);
  }

  getAll() {
    return [...this.teams];
  }
}

module.exports = { TeamManager };
