const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  text: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['MULTIPLE_CHOICE', 'TRUE_FALSE'],
    default: 'MULTIPLE_CHOICE'
  },
  options: {
    type: [String],
    required: true,
    validate: {
      validator: function(v) {
        return v.length >= 2 && v.length <= 6;
      },
      message: 'Options must have 2-6 items'
    }
  },
  correctAnswerIndex: {
    type: Number,
    required: true,
    min: 0
  },
  timeLimit: {
    type: Number,
    default: 30,
    min: 5,
    max: 120
  },
  points: {
    type: Number,
    default: 1000
  },
  imageUrl: {
    type: String,
    default: null
  },
  explanation: {
    type: String,
    maxlength: 500,
    default: ''
  }
}, { _id: true });

const QUIZ_CATEGORIES = [
  'Genel Kültür',
  'Bilim',
  'Tarih',
  'Coğrafya',
  'Spor',
  'Sanat',
  'Teknoloji',
  'Eğlence',
  'Müzik',
  'Film & TV',
  'Edebiyat',
  'Diğer'
];

const quizSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  slug: {
    type: String,
    unique: true,
    sparse: true
  },
  description: {
    type: String,
    default: '',
    maxlength: 500
  },
  category: {
    type: String,
    enum: QUIZ_CATEGORIES,
    default: 'Diğer'
  },
  tags: {
    type: [String],
    default: [],
    validate: {
      validator: function(v) {
        return v.length <= 5;
      },
      message: 'Quiz cannot have more than 5 tags'
    }
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  questions: {
    type: [questionSchema],
    default: [],
    validate: {
      validator: function(v) {
        return v.length <= 50;
      },
      message: 'Quiz cannot have more than 50 questions'
    }
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  playCount: {
    type: Number,
    default: 0
  },
  averageRating: {
    type: Number,
    default: 0
  },
  ratingCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Indexes
quizSchema.index({ createdBy: 1 });
quizSchema.index({ isPublic: 1 });
quizSchema.index({ createdAt: -1 });
quizSchema.index({ category: 1 });
quizSchema.index({ tags: 1 });

// Virtual for question count
quizSchema.virtual('questionCount').get(function() {
  return this.questions.length;
});

// Ensure virtuals are included in JSON
quizSchema.set('toJSON', { virtuals: true });
quizSchema.set('toObject', { virtuals: true });

const Quiz = mongoose.model('Quiz', quizSchema);

module.exports = { Quiz, quizSchema, questionSchema, QUIZ_CATEGORIES };
