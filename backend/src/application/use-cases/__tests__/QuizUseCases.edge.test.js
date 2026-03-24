const { QuizUseCases } = require('../QuizUseCases');

function createMocks() {
  return {
    quizRepo: {
      findById: jest.fn(),
      findBySlug: jest.fn(),
      findByCreator: jest.fn(),
      findPublic: jest.fn(),
      save: jest.fn(q => q),
      delete: jest.fn(),
      deleteByCreator: jest.fn(),
      getAll: jest.fn(),
      getPopularTags: jest.fn(),
      searchPublic: jest.fn(),
      incrementPlayCount: jest.fn()
    },
    roomRepo: { getAll: jest.fn() },
    sessionRepo: { deleteByQuiz: jest.fn() },
    ratingRepo: {
      rate: jest.fn(),
      getAverageRating: jest.fn(),
      getUserRating: jest.fn()
    }
  };
}

describe('QuizUseCases edge cases', () => {
  let uc, mocks;

  beforeEach(() => {
    mocks = createMocks();
    uc = new QuizUseCases(mocks.quizRepo, mocks.roomRepo, mocks.sessionRepo, mocks.ratingRepo);
  });

  describe('createQuiz slug collision', () => {
    it('should retry on duplicate slug', async () => {
      let callCount = 0;
      mocks.quizRepo.save.mockImplementation((q) => {
        callCount++;
        if (callCount === 1) {
          const err = new Error('duplicate key');
          err.code = 11000;
          throw err;
        }
        return q;
      });
      const result = await uc.createQuiz({ title: 'Test', createdBy: 'u1' });
      expect(result.quiz).toBeDefined();
      expect(callCount).toBe(2);
    });

    it('should rethrow non-duplicate errors', async () => {
      mocks.quizRepo.save.mockRejectedValue(new Error('DB error'));
      await expect(uc.createQuiz({ title: 'Test', createdBy: 'u1' })).rejects.toThrow('DB error');
    });
  });

  describe('getQuiz', () => {
    it('should throw for private quiz not owned', async () => {
      mocks.quizRepo.findById.mockResolvedValue({ id: 'q1', isPublic: false, createdBy: 'other' });
      await expect(uc.getQuiz({ quizId: 'q1', requesterId: 'u1' })).rejects.toThrow('Not authorized');
    });

    it('should sanitize quiz for non-owner', async () => {
      mocks.quizRepo.findById.mockResolvedValue({
        id: 'q1', isPublic: true, createdBy: 'other',
        questions: [{ id: 'q1', text: 'Q?', type: 'MC', options: ['A', 'B'], correctAnswerIndex: 0, timeLimit: 30, points: 1000, imageUrl: null, explanation: '' }]
      });
      const result = await uc.getQuiz({ quizId: 'q1', requesterId: 'u1' });
      expect(result.quiz.questions[0].correctAnswerIndex).toBeUndefined();
    });

    it('should return full quiz for owner', async () => {
      mocks.quizRepo.findById.mockResolvedValue({ id: 'q1', isPublic: false, createdBy: 'u1', questions: [] });
      const result = await uc.getQuiz({ quizId: 'q1', requesterId: 'u1' });
      expect(result.quiz.id).toBe('q1');
    });
  });

  describe('getQuizBySlug', () => {
    it('should throw for missing slug', async () => {
      await expect(uc.getQuizBySlug({ slug: '' })).rejects.toThrow('Slug is required');
    });

    it('should throw for non-string slug', async () => {
      await expect(uc.getQuizBySlug({ slug: 123 })).rejects.toThrow('Slug is required');
    });
  });

  describe('updateQuestion', () => {
    it('should throw for non-existent question', async () => {
      mocks.quizRepo.findById.mockResolvedValue({
        id: 'q1', createdBy: 'u1',
        questions: [{ id: 'existing', text: 'Q?', options: ['A', 'B'], correctAnswerIndex: 0, timeLimit: 30, points: 1000 }]
      });
      await expect(uc.updateQuestion({ quizId: 'q1', questionId: 'nonexistent', questionData: {}, requesterId: 'u1' }))
        .rejects.toThrow('Question not found');
    });
  });

  describe('getQuestions', () => {
    it('should return questions for owner', async () => {
      mocks.quizRepo.findById.mockResolvedValue({ id: 'q1', createdBy: 'u1', questions: [{ id: 'q1' }] });
      const result = await uc.getQuestions({ quizId: 'q1', requesterId: 'u1' });
      expect(result.questions).toHaveLength(1);
    });
  });

  describe('deleteQuiz with active game', () => {
    it('should throw when quiz in active game', async () => {
      mocks.quizRepo.findById.mockResolvedValue({ id: 'q1', createdBy: 'u1' });
      mocks.roomRepo.getAll.mockResolvedValue([{ quizId: 'q1' }]);
      await expect(uc.deleteQuiz({ quizId: 'q1', requesterId: 'u1' })).rejects.toThrow('active game');
    });
  });

  describe('exportQuiz', () => {
    it('should export public quiz', async () => {
      mocks.quizRepo.findById.mockResolvedValue({
        id: 'q1', title: 'Test', description: 'Desc', isPublic: true, createdBy: 'other',
        category: 'Bilim', tags: ['sci'],
        questions: [{ text: 'Q?', type: 'MC', options: ['A', 'B'], correctAnswerIndex: 0, timeLimit: 30, points: 1000, imageUrl: null, explanation: '' }]
      });
      const result = await uc.exportQuiz({ quizId: 'q1', requesterId: 'u1' });
      expect(result.exportData.version).toBe('1.0');
    });

    it('should throw for private quiz not owned', async () => {
      mocks.quizRepo.findById.mockResolvedValue({ id: 'q1', isPublic: false, createdBy: 'other' });
      await expect(uc.exportQuiz({ quizId: 'q1', requesterId: 'u1' })).rejects.toThrow('Not authorized');
    });
  });

  describe('_validateImportData', () => {
    it('should throw for non-object', () => {
      expect(() => uc._validateImportData(null)).toThrow('must be an object');
    });

    it('should throw for missing version', () => {
      expect(() => uc._validateImportData({})).toThrow('missing version');
    });

    it('should throw for missing quiz', () => {
      expect(() => uc._validateImportData({ version: '1.0' })).toThrow('missing quiz');
    });

    it('should throw for missing title', () => {
      expect(() => uc._validateImportData({ version: '1.0', quiz: {} })).toThrow('must have a title');
    });

    it('should throw for non-array questions', () => {
      expect(() => uc._validateImportData({ version: '1.0', quiz: { title: 'T', questions: 'bad' } })).toThrow('must be an array');
    });

    it('should throw for too many questions', () => {
      const questions = Array.from({ length: 51 }, () => ({ text: 'Q', options: ['A', 'B'], correctAnswerIndex: 0 }));
      expect(() => uc._validateImportData({ version: '1.0', quiz: { title: 'T', questions } })).toThrow('maximum 50');
    });

    it('should throw for question missing text', () => {
      expect(() => uc._validateImportData({ version: '1.0', quiz: { title: 'T', questions: [{ options: ['A', 'B'], correctAnswerIndex: 0 }] } })).toThrow('missing text');
    });

    it('should throw for invalid options count', () => {
      expect(() => uc._validateImportData({ version: '1.0', quiz: { title: 'T', questions: [{ text: 'Q', options: ['A'], correctAnswerIndex: 0 }] } })).toThrow('2-6 options');
    });

    it('should throw for empty option', () => {
      expect(() => uc._validateImportData({ version: '1.0', quiz: { title: 'T', questions: [{ text: 'Q', options: ['A', ''], correctAnswerIndex: 0 }] } })).toThrow('non-empty string');
    });

    it('should throw for invalid correctAnswerIndex', () => {
      expect(() => uc._validateImportData({ version: '1.0', quiz: { title: 'T', questions: [{ text: 'Q', options: ['A', 'B'], correctAnswerIndex: 5 }] } })).toThrow('correctAnswerIndex');
    });

    it('should throw for invalid timeLimit', () => {
      expect(() => uc._validateImportData({ version: '1.0', quiz: { title: 'T', questions: [{ text: 'Q', options: ['A', 'B'], correctAnswerIndex: 0, timeLimit: 1 }] } })).toThrow('timeLimit');
    });

    it('should throw for invalid points', () => {
      expect(() => uc._validateImportData({ version: '1.0', quiz: { title: 'T', questions: [{ text: 'Q', options: ['A', 'B'], correctAnswerIndex: 0, points: 1 }] } })).toThrow('points');
    });

    it('should pass for valid data', () => {
      expect(uc._validateImportData({ version: '1.0', quiz: { title: 'T', questions: [{ text: 'Q', options: ['A', 'B'], correctAnswerIndex: 0 }] } })).toBe(true);
    });
  });

  describe('importQuiz', () => {
    it('should import quiz', async () => {
      const jsonData = { version: '1.0', quiz: { title: 'Imported', questions: [{ text: 'Q?', options: ['A', 'B'], correctAnswerIndex: 0 }] } };
      const result = await uc.importQuiz({ jsonData, requesterId: 'u1' });
      expect(result.quiz).toBeDefined();
      expect(result.questionCount).toBe(1);
    });

    it('should retry on slug collision', async () => {
      let callCount = 0;
      mocks.quizRepo.save.mockImplementation((q) => {
        callCount++;
        if (callCount === 1) { const err = new Error('duplicate'); err.code = 11000; throw err; }
        return q;
      });
      const jsonData = { version: '1.0', quiz: { title: 'Imported', questions: [{ text: 'Q?', options: ['A', 'B'], correctAnswerIndex: 0 }] } };
      const result = await uc.importQuiz({ jsonData, requesterId: 'u1' });
      expect(result.quiz).toBeDefined();
    });
  });

  describe('getQuizBySlug', () => {
    it('should return quiz by slug', async () => {
      mocks.quizRepo.findBySlug.mockResolvedValue({ id: 'q1', title: 'Test', isPublic: true });
      const result = await uc.getQuizBySlug({ slug: 'test-slug' });
      expect(result.quiz.id).toBe('q1');
    });

    it('should throw for private quiz by slug', async () => {
      mocks.quizRepo.findBySlug.mockResolvedValue({ id: 'q1', title: 'Test', isPublic: false });
      await expect(uc.getQuizBySlug({ slug: 'test-slug' })).rejects.toThrow('Not authorized');
    });

    it('should throw if quiz not found by slug', async () => {
      mocks.quizRepo.findBySlug.mockResolvedValue(null);
      await expect(uc.getQuizBySlug({ slug: 'nonexistent' })).rejects.toThrow('not found');
    });
  });

  describe('getPopularTags', () => {
    it('should return popular tags', async () => {
      mocks.quizRepo.getPopularTags.mockResolvedValue([{ tag: 'sci', count: 5 }]);
      const result = await uc.getPopularTags(10);
      expect(result).toHaveLength(1);
    });
  });

  describe('searchPublicQuizzes', () => {
    it('should search quizzes', async () => {
      mocks.quizRepo.searchPublic.mockResolvedValue({ quizzes: [], pagination: {} });
      const result = await uc.searchPublicQuizzes('test', { page: 1, limit: 10 });
      expect(result.quizzes).toEqual([]);
    });
  });

  describe('getQuizzesByCreator', () => {
    it('should return creator quizzes', async () => {
      mocks.quizRepo.findByCreator.mockResolvedValue({ quizzes: [], pagination: {} });
      const result = await uc.getQuizzesByCreator({ createdBy: 'u1' });
      expect(result).toBeDefined();
    });
  });

  describe('getPublicQuizzes', () => {
    it('should return public quizzes', async () => {
      mocks.quizRepo.findPublic.mockResolvedValue({ quizzes: [], pagination: {} });
      const result = await uc.getPublicQuizzes({ page: 1, limit: 10 });
      expect(result).toBeDefined();
    });
  });

  describe('rateQuiz', () => {
    it('should rate quiz', async () => {
      mocks.quizRepo.findById.mockResolvedValue({ id: 'q1' });
      mocks.ratingRepo.rate.mockResolvedValue({ rating: 5, isNew: true });
      const result = await uc.rateQuiz({ quizId: 'q1', userId: 'u1', rating: 5 });
      expect(result.isNew).toBe(true);
    });
  });

  describe('getQuizRating', () => {
    it('should return rating with user rating', async () => {
      mocks.ratingRepo.getAverageRating.mockResolvedValue({ average: 4.5, count: 10 });
      mocks.ratingRepo.getUserRating.mockResolvedValue(5);
      const result = await uc.getQuizRating({ quizId: 'q1', userId: 'u1' });
      expect(result.average).toBe(4.5);
      expect(result.userRating).toBe(5);
    });

    it('should return null user rating when no userId', async () => {
      mocks.ratingRepo.getAverageRating.mockResolvedValue({ average: 4.0, count: 5 });
      const result = await uc.getQuizRating({ quizId: 'q1', userId: null });
      expect(result.userRating).toBeNull();
    });
  });
});
