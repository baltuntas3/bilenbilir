const { NotFoundError, ForbiddenError, ValidationError } = require('../../shared/errors');

class AdminUseCases {
  constructor(userRepository, quizRepository, roomRepository, gameSessionRepository, auditLogRepository = null, options = {}) {
    this.userRepository = userRepository;
    this.quizRepository = quizRepository;
    this.roomRepository = roomRepository;
    this.gameSessionRepository = gameSessionRepository;
    this.auditLogRepository = auditLogRepository;
    // Callback for notifying room closure (set by socket handler)
    this.onRoomClosed = options.onRoomClosed || null;
  }

  /**
   * Log an admin action for audit trail
   * @private
   */
  async _logAction(actor, action, targetType, targetId, details = {}) {
    if (!this.auditLogRepository) return;

    try {
      await this.auditLogRepository.create({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action,
        targetType,
        targetId: String(targetId),
        details
      });
    } catch (error) {
      // Log error but don't fail the operation
      console.error('[AuditLog] Failed to create audit log:', error.message);
    }
  }

  /**
   * Validate that requester is admin
   * @private
   */
  async _validateAdmin(requesterId) {
    const user = await this.userRepository.findById(requesterId);
    if (!user || user.role !== 'admin') {
      throw new ForbiddenError('Admin access required');
    }
    return user;
  }

  // ==================== STATS ====================

  /**
   * Get system statistics
   */
  async getSystemStats({ requesterId }) {
    await this._validateAdmin(requesterId);

    // Get user stats
    const allUsers = await this.userRepository.findAll ?
      await this.userRepository.findAll() : { users: [], pagination: { total: 0 } };
    const totalUsers = allUsers.pagination?.total || 0;

    // Get quiz stats
    const allQuizzes = await this.quizRepository.getAll({ limit: 1 });
    const totalQuizzes = allQuizzes.pagination?.total || 0;

    // Get active rooms
    const activeRooms = this.roomRepository ? await this.roomRepository.getAll() : [];
    const totalActiveRooms = activeRooms.length;
    const totalActivePlayers = activeRooms.reduce((sum, room) => sum + room.getPlayerCount(), 0);

    // Get game session stats
    let totalSessions = 0;
    if (this.gameSessionRepository) {
      const sessions = await this.gameSessionRepository.getRecent({ limit: 1 });
      totalSessions = sessions.pagination?.total || 0;
    }

    return {
      stats: {
        users: {
          total: totalUsers
        },
        quizzes: {
          total: totalQuizzes
        },
        rooms: {
          active: totalActiveRooms,
          totalPlayers: totalActivePlayers
        },
        sessions: {
          total: totalSessions
        }
      }
    };
  }

  // ==================== USER MANAGEMENT ====================

  /**
   * Get all users with pagination
   */
  async getAllUsers({ requesterId, page = 1, limit = 20 }) {
    await this._validateAdmin(requesterId);

    // Use findAll if available, otherwise construct a workaround
    if (this.userRepository.findAll) {
      return await this.userRepository.findAll({ page, limit });
    }

    // Fallback: not implemented
    return { users: [], pagination: { page, limit, total: 0, totalPages: 0 } };
  }

  /**
   * Get user by ID
   */
  async getUserById({ requesterId, userId }) {
    await this._validateAdmin(requesterId);

    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    return { user: user.toPublicJSON ? user.toPublicJSON() : user };
  }

  /**
   * Update user role
   */
  async updateUserRole({ requesterId, userId, role }) {
    const admin = await this._validateAdmin(requesterId);

    if (!['user', 'admin'].includes(role)) {
      throw new ValidationError('Invalid role. Must be "user" or "admin"');
    }

    // Get target user first to ensure they exist
    const oldUser = await this.userRepository.findById(userId);
    if (!oldUser) {
      throw new NotFoundError('User not found');
    }
    const oldRole = oldUser.role;

    // Prevent admin from demoting themselves (check after verifying user exists)
    if (requesterId === userId && role !== 'admin') {
      throw new ForbiddenError('Cannot demote yourself');
    }

    const user = await this.userRepository.updateById(userId, { role });

    // Audit log
    await this._logAction(admin, 'USER_ROLE_UPDATED', 'user', userId, {
      oldRole,
      newRole: role,
      targetEmail: user.email
    });

    return { user: user.toPublicJSON ? user.toPublicJSON() : user };
  }

