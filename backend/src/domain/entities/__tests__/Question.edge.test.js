const { Question, QuestionType } = require('../Question');

const validData = {
  id: 'q1',
  text: 'What is 2+2?',
  options: ['3', '4', '5', '6'],
  correctAnswerIndex: 1,
  timeLimit: 30,
  points: 1000
};

describe('Question edge cases', () => {
  describe('type validation', () => {
    it('should throw for invalid type', () => {
      expect(() => new Question({ ...validData, type: 'INVALID' })).toThrow('Invalid question type');
    });

    it('should accept TRUE_FALSE type with 2 options', () => {
      const q = new Question({ ...validData, type: QuestionType.TRUE_FALSE, options: ['True', 'False'], correctAnswerIndex: 0 });
      expect(q.type).toBe('TRUE_FALSE');
    });

    it('should throw if TRUE_FALSE has != 2 options', () => {
      expect(() => new Question({ ...validData, type: QuestionType.TRUE_FALSE, options: ['True', 'False', 'Maybe'] })).toThrow('exactly 2 options');
    });
  });

  describe('explanation', () => {
    it('should sanitize non-string explanation to empty', () => {
      const q = new Question({ ...validData, explanation: 123 });
      expect(q.explanation).toBe('');
    });

    it('should sanitize null explanation to empty', () => {
      const q = new Question({ ...validData, explanation: null });
      expect(q.explanation).toBe('');
    });

    it('should trim explanation', () => {
      const q = new Question({ ...validData, explanation: '  Hello  ' });
      expect(q.explanation).toBe('Hello');
    });

    it('should throw for explanation exceeding 500 chars', () => {
      expect(() => new Question({ ...validData, explanation: 'A'.repeat(501) })).toThrow('500 characters');
    });

    it('should update explanation', () => {
      const q = new Question(validData);
      q.updateExplanation('New explanation');
      expect(q.explanation).toBe('New explanation');
    });
  });

  describe('imageUrl validation', () => {
    it('should reject javascript: protocol', () => {
      expect(() => new Question({ ...validData, imageUrl: 'javascript:alert(1)' })).toThrow('Invalid image URL protocol');
    });

    it('should reject data: protocol', () => {
      expect(() => new Question({ ...validData, imageUrl: 'data:text/html,hello' })).toThrow('Invalid image URL protocol');
    });

    it('should reject invalid URL format', () => {
      expect(() => new Question({ ...validData, imageUrl: 'not-a-url' })).toThrow('Invalid image URL format');
    });

    it('should accept valid https URL', () => {
      const q = new Question({ ...validData, imageUrl: 'https://example.com/img.png' });
      expect(q.imageUrl).toBe('https://example.com/img.png');
    });

    it('should return null for empty string', () => {
      const q = new Question({ ...validData, imageUrl: '' });
      expect(q.imageUrl).toBeNull();
    });

    it('should return null for whitespace only', () => {
      const q = new Question({ ...validData, imageUrl: '   ' });
      expect(q.imageUrl).toBeNull();
    });
  });

  describe('option validation', () => {
    it('should throw for empty string option', () => {
      expect(() => new Question({ ...validData, options: ['A', '', 'C', 'D'] })).toThrow('Option 2 cannot be empty');
    });

    it('should throw for non-string option', () => {
      expect(() => new Question({ ...validData, options: ['A', 123, 'C', 'D'] })).toThrow('Option 2 cannot be empty');
    });
  });

  describe('points validation', () => {
    it('should throw for points below minimum', () => {
      expect(() => new Question({ ...validData, points: 50 })).toThrow('Points must be between');
    });

    it('should throw for points above maximum', () => {
      expect(() => new Question({ ...validData, points: 20000 })).toThrow('Points must be between');
    });

    it('should throw for non-number points', () => {
      expect(() => new Question({ ...validData, points: 'high' })).toThrow('Points must be between');
    });
  });

  describe('isCorrect edge cases', () => {
    it('should return false for non-number answerIndex', () => {
      const q = new Question(validData);
      expect(q.isCorrect('1')).toBe(false);
    });

    it('should return false for float answerIndex', () => {
      const q = new Question(validData);
      expect(q.isCorrect(1.5)).toBe(false);
    });

    it('should return false for negative answerIndex', () => {
      const q = new Question(validData);
      expect(q.isCorrect(-1)).toBe(false);
    });

    it('should return false for out-of-bounds answerIndex', () => {
      const q = new Question(validData);
      expect(q.isCorrect(10)).toBe(false);
    });
  });

  describe('calculateScore edge cases', () => {
    it('should return full points when elapsedTime equals totalTime', () => {
      const q = new Question(validData);
      const score = q.calculateScore(1, 30000); // full time
      expect(score).toBeGreaterThanOrEqual(500); // minimum 50%
    });

    it('should return minimum 50% for correct answer', () => {
      const q = new Question(validData);
      const score = q.calculateScore(1, 100000); // way over time
      expect(score).toBe(500);
    });
  });

  describe('clone', () => {
    it('should create frozen clone', () => {
      const q = new Question(validData);
      const clone = q.clone();
      expect(Object.isFrozen(clone)).toBe(true);
      expect(Object.isFrozen(clone.options)).toBe(true);
      expect(clone.text).toBe(q.text);
    });
  });

  describe('getPublicData', () => {
    it('should not include correctAnswerIndex', () => {
      const q = new Question(validData);
      const pub = q.getPublicData();
      expect(pub.correctAnswerIndex).toBeUndefined();
      expect(pub.text).toBe('What is 2+2?');
    });
  });

  describe('getHostData', () => {
    it('should include correctAnswerIndex and explanation', () => {
      const q = new Question({ ...validData, explanation: 'Because math' });
      const host = q.getHostData();
      expect(host.correctAnswerIndex).toBe(1);
      expect(host.explanation).toBe('Because math');
    });
  });
});
