const express = require('express');
const { authenticate } = require('../middlewares/authMiddleware');
const { TournamentUseCases } = require('../../application/use-cases/TournamentUseCases');
const { tournamentRepository } = require('../../infrastructure/repositories/TournamentRepository');
const { mongoQuizRepository } = require('../../infrastructure/repositories');

const router = express.Router();
const tournamentUseCases = new TournamentUseCases(tournamentRepository, mongoQuizRepository);

router.post('/', authenticate, async (req, res, next) => {
  try {
    const { name, quizIds } = req.body;
    const result = await tournamentUseCases.createTournament({
      name, hostUserId: req.user.id, quizIds: quizIds || []
    });
    res.status(201).json(result.tournament.toJSON());
  } catch (error) { next(error); }
});

router.get('/my', authenticate, async (req, res, next) => {
  try {
    const result = await tournamentUseCases.getMyTournaments(req.user.id);
    res.json({ tournaments: result.tournaments.map(t => t.toJSON()) });
  } catch (error) { next(error); }
});

router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const result = await tournamentUseCases.getTournament(req.params.id, req.user.id);
    res.json(result.tournament.toJSON());
  } catch (error) { next(error); }
});

router.post('/:id/rounds', authenticate, async (req, res, next) => {
  try {
    const result = await tournamentUseCases.addRound({
      tournamentId: req.params.id, quizId: req.body.quizId, requesterId: req.user.id
    });
    res.json(result.tournament.toJSON());
  } catch (error) { next(error); }
});

router.delete('/:id/rounds/:index', authenticate, async (req, res, next) => {
  try {
    const result = await tournamentUseCases.removeRound({
      tournamentId: req.params.id, roundIndex: parseInt(req.params.index),
      requesterId: req.user.id
    });
    res.json(result.tournament.toJSON());
  } catch (error) { next(error); }
});

router.post('/:id/start', authenticate, async (req, res, next) => {
  try {
    const result = await tournamentUseCases.startTournament({
      tournamentId: req.params.id, requesterId: req.user.id
    });
    res.json({ tournament: result.tournament.toJSON(), currentRound: result.currentRound });
  } catch (error) { next(error); }
});

router.post('/:id/complete-round', authenticate, async (req, res, next) => {
  try {
    const { roundIndex, results } = req.body;
    const result = await tournamentUseCases.completeRound({
      tournamentId: req.params.id, roundIndex, results, requesterId: req.user.id
    });
    res.json({
      tournament: result.tournament.toJSON(),
      isCompleted: result.isCompleted,
      overallLeaderboard: result.overallLeaderboard
    });
  } catch (error) { next(error); }
});

router.post('/:id/next-round', authenticate, async (req, res, next) => {
  try {
    const result = await tournamentUseCases.nextRound({
      tournamentId: req.params.id, requesterId: req.user.id
    });
    res.json({ tournament: result.tournament.toJSON(), currentRound: result.currentRound });
  } catch (error) { next(error); }
});

router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    await tournamentUseCases.deleteTournament({
      tournamentId: req.params.id, requesterId: req.user.id
    });
    res.status(204).send();
  } catch (error) { next(error); }
});

module.exports = router;
