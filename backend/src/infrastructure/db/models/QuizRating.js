const mongoose = require('mongoose');

const quizRatingSchema = new mongoose.Schema({
  quiz: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  rating: { type: Number, required: true, min: 1, max: 5 }
}, { timestamps: true });

// One rating per user per quiz
quizRatingSchema.index({ quiz: 1, user: 1 }, { unique: true });
quizRatingSchema.index({ quiz: 1 });

const QuizRating = mongoose.model('QuizRating', quizRatingSchema);
module.exports = { QuizRating };
