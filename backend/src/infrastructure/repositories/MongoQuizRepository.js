const { Quiz: QuizModel } = require('../db/models');
const { Quiz, Question } = require('../../domain/entities');

/**
 * MongoDB Quiz Repository
 * Converts between Mongoose models and Domain entities
 */
class MongoQuizRepository {
  /**
   * Convert Mongoose document to Domain entity
   */
  _toDomain(doc) {
    if (!doc) return null;

    const questions = (doc.questions || []).map(q => new Question({
      id: q._id.toString(),
      text: q.text,
      type: q.type,
      options: q.options,
      correctAnswerIndex: q.correctAnswerIndex,
      timeLimit: q.timeLimit,
      points: q.points,
      imageUrl: q.imageUrl
    }));

    return new Quiz({
      id: doc._id.toString(),
      title: doc.title,
      description: doc.description,
      createdBy: doc.createdBy.toString(),
      questions,
      isPublic: doc.isPublic,
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

  async save(quiz) {
    if (quiz.id && quiz.id.length === 24) {
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
    } catch {
      return null;
    }
  }

  async findByCreator(createdBy) {
    const docs = await QuizModel.find({ createdBy }).sort({ createdAt: -1 });
    return docs.map(doc => this._toDomain(doc));
  }

  async findPublic() {
    const docs = await QuizModel.find({ isPublic: true }).sort({ createdAt: -1 });
    return docs.map(doc => this._toDomain(doc));
  }

  async delete(id) {
    const result = await QuizModel.findByIdAndDelete(id);
    return !!result;
  }

  async exists(id) {
    try {
      const count = await QuizModel.countDocuments({ _id: id });
      return count > 0;
    } catch {
      return false;
    }
  }

  async getAll() {
    const docs = await QuizModel.find().sort({ createdAt: -1 });
    return docs.map(doc => this._toDomain(doc));
  }

  async incrementPlayCount(id) {
    await QuizModel.findByIdAndUpdate(id, { $inc: { playCount: 1 } });
  }
}

const mongoQuizRepository = new MongoQuizRepository();

module.exports = { MongoQuizRepository, mongoQuizRepository };
