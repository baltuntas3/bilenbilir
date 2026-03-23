const { Tournament, TournamentState } = require('../../domain/entities/Tournament');
const { NotFoundError, ValidationError, ForbiddenError } = require('../../shared/errors');

class TournamentUseCases {
  constructor(tournamentRepository, quizRepository) {
    this.tournamentRepository = tournamentRepository;
    this.quizRepository = quizRepository;
  }

  async _getTournamentOrThrow(id, requesterId) {
    const tournament = await this.tournamentRepository.findById(id);
    if (!tournament) throw new NotFoundError('Tournament not found');
    if (tournament.hostUserId !== requesterId) throw new ForbiddenError('Not authorized');
    return tournament;
  }

  async createTournament({ name, hostUserId, quizIds }) {
    const tournament = new Tournament({ name, hostUserId });

    for (const quizId of quizIds) {
      const quiz = await this.quizRepository.findById(quizId);
      if (!quiz) throw new NotFoundError(`Quiz ${quizId} not found`);
      if (!quiz.isPublic && quiz.createdBy !== hostUserId) {
        throw new ForbiddenError('Not authorized to use this quiz');
      }
      tournament.addRound(quizId, quiz.title);
    }

    await this.tournamentRepository.save(tournament);
    return { tournament };
  }

  async getTournament(id, requesterId) {
    const tournament = await this._getTournamentOrThrow(id, requesterId);
    return { tournament };
  }

  async getMyTournaments(hostUserId) {
    const tournaments = await this.tournamentRepository.findByHost(hostUserId);
    return { tournaments };
  }

  async addRound({ tournamentId, quizId, requesterId }) {
    const tournament = await this._getTournamentOrThrow(tournamentId, requesterId);

    const quiz = await this.quizRepository.findById(quizId);
    if (!quiz) throw new NotFoundError('Quiz not found');
    if (!quiz.isPublic && quiz.createdBy !== requesterId) {
      throw new ForbiddenError('Not authorized to use this quiz');
    }

    tournament.addRound(quizId, quiz.title);
    await this.tournamentRepository.save(tournament);
    return { tournament };
  }

  async removeRound({ tournamentId, roundIndex, requesterId }) {
    const tournament = await this._getTournamentOrThrow(tournamentId, requesterId);

    tournament.removeRound(roundIndex);
    await this.tournamentRepository.save(tournament);
    return { tournament };
  }

  async startTournament({ tournamentId, requesterId }) {
    const tournament = await this._getTournamentOrThrow(tournamentId, requesterId);

    tournament.start();
    await this.tournamentRepository.save(tournament);
    return { tournament, currentRound: tournament.getCurrentRound() };
  }

  async completeRound({ tournamentId, roundIndex, results, requesterId }) {
    const tournament = await this._getTournamentOrThrow(tournamentId, requesterId);

    tournament.completeRound(roundIndex, results);
    await this.tournamentRepository.save(tournament);

    return {
      tournament,
      isCompleted: tournament.isCompleted(),
      overallLeaderboard: tournament.getOverallLeaderboard()
    };
  }

  async nextRound({ tournamentId, requesterId }) {
    const tournament = await this._getTournamentOrThrow(tournamentId, requesterId);

    const round = tournament.nextRound();
    await this.tournamentRepository.save(tournament);
    return { tournament, currentRound: round };
  }

  async deleteTournament({ tournamentId, requesterId }) {
    await this._getTournamentOrThrow(tournamentId, requesterId);

    await this.tournamentRepository.delete(tournamentId);
    return { message: 'Tournament deleted' };
  }
}

module.exports = { TournamentUseCases };
