class TournamentRepository {
  constructor() {
    this.tournaments = new Map();
  }

  async save(tournament) {
    this.tournaments.set(tournament.id, tournament);
    return tournament;
  }

  async findById(id) {
    return this.tournaments.get(id) || null;
  }

  async findByHost(hostUserId) {
    const results = [];
    for (const tournament of this.tournaments.values()) {
      if (tournament.hostUserId === hostUserId) {
        results.push(tournament);
      }
    }
    return results.sort((a, b) => b.createdAt - a.createdAt);
  }

  async delete(id) {
    return this.tournaments.delete(id);
  }

  async getAll() {
    return Array.from(this.tournaments.values());
  }
}

const tournamentRepository = new TournamentRepository();

module.exports = { TournamentRepository, tournamentRepository };
