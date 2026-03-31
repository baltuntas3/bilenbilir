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
      t => t.name.toLocaleLowerCase('tr') === team.name.toLocaleLowerCase('tr')
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
    // Validate ALL preconditions BEFORE any mutation to prevent orphaning
    const player = getPlayerById(playerId);
    if (!player) throw new ValidationError('Player not found');
    const targetTeam = this.teams.find(t => t.id === teamId);
    if (!targetTeam) throw new ValidationError('Team not found');
    // All validations passed — now mutate
    for (const t of this.teams) t.removePlayer(playerId);
    targetTeam.addPlayer(playerId);
  }

  /**
   * Randomly distribute given player IDs across all teams using round-robin
   * on a shuffled player list. Clears existing assignments first.
   */
  shufflePlayers(playerIds) {
    if (this.teams.length < 2) {
      throw new ValidationError('At least 2 teams are required to shuffle');
    }
    if (playerIds.length === 0) {
      throw new ValidationError('No players to shuffle');
    }
    // Clear all existing assignments
    for (const team of this.teams) {
      team.playerIds = [];
    }
    // Fisher-Yates shuffle
    const shuffled = [...playerIds];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    // Round-robin assignment
    for (let i = 0; i < shuffled.length; i++) {
      this.teams[i % this.teams.length].addPlayer(shuffled[i]);
    }
  }

  /**
   * Swap two players between their teams atomically.
   * Both players must already be assigned to different teams.
   */
  swapPlayers(playerIdA, playerIdB) {
    const teamA = this.getTeamForPlayer(playerIdA);
    const teamB = this.getTeamForPlayer(playerIdB);
    if (!teamA) throw new ValidationError('First player is not assigned to any team');
    if (!teamB) throw new ValidationError('Second player is not assigned to any team');
    if (teamA.id === teamB.id) throw new ValidationError('Players are already on the same team');
    teamA.removePlayer(playerIdA);
    teamB.removePlayer(playerIdB);
    teamA.addPlayer(playerIdB);
    teamB.addPlayer(playerIdA);
  }

  removePlayer(playerId) {
    for (const team of this.teams) {
      team.removePlayer(playerId);
    }
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
