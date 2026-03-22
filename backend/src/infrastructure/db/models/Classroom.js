const mongoose = require('mongoose');

const classroomSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, default: '', maxlength: 500 },
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  students: [{
    nickname: { type: String, required: true },
    joinedAt: { type: Date, default: Date.now }
  }],
  assignedQuizzes: [{
    quiz: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz' },
    assignedAt: { type: Date, default: Date.now },
    dueDate: { type: Date, default: null },
    completedBy: [{ type: String }] // nicknames who completed
  }],
  joinCode: { type: String, unique: true, sparse: true },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

classroomSchema.index({ teacher: 1, isActive: 1 });

const Classroom = mongoose.model('Classroom', classroomSchema);

module.exports = { Classroom, classroomSchema };
