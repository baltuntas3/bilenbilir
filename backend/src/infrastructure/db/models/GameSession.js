const mongoose = require('mongoose');

const playerResultSchema = new mongoose.Schema({
  nickname: {
    type: String,
    required: true
  },
  rank: {
    type: Number,
    required: true
  },
  score: {
    type: Number,
    default: 0
  },
  correctAnswers: {
    type: Number,
    default: 0
  },
  wrongAnswers: {
    type: Number,
    default: 0
  },
  averageResponseTime: {
    type: Number,
    default: 0
  },
  longestStreak: {
    type: Number,
    default: 0
  }
}, { _id: false });

const answerRecordSchema = new mongoose.Schema({
  nickname: {
    type: String,
    required: true
  },
  questionIndex: {
    type: Number,
    required: true
  },
  answerIndex: {
    type: Number,
    required: true
  },
  isCorrect: {
    type: Boolean,
    required: true
  },
  responseTimeMs: {
    type: Number,
    required: true
  },
  score: {
    type: Number,
    default: 0
  },
  streak: {
    type: Number,
    default: 0
  }
}, { _id: false });

const gameSessionSchema = new mongoose.Schema({
  pin: {
    type: String,
    required: true,
    minlength: 6,
    maxlength: 6,
    validate: {
      validator: function(v) {
        return /^\d{6}$/.test(v);
      },
      message: 'PIN must be exactly 6 digits'
    }
  },
  quiz: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Quiz',
    required: true
  },
  host: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  playerCount: {
    type: Number,
    default: 0
  },
  playerResults: {
    type: [playerResultSchema],
    default: []
  },
  answers: {
    type: [answerRecordSchema],
    default: []
  },
  startedAt: {
    type: Date,
    required: true
  },
  endedAt: {
    type: Date,
    required: true
  },
  durationSeconds: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: [
      'completed',   // Game finished normally
      'cancelled',   // Host cancelled the game
      'abandoned',   // All players left / host disconnected timeout
      'error',       // Game ended due to an error
      'interrupted'  // Server restart or unexpected termination
    ],
    default: 'completed'
  }
}, {
  timestamps: true
});

// Indexes
gameSessionSchema.index({ host: 1 });
gameSessionSchema.index({ quiz: 1 });
gameSessionSchema.index({ createdAt: -1 });
gameSessionSchema.index({ pin: 1 });

// Pre-save middleware to calculate duration
gameSessionSchema.pre('save', function(next) {
  if (this.startedAt && this.endedAt) {
    this.durationSeconds = Math.floor((this.endedAt - this.startedAt) / 1000);
  }
  next();
});

const GameSession = mongoose.model('GameSession', gameSessionSchema);

module.exports = { GameSession, gameSessionSchema };
