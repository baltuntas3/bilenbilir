const express = require('express');
const { authenticate } = require('../middlewares/authMiddleware');
const { ClassroomUseCases } = require('../../application/use-cases/ClassroomUseCases');
const { classroomRepository } = require('../../infrastructure/repositories');

const router = express.Router();
const classroomUseCases = new ClassroomUseCases(classroomRepository);

router.post('/', authenticate, async (req, res, next) => {
  try {
    const { name, description } = req.body;
    const classroom = await classroomUseCases.create({ name, description, teacherId: req.user.id });
    res.status(201).json(classroom);
  } catch (error) { next(error); }
});

router.get('/my', authenticate, async (req, res, next) => {
  try {
    const classrooms = await classroomUseCases.getMyClassrooms(req.user.id);
    res.json({ classrooms });
  } catch (error) { next(error); }
});

router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const classroom = await classroomUseCases.getById(req.params.id, req.user.id);
    res.json(classroom);
  } catch (error) { next(error); }
});

router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const { name, description } = req.body;
    const updated = await classroomUseCases.update(req.params.id, req.user.id, { name, description });
    res.json(updated);
  } catch (error) { next(error); }
});

router.post('/join', async (req, res, next) => {
  try {
    const { joinCode, nickname } = req.body;
    const result = await classroomUseCases.joinByCode(joinCode, nickname);
    res.json(result);
  } catch (error) { next(error); }
});

router.delete('/:id/students/:nickname', authenticate, async (req, res, next) => {
  try {
    const result = await classroomUseCases.removeStudent(req.params.id, req.params.nickname, req.user.id);
    res.json(result);
  } catch (error) { next(error); }
});

router.post('/:id/assign', authenticate, async (req, res, next) => {
  try {
    const { quizId, dueDate } = req.body;
    const updated = await classroomUseCases.assignQuiz(req.params.id, quizId, dueDate, req.user.id);
    res.json(updated);
  } catch (error) { next(error); }
});

router.delete('/:id/assign/:index', authenticate, async (req, res, next) => {
  try {
    const updated = await classroomUseCases.removeAssignment(req.params.id, parseInt(req.params.index), req.user.id);
    res.json(updated);
  } catch (error) { next(error); }
});

router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    await classroomUseCases.delete(req.params.id, req.user.id);
    res.status(204).send();
  } catch (error) { next(error); }
});

module.exports = router;
