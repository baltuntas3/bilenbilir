const { Answer } = require('../Answer');

const mockQuestion = {
  isCorrect: (idx) => idx === 1,
  calculateScore: () => 800,
  options: ['A', 'B', 'C', 'D']
};

describe('Answer.create validation edge cases', () => {
  it('should throw for missing playerId', () => {
    expect(() => Answer.create({ playerId: '', questionId: 'q1', roomPin: '123456', answerIndex: 0, question: mockQuestion, elapsedTimeMs: 1000, currentStreak: 0 }))
      .toThrow('playerId is required');
  });

  it('should throw for non-string playerId', () => {
    expect(() => Answer.create({ playerId: 123, questionId: 'q1', roomPin: '123456', answerIndex: 0, question: mockQuestion, elapsedTimeMs: 1000, currentStreak: 0 }))
      .toThrow('playerId is required');
  });

  it('should throw for missing questionId', () => {
    expect(() => Answer.create({ playerId: 'p1', questionId: '', roomPin: '123456', answerIndex: 0, question: mockQuestion, elapsedTimeMs: 1000, currentStreak: 0 }))
      .toThrow('questionId is required');
  });

  it('should throw for non-string questionId', () => {
    expect(() => Answer.create({ playerId: 'p1', questionId: 123, roomPin: '123456', answerIndex: 0, question: mockQuestion, elapsedTimeMs: 1000, currentStreak: 0 }))
      .toThrow('questionId is required');
  });

  it('should throw for missing roomPin', () => {
    expect(() => Answer.create({ playerId: 'p1', questionId: 'q1', roomPin: '', answerIndex: 0, question: mockQuestion, elapsedTimeMs: 1000, currentStreak: 0 }))
      .toThrow('roomPin is required');
  });

  it('should throw for non-string roomPin', () => {
    expect(() => Answer.create({ playerId: 'p1', questionId: 'q1', roomPin: 123, answerIndex: 0, question: mockQuestion, elapsedTimeMs: 1000, currentStreak: 0 }))
      .toThrow('roomPin is required');
  });

  it('should throw for negative answerIndex', () => {
    expect(() => Answer.create({ playerId: 'p1', questionId: 'q1', roomPin: '123456', answerIndex: -1, question: mockQuestion, elapsedTimeMs: 1000, currentStreak: 0 }))
      .toThrow('non-negative integer');
  });

  it('should throw for answerIndex exceeding options', () => {
    expect(() => Answer.create({ playerId: 'p1', questionId: 'q1', roomPin: '123456', answerIndex: 5, question: mockQuestion, elapsedTimeMs: 1000, currentStreak: 0 }))
      .toThrow('exceeds the number of options');
  });

  it('should throw for missing question', () => {
    expect(() => Answer.create({ playerId: 'p1', questionId: 'q1', roomPin: '123456', answerIndex: 0, question: null, elapsedTimeMs: 1000, currentStreak: 0 }))
      .toThrow('Valid question is required');
  });

  it('should throw for question without isCorrect method', () => {
    expect(() => Answer.create({ playerId: 'p1', questionId: 'q1', roomPin: '123456', answerIndex: 0, question: {}, elapsedTimeMs: 1000, currentStreak: 0 }))
      .toThrow('Valid question is required');
  });

  it('should throw for negative elapsedTimeMs', () => {
    expect(() => Answer.create({ playerId: 'p1', questionId: 'q1', roomPin: '123456', answerIndex: 0, question: mockQuestion, elapsedTimeMs: -1, currentStreak: 0 }))
      .toThrow('non-negative number');
  });

  it('should throw for NaN elapsedTimeMs', () => {
    expect(() => Answer.create({ playerId: 'p1', questionId: 'q1', roomPin: '123456', answerIndex: 0, question: mockQuestion, elapsedTimeMs: NaN, currentStreak: 0 }))
      .toThrow('non-negative number');
  });

  it('should handle invalid currentStreak gracefully', () => {
    const answer = Answer.create({ playerId: 'p1', questionId: 'q1', roomPin: '123456', answerIndex: 1, question: mockQuestion, elapsedTimeMs: 1000, currentStreak: -5 });
    expect(answer.streakBonus).toBe(0);
  });

  it('should handle NaN currentStreak', () => {
    const answer = Answer.create({ playerId: 'p1', questionId: 'q1', roomPin: '123456', answerIndex: 1, question: mockQuestion, elapsedTimeMs: 1000, currentStreak: NaN });
    expect(answer.streakBonus).toBe(0);
  });
});
