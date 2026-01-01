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
        return new Question({
          id: q._id.toString(),
          text: q.text || 'Question text missing',
          type: q.type || 'MULTIPLE_CHOICE',
          options: q.options && q.options.length >= 2 ? q.options : ['Option 1', 'Option 2'],
          correctAnswerIndex: q.correctAnswerIndex >= 0 ? q.correctAnswerIndex : 0,
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
    try {
      const doc = await QuizModel.findById(id);
      return this._toDomain(doc);
    } catch (error) {
      console.error(`[MongoQuizRepository.findById] Error finding quiz ${id}:`, error.message);
      return null;
    }
  }

  async findByCreator(createdBy, { page = 1, limit = 20 } = {}) {
    const skip = (page - 1) * limit;
    const [docs, total] = await Promise.all([
      QuizModel.find({ createdBy }).sort({ createdAt: -1 }).skip(skip).limit(limit),
      QuizModel.countDocuments({ createdBy })
    ]);
    return {
      quizzes: docs.map(doc => this._toDomain(doc)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total
      }
    };
  }

  async findPublic({ page = 1, limit = 20 } = {}) {
    const skip = (page - 1) * limit;
    const [docs, total] = await Promise.all([
      QuizModel.find({ isPublic: true }).sort({ createdAt: -1 }).skip(skip).limit(limit),
      QuizModel.countDocuments({ isPublic: true })
    ]);
    return {
      quizzes: docs.map(doc => this._toDomain(doc)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total
      }
    };
  }

  async delete(id) {
    const result = await QuizModel.findByIdAndDelete(id);
    return !!result;
  }

  async exists(id) {
    try {
      const count = await QuizModel.countDocuments({ _id: id });
      return count > 0;
    } catch (error) {
      console.error(`[MongoQuizRepository.exists] Error checking quiz ${id}:`, error.message);
      return false;
    }
  }

  async getAll({ page = 1, limit = 100 } = {}) {
    const skip = (page - 1) * limit;
    const [docs, total] = await Promise.all([
      QuizModel.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
      QuizModel.countDocuments()
    ]);
    return {
      quizzes: docs.map(doc => this._toDomain(doc)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total
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
   * Search public quizzes by title or description
   * @param {string} query - Search query
   * @param {Object} options - Pagination options
   * @returns {Promise<{quizzes: Quiz[], pagination: Object}>}
   */
  async searchPublic(query, { page = 1, limit = 20 } = {}) {
    const skip = (page - 1) * limit;
    const searchRegex = new RegExp(query, 'i');

    const filter = {
      isPublic: true,
      $or: [
        { title: searchRegex },
        { description: searchRegex }
      ]
    };

    const [docs, total] = await Promise.all([
      QuizModel.find(filter).sort({ playCount: -1, createdAt: -1 }).skip(skip).limit(limit),
      QuizModel.countDocuments(filter)
    ]);

    return {
      quizzes: docs.map(doc => this._toDomain(doc)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total
      }
    };
  }
}

const mongoQuizRepository = new MongoQuizRepository();

module.exports = { MongoQuizRepository, mongoQuizRepository };
