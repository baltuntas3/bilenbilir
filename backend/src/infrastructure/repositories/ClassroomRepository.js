const { Classroom } = require('../db/models/Classroom');
const crypto = require('crypto');

class ClassroomRepository {
  async create(data) {
    const joinCode = crypto.randomBytes(4).toString('hex').toUpperCase();
    const doc = new Classroom({ ...data, joinCode });
    await doc.save();
    return doc;
  }

  async findById(id) {
    return Classroom.findById(id).populate('teacher', 'username email').populate('assignedQuizzes.quiz', 'title description');
  }

  async findByTeacher(teacherId) {
    return Classroom.find({ teacher: teacherId, isActive: true })
      .populate('assignedQuizzes.quiz', 'title')
      .sort({ createdAt: -1 });
  }

  async findByJoinCode(joinCode) {
    return Classroom.findOne({ joinCode, isActive: true });
  }

  async update(id, data) {
    return Classroom.findByIdAndUpdate(id, data, { new: true })
      .populate('teacher', 'username email')
      .populate('assignedQuizzes.quiz', 'title description');
  }

  async addStudent(classroomId, nickname) {
    return Classroom.findByIdAndUpdate(
      classroomId,
      { $addToSet: { students: { nickname } } },
      { new: true }
    );
  }

  async removeStudent(classroomId, nickname) {
    return Classroom.findByIdAndUpdate(
      classroomId,
      { $pull: { students: { nickname } } },
      { new: true }
    );
  }

  async assignQuiz(classroomId, quizId, dueDate = null) {
    return Classroom.findByIdAndUpdate(
      classroomId,
      { $push: { assignedQuizzes: { quiz: quizId, dueDate } } },
      { new: true }
    ).populate('assignedQuizzes.quiz', 'title description');
  }

  async removeQuizAssignment(classroomId, assignmentIndex) {
    const classroom = await Classroom.findById(classroomId);
    if (!classroom || assignmentIndex < 0 || assignmentIndex >= classroom.assignedQuizzes.length) {
      return null;
    }
    classroom.assignedQuizzes.splice(assignmentIndex, 1);
    await classroom.save();
    return classroom;
  }

  async markQuizCompleted(classroomId, quizId, nickname) {
    return Classroom.findOneAndUpdate(
      { _id: classroomId, 'assignedQuizzes.quiz': quizId },
      { $addToSet: { 'assignedQuizzes.$.completedBy': nickname } },
      { new: true }
    );
  }

  async delete(id) {
    return Classroom.findByIdAndUpdate(id, { isActive: false }, { new: true });
  }
}

const classroomRepository = new ClassroomRepository();

module.exports = { ClassroomRepository, classroomRepository };
