const { Question, QuestionType } = require('../Question');

describe('Question', () => {
  const validQuestionData = {
    id: 'q-1',
    text: 'What is 2 + 2?',
    type: QuestionType.MULTIPLE_CHOICE,
    options: ['3', '4', '5', '6'],
    correctAnswerIndex: 1,
    timeLimit: 30,
    points: 1000
  };

  describe('constructor', () => {
    it('should create question with valid data', () => {
      const question = new Question(validQuestionData);

      expect(question.id).toBe('q-1');
      expect(question.text).toBe('What is 2 + 2?');
      expect(question.options).toHaveLength(4);
      expect(question.correctAnswerIndex).toBe(1);
      expect(question.timeLimit).toBe(30);
      expect(question.points).toBe(1000);
    });

    it('should throw error for empty text', () => {
      expect(() => new Question({ ...validQuestionData, text: '' }))
        .toThrow('Question text is required');
    });

    it('should throw error for less than 2 options', () => {
      expect(() => new Question({ ...validQuestionData, options: ['Only one'] }))
        .toThrow('At least 2 options required');
    });

    it('should throw error for more than 4 options', () => {
      expect(() => new Question({ ...validQuestionData, options: ['1', '2', '3', '4', '5'] }))
        .toThrow('Maximum 4 options allowed');
    });

    it('should throw error for invalid correct answer index', () => {
      expect(() => new Question({ ...validQuestionData, correctAnswerIndex: 5 }))
        .toThrow('Invalid correct answer index');

      expect(() => new Question({ ...validQuestionData, correctAnswerIndex: -1 }))
        .toThrow('Invalid correct answer index');
    });

    it('should throw error for time limit less than 5', () => {
      expect(() => new Question({ ...validQuestionData, timeLimit: 3 }))
        .toThrow('Time limit must be between 5 and 120 seconds');
    });

    it('should throw error for time limit more than 120', () => {
      expect(() => new Question({ ...validQuestionData, timeLimit: 150 }))
        .toThrow('Time limit must be between 5 and 120 seconds');
    });
  });

  describe('isCorrect', () => {
    it('should return true for correct answer', () => {
      const question = new Question(validQuestionData);

      expect(question.isCorrect(1)).toBe(true);
    });

    it('should return false for wrong answer', () => {
      const question = new Question(validQuestionData);

      expect(question.isCorrect(0)).toBe(false);
      expect(question.isCorrect(2)).toBe(false);
      expect(question.isCorrect(3)).toBe(false);
    });
  });

  describe('calculateScore', () => {
    it('should return 0 for wrong answer', () => {
      const question = new Question(validQuestionData);

      expect(question.calculateScore(0, 0)).toBe(0);
      expect(question.calculateScore(2, 5000)).toBe(0);
    });

    it('should return ~1000 for instant correct answer', () => {
      const question = new Question(validQuestionData);
      const score = question.calculateScore(1, 0);

      expect(score).toBe(1000);
    });

    it('should return ~500 for last second correct answer', () => {
      const question = new Question({ ...validQuestionData, timeLimit: 30 });
      const score = question.calculateScore(1, 30000);

      expect(score).toBe(500);
    });

    it('should return score between 500-1000 for mid-time answer', () => {
      const question = new Question({ ...validQuestionData, timeLimit: 30 });
      const score = question.calculateScore(1, 15000);

      expect(score).toBeGreaterThan(500);
      expect(score).toBeLessThan(1000);
    });

    it('should never return less than half points for correct answer', () => {
      const question = new Question({ ...validQuestionData, timeLimit: 30, points: 1000 });
      const score = question.calculateScore(1, 60000); // Over time

      expect(score).toBeGreaterThanOrEqual(500);
    });
  });

  describe('getPublicData', () => {
    it('should return question without correct answer', () => {
      const question = new Question(validQuestionData);
      const publicData = question.getPublicData();

      expect(publicData.id).toBe('q-1');
      expect(publicData.text).toBe('What is 2 + 2?');
      expect(publicData.options).toEqual(['3', '4', '5', '6']);
      expect(publicData.timeLimit).toBe(30);
      expect(publicData).not.toHaveProperty('correctAnswerIndex');
      expect(publicData).not.toHaveProperty('points');
    });
  });
});
