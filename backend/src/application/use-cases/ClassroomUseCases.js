const { NotFoundError, ForbiddenError, ValidationError } = require('../../shared/errors');

class ClassroomUseCases {
  constructor(classroomRepository) {
    this.classroomRepository = classroomRepository;
  }

  _assertTeacher(classroom, requesterId) {
    const teacherId = classroom.teacher._id
      ? classroom.teacher._id.toString()
      : classroom.teacher.toString();
    if (teacherId !== requesterId) {
      throw new ForbiddenError('Yetkisiz erişim');
    }
  }

  async create({ name, description, teacherId }) {
    if (!name || name.trim().length === 0) {
      throw new ValidationError('Sınıf adı gerekli');
    }
    return this.classroomRepository.create({
      name: name.trim(),
      description: description || '',
      teacher: teacherId
    });
  }

  async getMyClassrooms(teacherId) {
    return this.classroomRepository.findByTeacher(teacherId);
  }

  async getById(id, requesterId) {
    const classroom = await this.classroomRepository.findById(id);
    if (!classroom) throw new NotFoundError('Sınıf bulunamadı');
    this._assertTeacher(classroom, requesterId);
    return classroom;
  }

  async update(id, requesterId, { name, description }) {
    const classroom = await this.classroomRepository.findById(id);
    if (!classroom) throw new NotFoundError('Sınıf bulunamadı');
    this._assertTeacher(classroom, requesterId);

    const updateData = {};
    if (name) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description;

    return this.classroomRepository.update(id, updateData);
  }

  async joinByCode(joinCode, nickname) {
    if (!joinCode || !nickname) {
      throw new ValidationError('Katılım kodu ve takma ad gerekli');
    }
    const classroom = await this.classroomRepository.findByJoinCode(joinCode.toUpperCase());
    if (!classroom) throw new NotFoundError('Sınıf bulunamadı');

    const existing = classroom.students.find(
      s => s.nickname.toLowerCase() === nickname.toLowerCase()
    );
    if (existing) throw new ValidationError('Bu takma ad zaten kullanılıyor');

    await this.classroomRepository.addStudent(classroom._id, nickname);
    return { message: 'Sınıfa katıldınız', classroomName: classroom.name };
  }

  async removeStudent(id, nickname, requesterId) {
    const classroom = await this.classroomRepository.findById(id);
    if (!classroom) throw new NotFoundError('Sınıf bulunamadı');
    this._assertTeacher(classroom, requesterId);
    await this.classroomRepository.removeStudent(id, nickname);
    return { message: 'Öğrenci çıkarıldı' };
  }

  async assignQuiz(id, quizId, dueDate, requesterId) {
    if (!quizId) throw new ValidationError('Quiz ID gerekli');
    const classroom = await this.classroomRepository.findById(id);
    if (!classroom) throw new NotFoundError('Sınıf bulunamadı');
    this._assertTeacher(classroom, requesterId);
    return this.classroomRepository.assignQuiz(id, quizId, dueDate || null);
  }

  async removeAssignment(id, assignmentIndex, requesterId) {
    const classroom = await this.classroomRepository.findById(id);
    if (!classroom) throw new NotFoundError('Sınıf bulunamadı');
    this._assertTeacher(classroom, requesterId);
    const updated = await this.classroomRepository.removeQuizAssignment(id, assignmentIndex);
    if (!updated) throw new ValidationError('Geçersiz ödev index');
    return updated;
  }

  async delete(id, requesterId) {
    const classroom = await this.classroomRepository.findById(id);
    if (!classroom) throw new NotFoundError('Sınıf bulunamadı');
    this._assertTeacher(classroom, requesterId);
    return this.classroomRepository.delete(id);
  }
}

module.exports = { ClassroomUseCases };
