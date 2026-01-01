/**
 * In-memory Quiz Repository
 * Used ONLY for unit tests - provides fast, isolated testing without MongoDB.
 * Production code uses MongoQuizRepository instead.
 */
class QuizRepository {
  constructor() {
    this.quizzes = new Map(); // id -> Quiz
  }

  async save(quiz) {
    this.quizzes.set(quiz.id, quiz);
    return quiz;
  }

  async findById(id) {
    return this.quizzes.get(id) || null;
  }

  async findByCreator(createdBy, { page = 1, limit = 20 } = {}) {
    const allQuizzes = [];
    for (const quiz of this.quizzes.values()) {
      if (quiz.createdBy === createdBy) {
        allQuizzes.push(quiz);
      }
    }
    // Apply pagination
    const total = allQuizzes.length;
    const skip = (page - 1) * limit;
    const quizzes = allQuizzes.slice(skip, skip + limit);

    return {
      quizzes,
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
    const allQuizzes = [];
    for (const quiz of this.quizzes.values()) {
      if (quiz.isPublic) {
        allQuizzes.push(quiz);
      }
    }
    // Apply pagination
    const total = allQuizzes.length;
    const skip = (page - 1) * limit;
    const quizzes = allQuizzes.slice(skip, skip + limit);

    return {
      quizzes,
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
    return this.quizzes.delete(id);
  }

  async exists(id) {
    return this.quizzes.has(id);
  }

  async getAll({ page = 1, limit = 100 } = {}) {
    const allQuizzes = Array.from(this.quizzes.values());
    const total = allQuizzes.length;
    const skip = (page - 1) * limit;
    const quizzes = allQuizzes.slice(skip, skip + limit);

    return {
      quizzes,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total
      }
    };
  }

  async clear() {
    this.quizzes.clear();
  }

  /**
   * Increment play count for a quiz (no-op for in-memory repository)
   * This is implemented for interface compatibility with MongoQuizRepository
   */
  async incrementPlayCount(id) {
    // In-memory repository doesn't track play counts
    // This is a no-op for testing purposes
  }
}

// Singleton instance
const quizRepository = new QuizRepository();

module.exports = { QuizRepository, quizRepository };
