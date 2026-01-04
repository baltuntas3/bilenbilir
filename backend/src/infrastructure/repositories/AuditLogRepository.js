const { AuditLog } = require('../db/models/AuditLog');

/**
 * Audit Log Repository
 * Handles persistence and querying of audit log entries
 */
class AuditLogRepository {
  /**
   * Create a new audit log entry
   * @param {Object} logData - Audit log data
   * @returns {Promise<Object>} Created log entry
   */
  async create(logData) {
    const log = new AuditLog(logData);
    await log.save();
    return log.toObject();
  }

  /**
   * Find audit logs with filters and pagination
   * @param {Object} filters - Query filters
   * @param {Object} options - Pagination options
   * @returns {Promise<{logs: Array, pagination: Object}>}
   */
  async find({ actorId, action, targetType, targetId, startDate, endDate } = {}, { page = 1, limit = 50 } = {}) {
    const query = {};

    if (actorId) query.actorId = actorId;
    if (action) query.action = action;
    if (targetType) query.targetType = targetType;
    if (targetId) query.targetId = targetId;

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments(query)
    ]);

    return {
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total
      }
    };
  }

  /**
   * Get recent audit logs
   * @param {Object} options - Pagination options
   * @returns {Promise<{logs: Array, pagination: Object}>}
   */
  async getRecent({ page = 1, limit = 50 } = {}) {
    return this.find({}, { page, limit });
  }

  /**
   * Get audit logs for a specific actor
   * @param {string} actorId - Actor user ID
   * @param {Object} options - Pagination options
   */
  async findByActor(actorId, { page = 1, limit = 50 } = {}) {
    return this.find({ actorId }, { page, limit });
  }

  /**
   * Get audit logs for a specific target
   * @param {string} targetType - Target type (user, quiz, room, session)
   * @param {string} targetId - Target ID
   * @param {Object} options - Pagination options
   */
  async findByTarget(targetType, targetId, { page = 1, limit = 50 } = {}) {
    return this.find({ targetType, targetId }, { page, limit });
  }

  /**
   * Delete old audit logs (for cleanup/retention policy)
   * @param {Date} olderThan - Delete logs older than this date
   * @returns {Promise<number>} Number of deleted logs
   */
  async deleteOlderThan(olderThan) {
    const result = await AuditLog.deleteMany({
      createdAt: { $lt: olderThan }
    });
    return result.deletedCount || 0;
  }
}

const auditLogRepository = new AuditLogRepository();

module.exports = { AuditLogRepository, auditLogRepository };
