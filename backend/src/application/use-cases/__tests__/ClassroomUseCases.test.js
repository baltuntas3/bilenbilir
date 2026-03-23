const { ClassroomUseCases } = require('../ClassroomUseCases');

function createMockRepo() {
  return {
    create: jest.fn(),
    findByTeacher: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    findByJoinCode: jest.fn(),
    addStudent: jest.fn(),
    removeStudent: jest.fn(),
    assignQuiz: jest.fn(),
    removeQuizAssignment: jest.fn(),
    delete: jest.fn()
  };
}

describe('ClassroomUseCases', () => {
  let uc, repo;

  beforeEach(() => {
    repo = createMockRepo();
    uc = new ClassroomUseCases(repo);
  });

  describe('_assertTeacher', () => {
    it('should pass for matching teacher (string)', () => {
      expect(() => uc._assertTeacher({ teacher: 'user1' }, 'user1')).not.toThrow();
    });

    it('should pass for matching teacher (ObjectId)', () => {
      expect(() => uc._assertTeacher({ teacher: { _id: { toString: () => 'user1' } } }, 'user1')).not.toThrow();
    });

    it('should throw for non-matching teacher', () => {
      expect(() => uc._assertTeacher({ teacher: 'user1' }, 'user2')).toThrow('Yetkisiz');
    });
  });

  describe('create', () => {
    it('should create classroom', async () => {
      repo.create.mockResolvedValue({ name: 'Math' });
      const result = await uc.create({ name: 'Math', description: 'Desc', teacherId: 't1' });
      expect(repo.create).toHaveBeenCalledWith({ name: 'Math', description: 'Desc', teacher: 't1' });
    });

    it('should throw for empty name', async () => {
      await expect(uc.create({ name: '', teacherId: 't1' })).rejects.toThrow('Sınıf adı gerekli');
    });

    it('should default description to empty', async () => {
      repo.create.mockResolvedValue({});
      await uc.create({ name: 'Test', teacherId: 't1' });
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ description: '' }));
    });
  });

  describe('getMyClassrooms', () => {
    it('should return classrooms', async () => {
      repo.findByTeacher.mockResolvedValue([{ name: 'Math' }]);
      const result = await uc.getMyClassrooms('t1');
      expect(result).toHaveLength(1);
    });
  });

  describe('getById', () => {
    it('should return classroom', async () => {
      repo.findById.mockResolvedValue({ teacher: 't1' });
      const result = await uc.getById('c1', 't1');
      expect(result).toBeDefined();
    });

    it('should throw if not found', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(uc.getById('c1', 't1')).rejects.toThrow('bulunamadı');
    });

    it('should throw if not teacher', async () => {
      repo.findById.mockResolvedValue({ teacher: 't1' });
      await expect(uc.getById('c1', 't2')).rejects.toThrow('Yetkisiz');
    });
  });

  describe('update', () => {
    it('should update classroom', async () => {
      repo.findById.mockResolvedValue({ teacher: 't1' });
      repo.update.mockResolvedValue({});
      await uc.update('c1', 't1', { name: 'New Name', description: 'New Desc' });
      expect(repo.update).toHaveBeenCalled();
    });

    it('should throw if not found', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(uc.update('c1', 't1', {})).rejects.toThrow('bulunamadı');
    });

    it('should handle partial update', async () => {
      repo.findById.mockResolvedValue({ teacher: 't1' });
      repo.update.mockResolvedValue({});
      await uc.update('c1', 't1', { description: undefined });
      expect(repo.update).toHaveBeenCalledWith('c1', {});
    });
  });

  describe('joinByCode', () => {
    it('should join classroom', async () => {
      repo.findByJoinCode.mockResolvedValue({ _id: 'c1', name: 'Math', students: [] });
      const result = await uc.joinByCode('ABC123', 'student1');
      expect(result.classroomName).toBe('Math');
    });

    it('should throw for missing fields', async () => {
      await expect(uc.joinByCode('', '')).rejects.toThrow('gerekli');
    });

    it('should throw if classroom not found', async () => {
      repo.findByJoinCode.mockResolvedValue(null);
      await expect(uc.joinByCode('ABC', 'nick')).rejects.toThrow('bulunamadı');
    });

    it('should throw for duplicate nickname', async () => {
      repo.findByJoinCode.mockResolvedValue({ _id: 'c1', name: 'Math', students: [{ nickname: 'Nick' }] });
      await expect(uc.joinByCode('ABC', 'nick')).rejects.toThrow('zaten kullanılıyor');
    });
  });

  describe('removeStudent', () => {
    it('should remove student', async () => {
      repo.findById.mockResolvedValue({ teacher: 't1' });
      const result = await uc.removeStudent('c1', 'nick', 't1');
      expect(result.message).toContain('çıkarıldı');
    });
  });

  describe('assignQuiz', () => {
    it('should assign quiz', async () => {
      repo.findById.mockResolvedValue({ teacher: 't1' });
      repo.assignQuiz.mockResolvedValue({});
      await uc.assignQuiz('c1', 'q1', null, 't1');
      expect(repo.assignQuiz).toHaveBeenCalledWith('c1', 'q1', null);
    });

    it('should throw for missing quizId', async () => {
      await expect(uc.assignQuiz('c1', '', null, 't1')).rejects.toThrow('Quiz ID gerekli');
    });
  });

  describe('removeAssignment', () => {
    it('should remove assignment', async () => {
      repo.findById.mockResolvedValue({ teacher: 't1' });
      repo.removeQuizAssignment.mockResolvedValue({ updated: true });
      const result = await uc.removeAssignment('c1', 0, 't1');
      expect(result).toBeDefined();
    });

    it('should throw for invalid index', async () => {
      repo.findById.mockResolvedValue({ teacher: 't1' });
      repo.removeQuizAssignment.mockResolvedValue(null);
      await expect(uc.removeAssignment('c1', 99, 't1')).rejects.toThrow('Geçersiz ödev');
    });
  });

  describe('delete', () => {
    it('should delete classroom', async () => {
      repo.findById.mockResolvedValue({ teacher: 't1' });
      repo.delete.mockResolvedValue(true);
      await uc.delete('c1', 't1');
      expect(repo.delete).toHaveBeenCalledWith('c1');
    });
  });
});
