const { ValidationError } = require('../../shared/errors');

const TEAM_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e'];
const MAX_TEAMS = 8;
const MAX_TEAM_NAME = 20;

class Team {
  constructor({ id, name, color, playerIds = [] }) {
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new ValidationError('Team name is required');
    }
    if (name.length > MAX_TEAM_NAME) {
      throw new ValidationError(`Team name must be at most ${MAX_TEAM_NAME} characters`);
    }

    this.id = id;
    this.name = name.trim();
    this.color = color;
    this.playerIds = [...playerIds];
  }

  addPlayer(playerId) {
    if (!this.playerIds.includes(playerId)) {
      this.playerIds.push(playerId);
    }
  }

  removePlayer(playerId) {
    this.playerIds = this.playerIds.filter(id => id !== playerId);
  }

  hasPlayer(playerId) {
    return this.playerIds.includes(playerId);
  }

  getPlayerCount() {
    return this.playerIds.length;
  }
}

module.exports = { Team, TEAM_COLORS, MAX_TEAMS };
