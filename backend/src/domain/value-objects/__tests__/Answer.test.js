const { Answer } = require('../Answer');
const { Question, QuestionType } = require('../../entities/Question');

describe('Answer', () => {
  const mockQuestion = new Question({
    id: 'q-1',
    text: 'What is 2 + 2?',
    type: QuestionType.MULTIPLE_CHOICE,
    options: ['3', '4', '5', '6'],
    correctAnswerIndex: 1,
    timeLimit: 30,
    points: 1000
  });

  describe('constructor', () => {
    it('should create Answer with provided values', () => {
      const answer = new Answer({
        playerId: 'player-1',
        questionId: 'q-1',
        roomPin: '123456',
        answerIndex: 1,
        isCorrect: true,
        elapsedTimeMs: 5000,
        score: 900,
        streakBonus: 100
      });

      expect(answer.playerId).toBe('player-1');
      expect(answer.questionId).toBe('q-1');
      expect(answer.answerIndex).toBe(1);
      expect(answer.isCorrect).toBe(true);
      expect(answer.score).toBe(900);
      expect(answer.streakBonus).toBe(100);
    });

    it('should be immutable', () => {
      const answer = new Answer({
        playerId: 'player-1',
        questionId: 'q-1',
        roomPin: '123456',
        answerIndex: 1,
        isCorrect: true,
        elapsedTimeMs: 5000,
        score: 900
      });
      answer.score = 9999;

      expect(answer.score).toBe(900); // Value unchanged
    });
  });

  describe('getTotalScore', () => {
    it('should return score plus streak bonus', () => {
      const answer = new Answer({
        playerId: 'player-1',
        questionId: 'q-1',
        roomPin: '123456',
        answerIndex: 1,
        isCorrect: true,
        elapsedTimeMs: 5000,
        score: 900,
        streakBonus: 200
      });

      expect(answer.getTotalScore()).toBe(1100);
    });
  });

  describe('static create', () => {
    it('should create Answer with correct score for correct answer', () => {
      const answer = Answer.create({
        playerId: 'player-1',
        questionId: 'q-1',
        roomPin: '123456',
        answerIndex: 1, // Correct answer
        question: mockQuestion,
        elapsedTimeMs: 0,
        currentStreak: 0
      });

      expect(answer.isCorrect).toBe(true);
      expect(answer.score).toBe(1000);
      expect(answer.streakBonus).toBe(0);
    });

    it('should create Answer with 0 score for wrong answer', () => {
      const answer = Answer.create({
        playerId: 'player-1',
        questionId: 'q-1',
        roomPin: '123456',
        answerIndex: 0, // Wrong answer
        question: mockQuestion,
        elapsedTimeMs: 0,
        currentStreak: 0
      });

      expect(answer.isCorrect).toBe(false);
      expect(answer.score).toBe(0);
    });

    it('should add streak bonus for consecutive correct answers', () => {
      const answer = Answer.create({
        playerId: 'player-1',
        questionId: 'q-1',
        roomPin: '123456',
        answerIndex: 1,
        question: mockQuestion,
        elapsedTimeMs: 0,
        currentStreak: 3
      });

      expect(answer.isCorrect).toBe(true);
      expect(answer.streakBonus).toBe(300);
    });

    it('should not add streak bonus for wrong answer', () => {
      const answer = Answer.create({
        playerId: 'player-1',
        questionId: 'q-1',
        roomPin: '123456',
        answerIndex: 0, // Wrong
        question: mockQuestion,
        elapsedTimeMs: 0,
        currentStreak: 5
      });

      expect(answer.streakBonus).toBe(0);
    });

    it('should cap streak bonus at MAX_STREAK_BONUS (1500)', () => {
      const answer = Answer.create({
        playerId: 'player-1',
        questionId: 'q-1',
        roomPin: '123456',
        answerIndex: 1,
        question: mockQuestion,
        elapsedTimeMs: 0,
        currentStreak: 20 // Would be 2000 without cap
      });

      expect(answer.streakBonus).toBe(1500);
    });

    it('should allow streak bonus up to cap', () => {
      const answer15 = Answer.create({
        playerId: 'player-1',
        questionId: 'q-1',
        roomPin: '123456',
        answerIndex: 1,
        question: mockQuestion,
        elapsedTimeMs: 0,
        currentStreak: 15 // Exactly at cap (15 * 100 = 1500)
      });

      const answer16 = Answer.create({
        playerId: 'player-1',
        questionId: 'q-1',
        roomPin: '123456',
        answerIndex: 1,
        question: mockQuestion,
        elapsedTimeMs: 0,
        currentStreak: 16 // Over cap
      });

      expect(answer15.streakBonus).toBe(1500);
      expect(answer16.streakBonus).toBe(1500); // Capped
    });

    it('should calculate lower score for slower answers', () => {
      const fastAnswer = Answer.create({
        playerId: 'player-1',
        questionId: 'q-1',
        roomPin: '123456',
        answerIndex: 1,
        question: mockQuestion,
        elapsedTimeMs: 1000,
        currentStreak: 0
      });

      const slowAnswer = Answer.create({
        playerId: 'player-1',
        questionId: 'q-1',
        roomPin: '123456',
        answerIndex: 1,
        question: mockQuestion,
        elapsedTimeMs: 20000,
        currentStreak: 0
      });

      expect(fastAnswer.score).toBeGreaterThan(slowAnswer.score);
    });
  });
});
