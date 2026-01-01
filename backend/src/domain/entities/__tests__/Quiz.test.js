const { Quiz } = require('../Quiz');

describe('Quiz', () => {
  let quiz;

  const mockQuestion1 = { id: 'q1', text: 'Question 1' };
  const mockQuestion2 = { id: 'q2', text: 'Question 2' };
  const mockQuestion3 = { id: 'q3', text: 'Question 3' };

  beforeEach(() => {
    quiz = new Quiz({
      id: 'quiz-1',
      title: 'Test Quiz',
      description: 'A test quiz',
      createdBy: 'user-1'
    });
  });

  describe('constructor', () => {
    it('should create quiz with default values', () => {
      expect(quiz.id).toBe('quiz-1');
      expect(quiz.title).toBe('Test Quiz');
      expect(quiz.description).toBe('A test quiz');
      expect(quiz.createdBy).toBe('user-1');
      expect(quiz.questions).toEqual([]);
      expect(quiz.isPublic).toBe(false);
    });

    it('should create quiz with provided questions', () => {
      const quizWithQuestions = new Quiz({
        id: 'quiz-2',
        title: 'Quiz with Questions',
        createdBy: 'user-1',
        questions: [mockQuestion1, mockQuestion2]
      });

      expect(quizWithQuestions.questions).toHaveLength(2);
    });
  });

  describe('addQuestion', () => {
    it('should add question to quiz', () => {
      quiz.addQuestion(mockQuestion1);

      expect(quiz.questions).toHaveLength(1);
      expect(quiz.questions[0]).toBe(mockQuestion1);
    });
  });

  describe('removeQuestion', () => {
    it('should remove question by id', () => {
      quiz.addQuestion(mockQuestion1);
      quiz.addQuestion(mockQuestion2);

      quiz.removeQuestion('q1');

      expect(quiz.questions).toHaveLength(1);
      expect(quiz.questions[0].id).toBe('q2');
    });

    it('should do nothing if question not found', () => {
      quiz.addQuestion(mockQuestion1);

      quiz.removeQuestion('non-existent');

      expect(quiz.questions).toHaveLength(1);
    });
  });

  describe('getQuestion', () => {
    beforeEach(() => {
      quiz.addQuestion(mockQuestion1);
      quiz.addQuestion(mockQuestion2);
      quiz.addQuestion(mockQuestion3);
    });

    it('should return question by index', () => {
      expect(quiz.getQuestion(0)).toBe(mockQuestion1);
      expect(quiz.getQuestion(1)).toBe(mockQuestion2);
      expect(quiz.getQuestion(2)).toBe(mockQuestion3);
    });

    it('should return null for negative index', () => {
      expect(quiz.getQuestion(-1)).toBeNull();
    });

    it('should return null for out of bounds index', () => {
      expect(quiz.getQuestion(5)).toBeNull();
    });
  });

  describe('getTotalQuestions', () => {
    it('should return 0 for empty quiz', () => {
      expect(quiz.getTotalQuestions()).toBe(0);
    });

    it('should return correct count', () => {
      quiz.addQuestion(mockQuestion1);
      quiz.addQuestion(mockQuestion2);

      expect(quiz.getTotalQuestions()).toBe(2);
    });
  });

  describe('reorderQuestions', () => {
    beforeEach(() => {
      quiz.addQuestion(mockQuestion1);
      quiz.addQuestion(mockQuestion2);
      quiz.addQuestion(mockQuestion3);
    });

    it('should reorder questions', () => {
      quiz.reorderQuestions(['q3', 'q1', 'q2']);

      expect(quiz.questions[0].id).toBe('q3');
      expect(quiz.questions[1].id).toBe('q1');
      expect(quiz.questions[2].id).toBe('q2');
    });

    it('should throw error for invalid order', () => {
      expect(() => quiz.reorderQuestions(['q1', 'q2', 'invalid']))
        .toThrow('Invalid question IDs in order');
    });
  });
});
