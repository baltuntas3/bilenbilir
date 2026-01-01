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

  async findByCreator(createdBy) {
    const result = [];
    for (const quiz of this.quizzes.values()) {
      if (quiz.createdBy === createdBy) {
        result.push(quiz);
      }
    }
    return result;
  }

  async findPublic() {
    const result = [];
    for (const quiz of this.quizzes.values()) {
      if (quiz.isPublic) {
        result.push(quiz);
      }
    }
    return result;
  }

  async delete(id) {
    return this.quizzes.delete(id);
  }

  async exists(id) {
    return this.quizzes.has(id);
  }

  async getAll() {
    return Array.from(this.quizzes.values());
  }

  async clear() {
    this.quizzes.clear();
  }
}

// Singleton instance
const quizRepository = new QuizRepository();

module.exports = { QuizRepository, quizRepository };
