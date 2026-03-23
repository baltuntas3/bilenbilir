const { Quiz } = require('../Quiz');
const { Question } = require('../Question');

function createQuestion(id = 'q1') {
  return new Question({ id, text: 'Test?', options: ['A', 'B', 'C', 'D'], correctAnswerIndex: 0, timeLimit: 30, points: 1000 });
}

describe('Quiz edge cases', () => {
  describe('constructor validation', () => {
    it('should throw for missing id', () => {
      expect(() => new Quiz({ title: 'Test', createdBy: 'u1' })).toThrow('Quiz id is required');
    });

    it('should throw for missing title', () => {
      expect(() => new Quiz({ id: 'q1', createdBy: 'u1' })).toThrow('Quiz title is required');
    });

    it('should throw for empty title', () => {
      expect(() => new Quiz({ id: 'q1', title: '', createdBy: 'u1' })).toThrow('Quiz title is required');
    });

    it('should throw for whitespace-only title', () => {
      expect(() => new Quiz({ id: 'q1', title: '   ', createdBy: 'u1' })).toThrow('Quiz title is required');
    });

    it('should throw for missing createdBy', () => {
      expect(() => new Quiz({ id: 'q1', title: 'Test' })).toThrow('Quiz createdBy is required');
    });

    it('should handle non-array questions as empty array', () => {
      const q = new Quiz({ id: 'q1', title: 'Test', createdBy: 'u1', questions: 'invalid' });
      expect(q.questions).toEqual([]);
    });

    it('should throw for null question in array', () => {
      expect(() => new Quiz({ id: 'q1', title: 'Test', createdBy: 'u1', questions: [null] }))
        .toThrow('Question at index 0 is null');
    });

    it('should throw for undefined question in array', () => {
      expect(() => new Quiz({ id: 'q1', title: 'Test', createdBy: 'u1', questions: [undefined] }))
        .toThrow('Question at index 0 is null');
    });

    it('should throw for too many questions', () => {
      const questions = Array.from({ length: 51 }, (_, i) => createQuestion(`q${i}`));
      expect(() => new Quiz({ id: 'q1', title: 'Test', createdBy: 'u1', questions }))
        .toThrow('cannot have more than 50 questions');
    });

    it('should default invalid category to Diğer', () => {
      const q = new Quiz({ id: 'q1', title: 'Test', createdBy: 'u1', category: 'Invalid' });
      expect(q.category).toBe('Diğer');
    });

    it('should clean and validate tags', () => {
      const q = new Quiz({ id: 'q1', title: 'Test', createdBy: 'u1', tags: ['  VALID  ', 'x', 'ok tag'] });
      expect(q.tags).toContain('valid');
      expect(q.tags).toContain('ok tag');
      // 'x' is too short (< 2 chars)
      expect(q.tags).not.toContain('x');
    });
  });

  describe('updateTitle', () => {
    it('should update title', () => {
      const q = new Quiz({ id: 'q1', title: 'Old', createdBy: 'u1' });
      q.updateTitle('New');
      expect(q.title).toBe('New');
    });

    it('should throw for empty title', () => {
      const q = new Quiz({ id: 'q1', title: 'Old', createdBy: 'u1' });
      expect(() => q.updateTitle('')).toThrow('title is required');
    });
  });

  describe('updateDescription', () => {
    it('should update description', () => {
      const q = new Quiz({ id: 'q1', title: 'Test', createdBy: 'u1' });
      q.updateDescription('New desc');
      expect(q.description).toBe('New desc');
    });
  });

  describe('generateSlug', () => {
    it('should generate slug from title', () => {
      const slug = Quiz.generateSlug('Hello World');
      expect(slug).toMatch(/^hello-world-[a-z0-9]{4}$/);
    });

    it('should handle Turkish characters', () => {
      const slug = Quiz.generateSlug('Türkçe Öğrenelim');
      expect(slug).toContain('turkce');
    });

    it('should throw for null title', () => {
      expect(() => Quiz.generateSlug(null)).toThrow('Title is required');
    });

    it('should throw for non-string title', () => {
      expect(() => Quiz.generateSlug(123)).toThrow('Title is required');
    });
  });

  describe('updateCategory', () => {
    it('should update valid category', () => {
      const q = new Quiz({ id: 'q1', title: 'Test', createdBy: 'u1' });
      q.updateCategory('Bilim');
      expect(q.category).toBe('Bilim');
    });

    it('should throw for invalid category', () => {
      const q = new Quiz({ id: 'q1', title: 'Test', createdBy: 'u1' });
      expect(() => q.updateCategory('Invalid')).toThrow('Invalid category');
    });
  });

  describe('tag management', () => {
    let quiz;
    beforeEach(() => {
      quiz = new Quiz({ id: 'q1', title: 'Test', createdBy: 'u1' });
    });

    it('addTag should add valid tag', () => {
      quiz.addTag('science');
      expect(quiz.tags).toContain('science');
    });

    it('addTag should throw for non-string', () => {
      expect(() => quiz.addTag(123)).toThrow('Tag must be a string');
    });

    it('addTag should throw for too short tag', () => {
      expect(() => quiz.addTag('x')).toThrow('must be between');
    });

    it('addTag should throw for too long tag', () => {
      expect(() => quiz.addTag('A'.repeat(31))).toThrow('must be between');
    });

    it('addTag should throw for invalid characters', () => {
      expect(() => quiz.addTag('tag@!')).toThrow('only contain letters');
    });

    it('addTag should throw when max tags reached', () => {
      for (let i = 0; i < 20; i++) quiz.addTag(`tag${i}aa`);
      expect(() => quiz.addTag('onemore')).toThrow('more than 20 tags');
    });

    it('addTag should not add duplicate', () => {
      quiz.addTag('science');
      quiz.addTag('science');
      expect(quiz.tags.filter(t => t === 'science')).toHaveLength(1);
    });

    it('removeTag should remove tag', () => {
      quiz.addTag('science');
      quiz.removeTag('science');
      expect(quiz.tags).not.toContain('science');
    });

    it('setTags should replace all tags', () => {
      quiz.addTag('old');
      quiz.setTags(['new tag', 'another']);
      expect(quiz.tags).toContain('new tag');
      expect(quiz.tags).not.toContain('old');
    });

    it('setTags should throw for non-array', () => {
      expect(() => quiz.setTags('invalid')).toThrow('Tags must be an array');
    });
  });

  describe('addQuestion', () => {
    it('should throw when max reached', () => {
      const quiz = new Quiz({ id: 'q1', title: 'Test', createdBy: 'u1' });
      for (let i = 0; i < 50; i++) quiz.addQuestion(createQuestion(`q${i}`));
      expect(() => quiz.addQuestion(createQuestion('extra'))).toThrow('more than 50 questions');
    });
  });

  describe('getQuestionOrThrow', () => {
    it('should throw for invalid index', () => {
      const quiz = new Quiz({ id: 'q1', title: 'Test', createdBy: 'u1' });
      expect(() => quiz.getQuestionOrThrow(0)).toThrow('not found');
    });
  });

  describe('reorderQuestions', () => {
    it('should throw for non-array', () => {
      const quiz = new Quiz({ id: 'q1', title: 'Test', createdBy: 'u1', questions: [createQuestion('q1')] });
      expect(() => quiz.reorderQuestions('invalid')).toThrow('must be an array');
    });

    it('should throw for wrong length', () => {
      const quiz = new Quiz({ id: 'q1', title: 'Test', createdBy: 'u1', questions: [createQuestion('q1')] });
      expect(() => quiz.reorderQuestions(['q1', 'q2'])).toThrow('must match');
    });

    it('should throw for duplicate IDs', () => {
      const quiz = new Quiz({ id: 'q1', title: 'Test', createdBy: 'u1', questions: [createQuestion('q1'), createQuestion('q2')] });
      expect(() => quiz.reorderQuestions(['q1', 'q1'])).toThrow('Duplicate');
    });

    it('should throw for invalid question IDs', () => {
      const quiz = new Quiz({ id: 'q1', title: 'Test', createdBy: 'u1', questions: [createQuestion('q1'), createQuestion('q2')] });
      expect(() => quiz.reorderQuestions(['q1', 'q99'])).toThrow('Invalid question IDs');
    });
  });

  describe('getRandomSubset', () => {
    it('should return subset of questions', () => {
      const quiz = new Quiz({ id: 'q1', title: 'Test', createdBy: 'u1' });
      for (let i = 0; i < 10; i++) quiz.addQuestion(createQuestion(`q${i}`));
      const subset = quiz.getRandomSubset(3);
      expect(subset.questions).toHaveLength(3);
      expect(Object.isFrozen(subset)).toBe(true);
    });

    it('should return all when count >= total', () => {
      const quiz = new Quiz({ id: 'q1', title: 'Test', createdBy: 'u1' });
      quiz.addQuestion(createQuestion('q1'));
      quiz.addQuestion(createQuestion('q2'));
      const subset = quiz.getRandomSubset(5);
      expect(subset.questions).toHaveLength(2);
    });

    it('should throw for non-positive count', () => {
      const quiz = new Quiz({ id: 'q1', title: 'Test', createdBy: 'u1' });
      expect(() => quiz.getRandomSubset(0)).toThrow('positive integer');
      expect(() => quiz.getRandomSubset(-1)).toThrow('positive integer');
      expect(() => quiz.getRandomSubset(1.5)).toThrow('positive integer');
    });
  });

  describe('clone', () => {
    it('should create deep frozen clone', () => {
      const quiz = new Quiz({ id: 'q1', title: 'Test', createdBy: 'u1', tags: ['tag'] });
      quiz.addQuestion(createQuestion('q1'));
      const clone = quiz.clone();
      expect(Object.isFrozen(clone)).toBe(true);
      expect(Object.isFrozen(clone.questions)).toBe(true);
      expect(clone.title).toBe('Test');
    });

    it('should clone Date objects', () => {
      const date = new Date('2024-01-01');
      const quiz = new Quiz({ id: 'q1', title: 'Test', createdBy: 'u1', createdAt: date });
      quiz.addQuestion(createQuestion('q1'));
      const clone = quiz.clone();
      expect(clone.createdAt.getTime()).toBe(date.getTime());
    });

    it('should handle non-Date createdAt', () => {
      const quiz = new Quiz({ id: 'q1', title: 'Test', createdBy: 'u1', createdAt: 'not-a-date' });
      quiz.addQuestion(createQuestion('q1'));
      const clone = quiz.clone();
      expect(clone.createdAt).toBe('not-a-date');
    });
  });
});
