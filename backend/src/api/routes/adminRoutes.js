const express = require('express');
const { AdminUseCases } = require('../../application/use-cases');
const { mongoUserRepository } = require('../../infrastructure/repositories/MongoUserRepository');
const { mongoQuizRepository } = require('../../infrastructure/repositories/MongoQuizRepository');
const { roomRepository } = require('../../infrastructure/repositories/RoomRepository');
const { gameSessionRepository } = require('../../infrastructure/repositories/GameSessionRepository');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');

const router = express.Router();

// Initialize AdminUseCases with all repositories
const adminUseCases = new AdminUseCases(
  mongoUserRepository,
  mongoQuizRepository,
  roomRepository,
  gameSessionRepository
);

// All admin routes require authentication and admin role
router.use(authenticate);
router.use(requireAdmin);

// ==================== STATS ====================

/**
 * GET /api/admin/stats
 * Get system statistics
 */
router.get('/stats', async (req, res, next) => {
  try {
    const result = await adminUseCases.getSystemStats({
      requesterId: req.user.id
    });
    res.json(result.stats);
  } catch (error) {
    next(error);
  }
});

// ==================== USER MANAGEMENT ====================

/**
 * GET /api/admin/users
 * Get all users with pagination
 */
router.get('/users', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));

    const result = await adminUseCases.getAllUsers({
      requesterId: req.user.id,
      page,
      limit
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/users/:id
 * Get user by ID
 */
router.get('/users/:id', async (req, res, next) => {
  try {
    const result = await adminUseCases.getUserById({
      requesterId: req.user.id,
      userId: req.params.id
    });
    res.json(result.user);
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/admin/users/:id/role
 * Update user role
 */
router.put('/users/:id/role', async (req, res, next) => {
  try {
    const { role } = req.body;

    const result = await adminUseCases.updateUserRole({
      requesterId: req.user.id,
      userId: req.params.id,
      role
    });
    res.json(result.user);
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/admin/users/:id/status
 * Update user active status
 */
router.put('/users/:id/status', async (req, res, next) => {
  try {
    const { isActive } = req.body;

    const result = await adminUseCases.updateUserStatus({
      requesterId: req.user.id,
      userId: req.params.id,
      isActive
    });
    res.json(result.user);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/admin/users/:id
 * Delete user
 */
router.delete('/users/:id', async (req, res, next) => {
  try {
    await adminUseCases.deleteUser({
      requesterId: req.user.id,
      userId: req.params.id
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// ==================== QUIZ MANAGEMENT ====================

/**
 * GET /api/admin/quizzes
 * Get all quizzes with pagination
 */
router.get('/quizzes', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));

    const result = await adminUseCases.getAllQuizzes({
      requesterId: req.user.id,
      page,
      limit
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/admin/quizzes/:id
 * Delete any quiz (admin override)
 */
router.delete('/quizzes/:id', async (req, res, next) => {
  try {
    await adminUseCases.deleteQuiz({
      requesterId: req.user.id,
      quizId: req.params.id
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// ==================== ROOM MANAGEMENT ====================

/**
 * GET /api/admin/rooms
 * Get all active rooms
 */
router.get('/rooms', async (req, res, next) => {
  try {
    const result = await adminUseCases.getActiveRooms({
      requesterId: req.user.id
    });
    res.json(result.rooms);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/admin/rooms/:pin
 * Force close a room
 */
router.delete('/rooms/:pin', async (req, res, next) => {
  try {
    await adminUseCases.closeRoom({
      requesterId: req.user.id,
      pin: req.params.pin
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// ==================== SESSION MANAGEMENT ====================

/**
 * GET /api/admin/sessions
 * Get all game sessions with pagination
 */
router.get('/sessions', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));

    const result = await adminUseCases.getAllSessions({
      requesterId: req.user.id,
      page,
      limit
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/admin/sessions/:id
 * Delete a game session
 */
router.delete('/sessions/:id', async (req, res, next) => {
  try {
    await adminUseCases.deleteSession({
      requesterId: req.user.id,
      sessionId: req.params.id
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