  /**
   * Update user active status
   */
  async updateUserStatus({ requesterId, userId, isActive }) {
    const admin = await this._validateAdmin(requesterId);

    if (typeof isActive !== 'boolean') {
      throw new ValidationError('isActive must be a boolean');
    }

    // Prevent admin from deactivating themselves
    if (requesterId === userId && !isActive) {
      throw new ForbiddenError('Cannot deactivate yourself');
    }

    // Get old status for audit
    const oldUser = await this.userRepository.findById(userId);
    if (!oldUser) {
      throw new NotFoundError('User not found');
    }
    const oldStatus = oldUser.isActive;

    const user = await this.userRepository.updateById(userId, { isActive });

    // Audit log
    await this._logAction(admin, 'USER_STATUS_UPDATED', 'user', userId, {
      oldStatus,
      newStatus: isActive,
      targetEmail: user.email
    });

    return { user: user.toPublicJSON ? user.toPublicJSON() : user };
  }

  /**
   * Delete user (admin only)
   */
  async deleteUser({ requesterId, userId }) {
    const admin = await this._validateAdmin(requesterId);

    // Prevent admin from deleting themselves
    if (requesterId === userId) {
      throw new ForbiddenError('Cannot delete yourself');
    }

    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const userEmail = user.email;
    const username = user.username;

    // Delete user's quizzes first
    let deletedQuizCount = 0;
    if (this.quizRepository.deleteByCreator) {
      deletedQuizCount = await this.quizRepository.deleteByCreator(userId);
    }

    // Delete user's game sessions
    let deletedSessionCount = 0;
    if (this.gameSessionRepository && this.gameSessionRepository.deleteByHost) {
      deletedSessionCount = await this.gameSessionRepository.deleteByHost(userId);
    }

    // Close any active rooms hosted by this user and notify players
    if (this.roomRepository) {
      const rooms = await this.roomRepository.getAll();
      for (const room of rooms) {
        if (room.hostUserId === userId) {
          // Notify players before closing room
          if (this.onRoomClosed) {
            try {
              await this.onRoomClosed(room.pin, {
                reason: 'Host account deleted',
                playerCount: room.getPlayerCount(),
                spectatorCount: room.getSpectatorCount()
              });
            } catch (error) {
              console.error('[AdminUseCases] Failed to notify room closure for deleted user:', error.message);
            }
          }
          await this.roomRepository.delete(room.pin);
        }
      }
    }

    // Delete user
    await this.userRepository.deleteById(userId);

    // Audit log
    await this._logAction(admin, 'USER_DELETED', 'user', userId, {
      deletedUserEmail: userEmail,
      deletedUsername: username,
      deletedQuizCount,
      deletedSessionCount
    });

    return { success: true, deletedQuizCount, deletedSessionCount };
  }

  // ==================== QUIZ MANAGEMENT ====================

  /**
   * Get all quizzes with pagination (including private)
   */
  async getAllQuizzes({ requesterId, page = 1, limit = 20 }) {
    await this._validateAdmin(requesterId);

    const result = await this.quizRepository.getAll({ page, limit });
    return result;
  }

  /**
   * Delete any quiz (admin override)
   */
  async deleteQuiz({ requesterId, quizId }) {
    const admin = await this._validateAdmin(requesterId);

    const quiz = await this.quizRepository.findById(quizId);
    if (!quiz) {
      throw new NotFoundError('Quiz not found');
    }

    // Check for active games
    if (this.roomRepository) {
      const rooms = await this.roomRepository.getAll();
      const activeGame = rooms.find(room => room.quizId === quizId);
      if (activeGame) {
        throw new ForbiddenError('Cannot delete quiz while it is being used in an active game');
      }
    }

    const quizTitle = quiz.title;
    const quizCreator = quiz.createdBy;

    // Delete related game sessions
    let deletedSessionCount = 0;
    if (this.gameSessionRepository) {
      deletedSessionCount = await this.gameSessionRepository.deleteByQuiz(quizId);
    }

    await this.quizRepository.delete(quizId);

    // Audit log
    await this._logAction(admin, 'QUIZ_DELETED_ADMIN', 'quiz', quizId, {
      quizTitle,
      quizCreator,
      deletedSessionCount
    });

    return { success: true };
  }

