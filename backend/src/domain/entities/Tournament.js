const { ValidationError } = require('../../shared/errors');
const { generateId } = require('../../shared/utils/generateId');
const { MAX_ROUNDS, MAX_TOURNAMENT_NAME_LENGTH, MIN_TOURNAMENT_ROUNDS } = require('../../shared/config/constants');

const TournamentState = {
  SETUP: 'SETUP',
  IN_PROGRESS: 'IN_PROGRESS',
  BETWEEN_ROUNDS: 'BETWEEN_ROUNDS',
  COMPLETED: 'COMPLETED'
};

class Tournament {
  constructor({ id, name, hostUserId, rounds = [], currentRoundIndex = 0, state = TournamentState.SETUP, createdAt = new Date() }) {
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new ValidationError('Tournament name is required');
    }
    if (name.length > MAX_TOURNAMENT_NAME_LENGTH) {
      throw new ValidationError(`Tournament name must be at most ${MAX_TOURNAMENT_NAME_LENGTH} characters`);
    }
    if (!hostUserId) {
      throw new ValidationError('Host user ID is required');
    }

    this.id = id || generateId();
    this.name = name.trim();
    this.hostUserId = hostUserId;
    this.rounds = rounds; // Array of { quizId, quizTitle, roomPin, status: 'pending'|'in_progress'|'completed', results: null }
    this.currentRoundIndex = currentRoundIndex;
    this.state = state;
    this.createdAt = createdAt;
    this.playerScores = new Map(); // nickname -> { totalScore, roundScores: [] }
  }

  _requireSetup() {
    if (this.state !== TournamentState.SETUP) {
      throw new ValidationError('This action is only allowed during setup');
    }
  }

  addRound(quizId, quizTitle) {
    this._requireSetup();
    if (this.rounds.length >= MAX_ROUNDS) {
      throw new ValidationError(`Maximum ${MAX_ROUNDS} rounds allowed`);
    }
    this.rounds.push({
      quizId,
      quizTitle,
      roomPin: null,
      status: 'pending',
      results: null
    });
  }

  removeRound(index) {
    this._requireSetup();
    if (index < 0 || index >= this.rounds.length) {
      throw new ValidationError('Invalid round index');
    }
    this.rounds.splice(index, 1);
  }

  reorderRounds(fromIndex, toIndex) {
    this._requireSetup();
    if (fromIndex < 0 || fromIndex >= this.rounds.length || toIndex < 0 || toIndex >= this.rounds.length) {
      throw new ValidationError('Invalid round indices');
    }
    const [round] = this.rounds.splice(fromIndex, 1);
    this.rounds.splice(toIndex, 0, round);
  }

  start() {
    this._requireSetup();
    if (this.rounds.length < MIN_TOURNAMENT_ROUNDS) {
      throw new ValidationError(`Tournament must have at least ${MIN_TOURNAMENT_ROUNDS} rounds`);
    }
    this.state = TournamentState.IN_PROGRESS;
    this.currentRoundIndex = 0;
    this.rounds[0].status = 'in_progress';
  }

  setRoomPin(roundIndex, pin) {
    if (roundIndex < 0 || roundIndex >= this.rounds.length) {
      throw new ValidationError('Invalid round index');
    }
    this.rounds[roundIndex].roomPin = pin;
  }

  completeRound(roundIndex, results) {
    if (roundIndex < 0 || roundIndex >= this.rounds.length) {
      throw new ValidationError('Invalid round index');
    }
    this.rounds[roundIndex].status = 'completed';
    this.rounds[roundIndex].results = results;

    // Accumulate player scores
    if (results && results.playerResults) {
      for (const player of results.playerResults) {
        if (!this.playerScores.has(player.nickname)) {
          this.playerScores.set(player.nickname, { totalScore: 0, roundScores: [] });
        }
        const entry = this.playerScores.get(player.nickname);
        entry.totalScore += player.score;
        entry.roundScores.push({ roundIndex, score: player.score, rank: player.rank });
      }
    }

    // Check if tournament is complete
    if (roundIndex >= this.rounds.length - 1) {
      this.state = TournamentState.COMPLETED;
    } else {
      this.state = TournamentState.BETWEEN_ROUNDS;
    }
  }

  nextRound() {
    if (this.state !== TournamentState.BETWEEN_ROUNDS) {
      throw new ValidationError('Cannot advance to next round');
    }
    if (this.currentRoundIndex >= this.rounds.length - 1) {
      throw new ValidationError('No more rounds available');
    }
    this.currentRoundIndex++;
    this.rounds[this.currentRoundIndex].status = 'in_progress';
    this.state = TournamentState.IN_PROGRESS;
    return this.rounds[this.currentRoundIndex];
  }

  getCurrentRound() {
    if (this.currentRoundIndex >= this.rounds.length) return null;
    return this.rounds[this.currentRoundIndex];
  }

  getTotalRounds() {
    return this.rounds.length;
  }

  getOverallLeaderboard() {
    const entries = [];
    for (const [nickname, data] of this.playerScores) {
      entries.push({
        nickname,
        totalScore: data.totalScore,
        roundScores: data.roundScores,
        roundsPlayed: data.roundScores.length
      });
    }
    return entries.sort((a, b) => b.totalScore - a.totalScore);
  }

  getOverallPodium() {
    return this.getOverallLeaderboard().slice(0, 3);
  }

  isCompleted() {
    return this.state === TournamentState.COMPLETED;
  }

  toJSON() {
    const scores = {};
    for (const [nickname, data] of this.playerScores) {
      scores[nickname] = data;
    }
    return {
      id: this.id,
      name: this.name,
      hostUserId: this.hostUserId,
      rounds: this.rounds,
      currentRoundIndex: this.currentRoundIndex,
      state: this.state,
      playerScores: scores,
      createdAt: this.createdAt
    };
  }
}

module.exports = { Tournament, TournamentState, MAX_ROUNDS };
