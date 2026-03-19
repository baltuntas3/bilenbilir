const mongoose = require('mongoose');
const { QuizRating } = require('../db/models/QuizRating');
const { Quiz: QuizModel } = require('../db/models/Quiz');

/**
 * QuizRating Repository
 * Handles rating persistence and aggregation
 */
class QuizRatingRepository {
  /**
   * Check if ID is a valid MongoDB ObjectId format
   * @private
   */
  _isValidObjectId(id) {
    if (!id || typeof id !== 'string') return false;
    return /^[0-9a-fA-F]{24}$/.test(id);
  }

  /**
   * Create or update a rating (upsert)
   * Also updates the cached averageRating and ratingCount on the Quiz document
   * @param {string} quizId - Quiz ID
   * @param {string} userId - User ID
   * @param {number} rating - Rating value (1-5)
   * @returns {Promise<{rating: number, isNew: boolean}>}
   */
  async rate(quizId, userId, rating) {
    const result = await QuizRating.findOneAndUpdate(
      { quiz: quizId, user: userId },
      { rating },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Update cached rating on Quiz document
    await this._updateCachedRating(quizId);

    return {
      rating: result.rating,
      isNew: !result.updatedAt || result.createdAt.getTime() === result.updatedAt.getTime()
    };
  }

  /**
   * Get a user's rating for a specific quiz
   * @param {string} quizId - Quiz ID
   * @param {string} userId - User ID
   * @returns {Promise<number|null>} Rating value or null
   */
  async getUserRating(quizId, userId) {
    if (!this._isValidObjectId(quizId) || !this._isValidObjectId(userId)) {
      return null;
    }
    const doc = await QuizRating.findOne({ quiz: quizId, user: userId });
    return doc ? doc.rating : null;
  }

  /**
   * Get average rating for a quiz
   * @param {string} quizId - Quiz ID
   * @returns {Promise<{average: number, count: number}>}
   */
  async getAverageRating(quizId) {
    if (!this._isValidObjectId(quizId)) {
      return { average: 0, count: 0 };
    }

    const [result] = await QuizRating.aggregate([
      { $match: { quiz: new mongoose.Types.ObjectId(quizId) } },
      {
        $group: {
          _id: null,
          average: { $avg: '$rating' },
          count: { $sum: 1 }
        }
      }
    ]);

    if (!result) {
      return { average: 0, count: 0 };
    }

    return {
      average: Math.round(result.average * 10) / 10,
      count: result.count
    };
  }

  /**
   * Bulk get average ratings for multiple quizzes (for list pages)
   * @param {string[]} quizIds - Array of Quiz IDs
   * @returns {Promise<Map<string, {average: number, count: number}>>}
   */
  async getAverageRatings(quizIds) {
    const validIds = quizIds.filter(id => this._isValidObjectId(id));
    if (validIds.length === 0) {
      return new Map();
    }

    const results = await QuizRating.aggregate([
      { $match: { quiz: { $in: validIds.map(id => new mongoose.Types.ObjectId(id)) } } },
      {
        $group: {
          _id: '$quiz',
          average: { $avg: '$rating' },
          count: { $sum: 1 }
        }
      }
    ]);

    const map = new Map();
    for (const r of results) {
      map.set(r._id.toString(), {
        average: Math.round(r.average * 10) / 10,
        count: r.count
      });
    }
    return map;
  }

  /**
   * Update cached averageRating and ratingCount on the Quiz document
   * @private
   * @param {string} quizId - Quiz ID
   */
  async _updateCachedRating(quizId) {
    const { average, count } = await this.getAverageRating(quizId);
    await QuizModel.findByIdAndUpdate(quizId, {
      averageRating: average,
      ratingCount: count
    });
  }
}

const quizRatingRepository = new QuizRatingRepository();

module.exports = { QuizRatingRepository, quizRatingRepository };
