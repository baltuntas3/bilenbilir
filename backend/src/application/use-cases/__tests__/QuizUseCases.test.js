const { QuizUseCases } = require('../QuizUseCases');
const { QuizRepository } = require('../../../infrastructure/repositories/QuizRepository');
const { QuestionType } = require('../../../domain/entities');

describe('QuizUseCases', () => {
  let quizUseCases;
  let quizRepository;
  const userId = 'user-1';

  beforeEach(() => {
    quizRepository = new QuizRepository();
    quizUseCases = new QuizUseCases(quizRepository);
  });

  afterEach(async () => {
    await quizRepository.clear();
  });

  describe('createQuiz', () => {
    it('should create a new quiz', async () => {
      const result = await quizUseCases.createQuiz({
        title: 'My Quiz',
        description: 'A test quiz',
        createdBy: userId
      });

      expect(result.quiz).toBeDefined();
      expect(result.quiz.id).toBeDefined();
      expect(result.quiz.title).toBe('My Quiz');
      expect(result.quiz.description).toBe('A test quiz');
      expect(result.quiz.createdBy).toBe(userId);
      expect(result.quiz.isPublic).toBe(false);
    });

    it('should create public quiz', async () => {
      const result = await quizUseCases.createQuiz({
        title: 'Public Quiz',
        createdBy: userId,
        isPublic: true
      });

      expect(result.quiz.isPublic).toBe(true);
    });
  });

  describe('addQuestion', () => {
    let quizId;

    beforeEach(async () => {
      const result = await quizUseCases.createQuiz({
        title: 'My Quiz',
        createdBy: userId
      });
      quizId = result.quiz.id;
    });

    it('should add question to quiz', async () => {
      const result = await quizUseCases.addQuestion({
        quizId,
        questionData: {
          text: 'What is 2+2?',
          type: QuestionType.MULTIPLE_CHOICE,
          options: ['3', '4', '5', '6'],
          correctAnswerIndex: 1,
          timeLimit: 30
        },
        requesterId: userId
      });

      expect(result.question).toBeDefined();
      expect(result.question.text).toBe('What is 2+2?');
      expect(result.quiz.getTotalQuestions()).toBe(1);
    });

    it('should throw error for non-existent quiz', async () => {
      await expect(quizUseCases.addQuestion({
        quizId: 'non-existent',
        questionData: {
          text: 'Question',
          options: ['A', 'B'],
          correctAnswerIndex: 0
        },
        requesterId: userId
      })).rejects.toThrow('Quiz not found');
    });

    it('should throw error for unauthorized user', async () => {
      await expect(quizUseCases.addQuestion({
        quizId,
        questionData: {
          text: 'Question',
          options: ['A', 'B'],
          correctAnswerIndex: 0
        },
        requesterId: 'another-user'
      })).rejects.toThrow('Not authorized to modify this quiz');
    });

    it('should validate question data', async () => {
      await expect(quizUseCases.addQuestion({
        quizId,
        questionData: {
          text: '',
          options: ['A', 'B'],
          correctAnswerIndex: 0
        },
        requesterId: userId
      })).rejects.toThrow('Question text is required');
    });
  });

  describe('removeQuestion', () => {
    let quizId;
    let questionId;

    beforeEach(async () => {
      const quizResult = await quizUseCases.createQuiz({
        title: 'My Quiz',
        createdBy: userId
      });
      quizId = quizResult.quiz.id;

      const questionResult = await quizUseCases.addQuestion({
        quizId,
        questionData: {
          text: 'What is 2+2?',
          type: QuestionType.MULTIPLE_CHOICE,
          options: ['3', '4', '5', '6'],
          correctAnswerIndex: 1
        },
        requesterId: userId
      });
      questionId = questionResult.question.id;
    });

    it('should remove question from quiz', async () => {
      const result = await quizUseCases.removeQuestion({
        quizId,
        questionId,
        requesterId: userId
      });

      expect(result.quiz.getTotalQuestions()).toBe(0);
    });

    it('should throw error for non-existent quiz', async () => {
      await expect(quizUseCases.removeQuestion({
        quizId: 'non-existent',
        questionId,
        requesterId: userId
      })).rejects.toThrow('Quiz not found');
    });

    it('should throw error for unauthorized user', async () => {
      await expect(quizUseCases.removeQuestion({
        quizId,
        questionId,
        requesterId: 'another-user'
      })).rejects.toThrow('Not authorized to modify this quiz');
    });
  });

  describe('getQuiz', () => {
    it('should return quiz by ID', async () => {
      const createResult = await quizUseCases.createQuiz({
        title: 'My Quiz',
        createdBy: userId
      });

      const result = await quizUseCases.getQuiz({
        quizId: createResult.quiz.id
      });

      expect(result.quiz.title).toBe('My Quiz');
    });

    it('should throw error for non-existent quiz', async () => {
      await expect(quizUseCases.getQuiz({
        quizId: 'non-existent'
      })).rejects.toThrow('Quiz not found');
    });
  });

  describe('getQuizzesByCreator', () => {
    beforeEach(async () => {
      await quizUseCases.createQuiz({
        title: 'Quiz 1',
        createdBy: userId
      });
      await quizUseCases.createQuiz({
        title: 'Quiz 2',
        createdBy: userId
      });
      await quizUseCases.createQuiz({
        title: 'Quiz 3',
        createdBy: 'user-2'
      });
    });

    it('should return quizzes by creator', async () => {
      const result = await quizUseCases.getQuizzesByCreator({
        createdBy: userId
      });

      expect(result.quizzes).toHaveLength(2);
      expect(result.quizzes.every(q => q.createdBy === userId)).toBe(true);
    });

    it('should return empty array for creator with no quizzes', async () => {
      const result = await quizUseCases.getQuizzesByCreator({
        createdBy: 'user-99'
      });

      expect(result.quizzes).toHaveLength(0);
    });
  });

  describe('getPublicQuizzes', () => {
    beforeEach(async () => {
      await quizUseCases.createQuiz({
        title: 'Public Quiz 1',
        createdBy: userId,
        isPublic: true
      });
      await quizUseCases.createQuiz({
        title: 'Private Quiz',
        createdBy: userId,
        isPublic: false
      });
      await quizUseCases.createQuiz({
        title: 'Public Quiz 2',
        createdBy: 'user-2',
        isPublic: true
      });
    });

    it('should return only public quizzes', async () => {
      const result = await quizUseCases.getPublicQuizzes();

      expect(result.quizzes).toHaveLength(2);
      expect(result.quizzes.every(q => q.isPublic)).toBe(true);
    });
  });

  describe('updateQuiz', () => {
    let quizId;

    beforeEach(async () => {
      const result = await quizUseCases.createQuiz({
        title: 'Original Title',
        description: 'Original description',
        createdBy: userId,
        isPublic: false
      });
      quizId = result.quiz.id;
    });

    it('should update quiz title', async () => {
      const result = await quizUseCases.updateQuiz({
        quizId,
        title: 'New Title',
        requesterId: userId
      });

      expect(result.quiz.title).toBe('New Title');
      expect(result.quiz.description).toBe('Original description');
    });

    it('should update multiple fields', async () => {
      const result = await quizUseCases.updateQuiz({
        quizId,
        title: 'New Title',
        description: 'New description',
        isPublic: true,
        requesterId: userId
      });

      expect(result.quiz.title).toBe('New Title');
      expect(result.quiz.description).toBe('New description');
      expect(result.quiz.isPublic).toBe(true);
    });

    it('should throw error for non-existent quiz', async () => {
      await expect(quizUseCases.updateQuiz({
        quizId: 'non-existent',
        title: 'New Title',
        requesterId: userId
      })).rejects.toThrow('Quiz not found');
    });

    it('should throw error for unauthorized user', async () => {
      await expect(quizUseCases.updateQuiz({
        quizId,
        title: 'New Title',
        requesterId: 'another-user'
      })).rejects.toThrow('Not authorized to modify this quiz');
    });
  });

  describe('deleteQuiz', () => {
    let quizId;

    beforeEach(async () => {
      const result = await quizUseCases.createQuiz({
        title: 'To Delete',
        createdBy: userId
      });
      quizId = result.quiz.id;
    });

    it('should delete quiz', async () => {
      const result = await quizUseCases.deleteQuiz({
        quizId,
        requesterId: userId
      });

      expect(result.success).toBe(true);

      await expect(quizUseCases.getQuiz({ quizId }))
        .rejects.toThrow('Quiz not found');
    });

    it('should throw error for non-existent quiz', async () => {
      await expect(quizUseCases.deleteQuiz({
        quizId: 'non-existent',
        requesterId: userId
      })).rejects.toThrow('Quiz not found');
    });

    it('should throw error for unauthorized user', async () => {
      await expect(quizUseCases.deleteQuiz({
        quizId,
        requesterId: 'another-user'
      })).rejects.toThrow('Not authorized to modify this quiz');
    });
  });

  describe('reorderQuestions', () => {
    let quizId;
    let q1Id, q2Id, q3Id;

    beforeEach(async () => {
      const quizResult = await quizUseCases.createQuiz({
        title: 'Quiz',
        createdBy: userId
      });
      quizId = quizResult.quiz.id;

      const r1 = await quizUseCases.addQuestion({
        quizId,
        questionData: {
          text: 'Q1',
          options: ['A', 'B'],
          correctAnswerIndex: 0
        },
        requesterId: userId
      });
      q1Id = r1.question.id;

      const r2 = await quizUseCases.addQuestion({
        quizId,
        questionData: {
          text: 'Q2',
          options: ['A', 'B'],
          correctAnswerIndex: 0
        },
        requesterId: userId
      });
      q2Id = r2.question.id;

      const r3 = await quizUseCases.addQuestion({
        quizId,
        questionData: {
          text: 'Q3',
          options: ['A', 'B'],
          correctAnswerIndex: 0
        },
        requesterId: userId
      });
      q3Id = r3.question.id;
    });

    it('should reorder questions', async () => {
      const result = await quizUseCases.reorderQuestions({
        quizId,
        questionOrder: [q3Id, q1Id, q2Id],
        requesterId: userId
      });

      expect(result.quiz.getQuestion(0).text).toBe('Q3');
      expect(result.quiz.getQuestion(1).text).toBe('Q1');
      expect(result.quiz.getQuestion(2).text).toBe('Q2');
    });

    it('should throw error for invalid order', async () => {
      await expect(quizUseCases.reorderQuestions({
        quizId,
        questionOrder: [q1Id, 'invalid', q3Id],
        requesterId: userId
      })).rejects.toThrow('Invalid question order');
    });

    it('should throw error for unauthorized user', async () => {
      await expect(quizUseCases.reorderQuestions({
        quizId,
        questionOrder: [q3Id, q1Id, q2Id],
        requesterId: 'another-user'
      })).rejects.toThrow('Not authorized to modify this quiz');
    });
  });
});