  // ==================== ROOM MANAGEMENT ====================

  /**
   * Get all active rooms
   */
  async getActiveRooms({ requesterId }) {
    await this._validateAdmin(requesterId);

    const rooms = this.roomRepository ? await this.roomRepository.getAll() : [];

    return {
      rooms: rooms.map(room => ({
        pin: room.pin,
        state: room.state,
        playerCount: room.getPlayerCount(),
        spectatorCount: room.getSpectatorCount(),
        createdAt: room.createdAt,
        quizId: room.quizId,
        isPaused: room.isPaused()
      }))
    };
  }

  /**
   * Force close a room (admin override)
   */
  async closeRoom({ requesterId, pin }) {
    const admin = await this._validateAdmin(requesterId);

    if (!this.roomRepository) {
      throw new ValidationError('Room repository not available');
    }

    const room = await this.roomRepository.findByPin(pin);
    if (!room) {
      throw new NotFoundError('Room not found');
    }

    const roomState = room.state;
    const playerCount = room.getPlayerCount();
    const spectatorCount = room.getSpectatorCount();
    const quizId = room.quizId;

    // Notify players before closing room
    if (this.onRoomClosed) {
      try {
        await this.onRoomClosed(pin, {
          reason: 'Room closed by administrator',
          playerCount,
          spectatorCount
        });
      } catch (error) {
        console.error('[AdminUseCases] Failed to notify room closure:', error.message);
      }
    }

    await this.roomRepository.delete(pin);

    // Audit log
    await this._logAction(admin, 'ROOM_CLOSED_ADMIN', 'room', pin, {
      roomState,
      playerCount,
      spectatorCount,
      quizId
    });

    return { success: true, pin, playerCount, spectatorCount };
  }

  // ==================== SESSION MANAGEMENT ====================

  /**
   * Get all game sessions with pagination
   */
  async getAllSessions({ requesterId, page = 1, limit = 20 }) {
    await this._validateAdmin(requesterId);

    if (!this.gameSessionRepository) {
      return { sessions: [], pagination: { page, limit, total: 0, totalPages: 0 } };
    }

    const result = await this.gameSessionRepository.getRecent({ page, limit });
    return result;
  }

  /**
   * Delete a game session
   */
  async deleteSession({ requesterId, sessionId }) {
    const admin = await this._validateAdmin(requesterId);

    if (!this.gameSessionRepository) {
      throw new ValidationError('Session repository not available');
    }

    // Get session details before deletion for audit
    const session = await this.gameSessionRepository.findById(sessionId);
    if (!session) {
      throw new NotFoundError('Session not found');
    }

    const sessionPin = session.pin;
    const sessionStatus = session.status;

    const deleted = await this.gameSessionRepository.delete(sessionId);
    if (!deleted) {
      throw new NotFoundError('Session not found');
    }

    // Audit log
    await this._logAction(admin, 'SESSION_DELETED', 'session', sessionId, {
      sessionPin,
      sessionStatus
    });

    return { success: true };
  }

  // ==================== AUDIT LOG QUERIES ====================

  /**
   * Get audit logs with pagination
   */
  async getAuditLogs({ requesterId, page = 1, limit = 50, action, targetType }) {
    await this._validateAdmin(requesterId);

    if (!this.auditLogRepository) {
      return { logs: [], pagination: { page, limit, total: 0, totalPages: 0, hasMore: false } };
    }

    const filters = {};
    if (action) filters.action = action;
    if (targetType) filters.targetType = targetType;

    return await this.auditLogRepository.find(filters, { page, limit });
  }
}

module.exports = { AdminUseCases };
