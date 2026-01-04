const { Quiz: QuizModel } = require('../db/models');
const { Quiz, Question } = require('../../domain/entities');

/**
 * MongoDB Quiz Repository
 * Converts between Mongoose models and Domain entities
 */
class MongoQuizRepository {
  /**
   * Sanitize imageUrl from database - handle legacy/corrupt data
   * @private
   */
  _sanitizeImageUrl(url) {
    if (!url || typeof url !== 'string' || url.trim() === '') {
      return null;
    }

    try {
      const parsed = new URL(url.trim());
      // Only allow http and https protocols
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return url.trim();
      }
      console.warn(`Invalid imageUrl protocol in database: ${parsed.protocol}`);
      return null;
    } catch {
      console.warn(`Invalid imageUrl format in database: ${url}`);
      return null;
    }
  }

  /**
   * Convert Mongoose document to Domain entity
   * Handles potential corrupt data gracefully
   */
  _toDomain(doc) {
    if (!doc) return null;

    const questions = (doc.questions || []).map(q => {
      try {
        return new Question({
          id: q._id.toString(),
          text: q.text,
          type: q.type,
          options: q.options,
          correctAnswerIndex: q.correctAnswerIndex,
          timeLimit: q.timeLimit,
          points: q.points,
          imageUrl: this._sanitizeImageUrl(q.imageUrl)
        });
      } catch (error) {
        // Log but don't fail - return question with sanitized defaults
        console.error(`Error converting question ${q._id}: ${error.message}`);
        // Sanitize options first
        const safeOptions = q.options && q.options.length >= 2 ? q.options : ['Option 1', 'Option 2'];
        // Ensure correctAnswerIndex is within bounds of options
        const safeCorrectIndex = (q.correctAnswerIndex >= 0 && q.correctAnswerIndex < safeOptions.length)
          ? q.correctAnswerIndex
          : 0;
        return new Question({
          id: q._id.toString(),
          text: q.text || 'Question text missing',
          type: q.type || 'MULTIPLE_CHOICE',
          options: safeOptions,
          correctAnswerIndex: safeCorrectIndex,
          timeLimit: q.timeLimit >= 5 && q.timeLimit <= 120 ? q.timeLimit : 30,
          points: q.points >= 100 && q.points <= 10000 ? q.points : 1000,
          imageUrl: null
        });
      }
    });

    return new Quiz({
      id: doc._id.toString(),
      title: doc.title,
      description: doc.description,
      createdBy: doc.createdBy.toString(),
      questions,
      isPublic: doc.isPublic,
      playCount: doc.playCount || 0,
      createdAt: doc.createdAt
    });
  }

  /**
   * Convert Domain entity to plain object for Mongoose
   */
  _toDocument(quiz) {
    return {
      title: quiz.title,
      description: quiz.description,
      createdBy: quiz.createdBy,
      questions: quiz.questions.map(q => ({
        text: q.text,
        type: q.type,
        options: q.options,
        correctAnswerIndex: q.correctAnswerIndex,
        timeLimit: q.timeLimit,
        points: q.points,
        imageUrl: q.imageUrl
      })),
      isPublic: quiz.isPublic
    };
  }

  /**
   * Check if ID is a valid MongoDB ObjectId format
   * @private
   */
  _isValidObjectId(id) {
    if (!id || typeof id !== 'string') return false;
    // MongoDB ObjectId is a 24-character hex string
    return /^[0-9a-fA-F]{24}$/.test(id);
  }

  async save(quiz) {
    if (quiz.id && this._isValidObjectId(quiz.id)) {
      // Update existing
      const doc = await QuizModel.findByIdAndUpdate(
        quiz.id,
        this._toDocument(quiz),
        { new: true }
      );
      return this._toDomain(doc);
    } else {
      // Create new
      const doc = new QuizModel(this._toDocument(quiz));
      await doc.save();
      return this._toDomain(doc);
    }
  }

  async findById(id) {
    // Validate ObjectId format before querying
    if (!this._isValidObjectId(id)) {
      return null;
    }
    try {
      const doc = await QuizModel.findById(id);
      return this._toDomain(doc);
    } catch (error) {
      console.error(`[MongoQuizRepository.findById] Error finding quiz ${id}:`, error.message);
      return null;
    }
  }

  async findByCreator(createdBy, { page = 1, limit = 20 } = {}) {
    // Validate pagination bounds to prevent DoS
    const safePage = Math.max(1, Math.min(Number(page) || 1, 1000)); // Max 1000 pages
    const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100)); // Max 100 per page
    const skip = (safePage - 1) * safeLimit;

    const [docs, total] = await Promise.all([
      QuizModel.find({ createdBy }).sort({ createdAt: -1 }).skip(skip).limit(safeLimit),
      QuizModel.countDocuments({ createdBy })
    ]);
    return {
      quizzes: docs.map(doc => this._toDomain(doc)),
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
        hasMore: safePage * safeLimit < total
      }
    };
  }

  async findPublic({ page = 1, limit = 20 } = {}) {
    // Validate pagination bounds to prevent DoS
    const safePage = Math.max(1, Math.min(Number(page) || 1, 1000)); // Max 1000 pages
    const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100)); // Max 100 per page
    const skip = (safePage - 1) * safeLimit;

    const [docs, total] = await Promise.all([
      QuizModel.find({ isPublic: true }).sort({ createdAt: -1 }).skip(skip).limit(safeLimit),
      QuizModel.countDocuments({ isPublic: true })
    ]);
    return {
      quizzes: docs.map(doc => this._toDomain(doc)),
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
        hasMore: safePage * safeLimit < total
      }
    };
  }

  async delete(id) {
    // Validate ObjectId format before querying
    if (!this._isValidObjectId(id)) {
      return false;
    }
    const result = await QuizModel.findByIdAndDelete(id);
    return !!result;
  }

  async exists(id) {
    // Validate ObjectId format before querying
    if (!this._isValidObjectId(id)) {
      return false;
    }
    try {
      const count = await QuizModel.countDocuments({ _id: id });
      return count > 0;
    } catch (error) {
      console.error(`[MongoQuizRepository.exists] Error checking quiz ${id}:`, error.message);
      return false;
    }
  }

  async getAll({ page = 1, limit = 100 } = {}) {
    // Validate pagination bounds to prevent DoS
    const safePage = Math.max(1, Math.min(Number(page) || 1, 1000)); // Max 1000 pages
    const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 100)); // Max 100 per page
    const skip = (safePage - 1) * safeLimit;

    const [docs, total] = await Promise.all([
      QuizModel.find().sort({ createdAt: -1 }).skip(skip).limit(safeLimit),
      QuizModel.countDocuments()
    ]);
    return {
      quizzes: docs.map(doc => this._toDomain(doc)),
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
        hasMore: safePage * safeLimit < total
      }
    };
  }

  async incrementPlayCount(id) {
    try {
      await QuizModel.findByIdAndUpdate(id, { $inc: { playCount: 1 } });
    } catch (error) {
      // Log error but don't throw - play count is non-critical
      console.error('Failed to increment play count:', error.message);
    }
  }

  /**
   * Delete all quizzes by creator
   * @param {string} createdBy - Creator user ID
   * @returns {Promise<number>} Number of deleted quizzes
   */
  async deleteByCreator(createdBy) {
    const result = await QuizModel.deleteMany({ createdBy });
    return result.deletedCount || 0;
  }

  /**
   * Escape special regex characters to prevent ReDoS attacks
   * @private
   */
  _escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Search public quizzes by title or description
   * @param {string} query - Search query (max 100 characters)
   * @param {Object} options - Pagination options
   * @returns {Promise<{quizzes: Quiz[], pagination: Object}>}
   */
  async searchPublic(query, { page = 1, limit = 20 } = {}) {
    // Validate and sanitize query
    if (!query || typeof query !== 'string') {
      return { quizzes: [], pagination: { page, limit, total: 0, totalPages: 0, hasMore: false } };
    }

    // Limit raw query length first
    const MAX_RAW_QUERY_LENGTH = 100;
    const trimmedQuery = query.trim().slice(0, MAX_RAW_QUERY_LENGTH);

    if (trimmedQuery.length === 0) {
      return { quizzes: [], pagination: { page, limit, total: 0, totalPages: 0, hasMore: false } };
    }

    // Escape special regex characters BEFORE any further processing
    // This prevents ReDoS attacks by converting all special chars to literals
    const escapedQuery = this._escapeRegex(trimmedQuery);

    // Limit escaped query length as well (escaping can increase length)
    const MAX_ESCAPED_QUERY_LENGTH = 200;
    if (escapedQuery.length > MAX_ESCAPED_QUERY_LENGTH) {
      return { quizzes: [], pagination: { page, limit, total: 0, totalPages: 0, hasMore: false } };
    }

    // Validate pagination bounds
    const safePage = Math.max(1, Math.min(page, 1000)); // Max 1000 pages
    const safeLimit = Math.max(1, Math.min(limit, 100)); // Max 100 per page
    const skip = (safePage - 1) * safeLimit;

    const searchRegex = new RegExp(escapedQuery, 'i');

    const filter = {
      isPublic: true,
      $or: [
        { title: searchRegex },
        { description: searchRegex }
      ]
    };

    const [docs, total] = await Promise.all([
      QuizModel.find(filter).sort({ playCount: -1, createdAt: -1 }).skip(skip).limit(safeLimit),
      QuizModel.countDocuments(filter)
    ]);

    return {
      quizzes: docs.map(doc => this._toDomain(doc)),
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
        hasMore: safePage * safeLimit < total
      }
    };
  }
}

const mongoQuizRepository = new MongoQuizRepository();

module.exports = { MongoQuizRepository, mongoQuizRepository };
