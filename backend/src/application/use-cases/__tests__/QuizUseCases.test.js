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
      })).rejects.toThrow('Invalid question IDs in order');
    });

    it('should throw error for unauthorized user', async () => {
      await expect(quizUseCases.reorderQuestions({
        quizId,
        questionOrder: [q3Id, q1Id, q2Id],
        requesterId: 'another-user'
      })).rejects.toThrow('Not authorized to modify this quiz');
    });
  });

  describe('getQuestions', () => {
    let quizId;

    beforeEach(async () => {
      const quizResult = await quizUseCases.createQuiz({
        title: 'Quiz',
        createdBy: userId
      });
      quizId = quizResult.quiz.id;

      await quizUseCases.addQuestion({
        quizId,
        questionData: {
          text: 'Q1',
          options: ['A', 'B'],
          correctAnswerIndex: 0
        },
        requesterId: userId
      });

      await quizUseCases.addQuestion({
        quizId,
        questionData: {
          text: 'Q2',
          options: ['A', 'B', 'C'],
          correctAnswerIndex: 1
        },
        requesterId: userId
      });
    });

    it('should return all questions for a quiz', async () => {
      const result = await quizUseCases.getQuestions({ quizId });

      expect(result.questions).toHaveLength(2);
      expect(result.questions[0].text).toBe('Q1');
      expect(result.questions[1].text).toBe('Q2');
    });

    it('should throw error for non-existent quiz', async () => {
      await expect(quizUseCases.getQuestions({ quizId: 'non-existent' }))
        .rejects.toThrow('Quiz not found');
    });
  });

  describe('updateQuestion', () => {
    let quizId;
    let questionId;

    beforeEach(async () => {
      const quizResult = await quizUseCases.createQuiz({
        title: 'Quiz',
        createdBy: userId
      });
      quizId = quizResult.quiz.id;

      const questionResult = await quizUseCases.addQuestion({
        quizId,
        questionData: {
          text: 'Original Question',
          options: ['A', 'B'],
          correctAnswerIndex: 0,
          timeLimit: 30,
          points: 1000
        },
        requesterId: userId
      });
      questionId = questionResult.question.id;
    });

    it('should update question text', async () => {
      const result = await quizUseCases.updateQuestion({
        quizId,
        questionId,
        questionData: { text: 'Updated Question' },
        requesterId: userId
      });

      expect(result.question.text).toBe('Updated Question');
      expect(result.question.options).toEqual(['A', 'B']);
    });

    it('should update question options', async () => {
      const result = await quizUseCases.updateQuestion({
        quizId,
        questionId,
        questionData: { options: ['X', 'Y', 'Z'] },
        requesterId: userId
      });

      expect(result.question.options).toEqual(['X', 'Y', 'Z']);
    });

    it('should update correctAnswerIndex to 0', async () => {
      // First set to different value
      await quizUseCases.updateQuestion({
        quizId,
        questionId,
        questionData: { correctAnswerIndex: 1 },
        requesterId: userId
      });

      // Then update back to 0 (testing falsy value handling)
      const result = await quizUseCases.updateQuestion({
        quizId,
        questionId,
        questionData: { correctAnswerIndex: 0 },
        requesterId: userId
      });

      expect(result.question.correctAnswerIndex).toBe(0);
    });

    it('should throw error for non-existent quiz', async () => {
      await expect(quizUseCases.updateQuestion({
        quizId: 'non-existent',
        questionId,
        questionData: { text: 'Updated' },
        requesterId: userId
      })).rejects.toThrow('Quiz not found');
    });

    it('should throw error for non-existent question', async () => {
      await expect(quizUseCases.updateQuestion({
        quizId,
        questionId: 'non-existent',
        questionData: { text: 'Updated' },
        requesterId: userId
      })).rejects.toThrow('Question not found');
    });

    it('should throw error for unauthorized user', async () => {
      await expect(quizUseCases.updateQuestion({
        quizId,
        questionId,
        questionData: { text: 'Updated' },
        requesterId: 'another-user'
      })).rejects.toThrow('Not authorized to modify this quiz');
    });
  });

  describe('exportQuiz', () => {
    let quizId;

    beforeEach(async () => {
      const quizResult = await quizUseCases.createQuiz({
        title: 'Export Test Quiz',
        description: 'A quiz for export testing',
        createdBy: userId
      });
      quizId = quizResult.quiz.id;

      await quizUseCases.addQuestion({
        quizId,
        questionData: {
          text: 'What is 2+2?',
          type: QuestionType.MULTIPLE_CHOICE,
          options: ['3', '4', '5', '6'],
          correctAnswerIndex: 1,
          timeLimit: 30,
          points: 1000
        },
        requesterId: userId
      });
    });

    it('should export quiz with questions', async () => {
      const result = await quizUseCases.exportQuiz({
        quizId,
        requesterId: userId
      });

      expect(result.exportData).toBeDefined();
      expect(result.exportData.version).toBe('1.0');
      expect(result.exportData.quiz.title).toBe('Export Test Quiz');
      expect(result.exportData.quiz.description).toBe('A quiz for export testing');
      expect(result.exportData.quiz.questions).toHaveLength(1);
      expect(result.exportData.quiz.questions[0].text).toBe('What is 2+2?');
      expect(result.exportData.exportedAt).toBeDefined();
    });

    it('should allow export of public quiz by non-owner', async () => {
      await quizUseCases.updateQuiz({
        quizId,
        isPublic: true,
        requesterId: userId
      });

      const result = await quizUseCases.exportQuiz({
        quizId,
        requesterId: 'another-user'
      });

      expect(result.exportData.quiz.title).toBe('Export Test Quiz');
    });

    it('should throw error for private quiz by non-owner', async () => {
      await expect(quizUseCases.exportQuiz({
        quizId,
        requesterId: 'another-user'
      })).rejects.toThrow('Not authorized to export this quiz');
    });

    it('should throw error for non-existent quiz', async () => {
      await expect(quizUseCases.exportQuiz({
        quizId: 'non-existent',
        requesterId: userId
      })).rejects.toThrow('Quiz not found');
    });
  });

  describe('importQuiz', () => {
    const validImportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      quiz: {
        title: 'Imported Quiz',
        description: 'An imported quiz',
        questions: [
          {
            text: 'Question 1',
            type: 'MULTIPLE_CHOICE',
            options: ['A', 'B', 'C', 'D'],
            correctAnswerIndex: 0,
            timeLimit: 30,
            points: 1000
          },
          {
            text: 'Question 2',
            options: ['X', 'Y'],
            correctAnswerIndex: 1
          }
        ]
      }
    };

    it('should import quiz from valid JSON', async () => {
      const result = await quizUseCases.importQuiz({
        jsonData: validImportData,
        requesterId: userId
      });

      expect(result.quiz).toBeDefined();
      expect(result.quiz.title).toBe('Imported Quiz');
      expect(result.quiz.description).toBe('An imported quiz');
      expect(result.quiz.createdBy).toBe(userId);
      expect(result.quiz.isPublic).toBe(false);
      expect(result.questionCount).toBe(2);
    });

    it('should import quiz as public', async () => {
      const result = await quizUseCases.importQuiz({
        jsonData: validImportData,
        requesterId: userId,
        isPublic: true
      });

      expect(result.quiz.isPublic).toBe(true);
    });

    it('should apply default values for missing fields', async () => {
      const result = await quizUseCases.importQuiz({
        jsonData: validImportData,
        requesterId: userId
      });

      // Question 2 should have default timeLimit and points
      const quiz = await quizUseCases.getQuiz({ quizId: result.quiz.id });
      expect(quiz.quiz.getQuestion(1).timeLimit).toBe(30);
      expect(quiz.quiz.getQuestion(1).points).toBe(1000);
    });

    it('should throw error for missing version', async () => {
      await expect(quizUseCases.importQuiz({
        jsonData: { quiz: { title: 'Test', questions: [] } },
        requesterId: userId
      })).rejects.toThrow('Invalid import data: missing version');
    });

    it('should throw error for missing quiz object', async () => {
      await expect(quizUseCases.importQuiz({
        jsonData: { version: '1.0' },
        requesterId: userId
      })).rejects.toThrow('Invalid import data: missing quiz object');
    });

    it('should throw error for missing quiz title', async () => {
      await expect(quizUseCases.importQuiz({
        jsonData: { version: '1.0', quiz: { questions: [] } },
        requesterId: userId
      })).rejects.toThrow('Invalid import data: quiz must have a title');
    });

    it('should throw error for missing questions array', async () => {
      await expect(quizUseCases.importQuiz({
        jsonData: { version: '1.0', quiz: { title: 'Test' } },
        requesterId: userId
      })).rejects.toThrow('Invalid import data: questions must be an array');
    });

    it('should throw error for too many questions', async () => {
      const tooManyQuestions = Array.from({ length: 51 }, (_, i) => ({
        text: `Question ${i}`,
        options: ['A', 'B'],
        correctAnswerIndex: 0
      }));

      await expect(quizUseCases.importQuiz({
        jsonData: { version: '1.0', quiz: { title: 'Test', questions: tooManyQuestions } },
        requesterId: userId
      })).rejects.toThrow('Invalid import data: maximum 50 questions allowed');
    });

    it('should throw error for invalid question text', async () => {
      await expect(quizUseCases.importQuiz({
        jsonData: {
          version: '1.0',
          quiz: {
            title: 'Test',
            questions: [{ options: ['A', 'B'], correctAnswerIndex: 0 }]
          }
        },
        requesterId: userId
      })).rejects.toThrow('Invalid question at index 0: missing text');
    });

    it('should throw error for invalid options count', async () => {
      await expect(quizUseCases.importQuiz({
        jsonData: {
          version: '1.0',
          quiz: {
            title: 'Test',
            questions: [{ text: 'Q1', options: ['Only one'], correctAnswerIndex: 0 }]
          }
        },
        requesterId: userId
      })).rejects.toThrow('Invalid question at index 0: must have 2-4 options');
    });

    it('should throw error for invalid correctAnswerIndex', async () => {
      await expect(quizUseCases.importQuiz({
        jsonData: {
          version: '1.0',
          quiz: {
            title: 'Test',
            questions: [{ text: 'Q1', options: ['A', 'B'], correctAnswerIndex: 5 }]
          }
        },
        requesterId: userId
      })).rejects.toThrow('Invalid question at index 0: invalid correctAnswerIndex');
    });

    it('should throw error for invalid timeLimit', async () => {
      await expect(quizUseCases.importQuiz({
        jsonData: {
          version: '1.0',
          quiz: {
            title: 'Test',
            questions: [{ text: 'Q1', options: ['A', 'B'], correctAnswerIndex: 0, timeLimit: 3 }]
          }
        },
        requesterId: userId
      })).rejects.toThrow('Invalid question at index 0: timeLimit must be between 5 and 120');
    });

    it('should throw error for invalid points', async () => {
      await expect(quizUseCases.importQuiz({
        jsonData: {
          version: '1.0',
          quiz: {
            title: 'Test',
            questions: [{ text: 'Q1', options: ['A', 'B'], correctAnswerIndex: 0, points: 50 }]
          }
        },
        requesterId: userId
      })).rejects.toThrow('Invalid question at index 0: points must be between 100 and 10000');
    });

    it('should throw error for null import data', async () => {
      await expect(quizUseCases.importQuiz({
        jsonData: null,
        requesterId: userId
      })).rejects.toThrow('Invalid import data: must be an object');
    });
  });

  describe('deleteQuiz with active game check', () => {
    const { RoomRepository } = require('../../../infrastructure/repositories/RoomRepository');

    it('should prevent deletion when quiz is in active game', async () => {
      const roomRepository = new RoomRepository();
      const useCasesWithRoom = new QuizUseCases(quizRepository, roomRepository);

      // Create quiz
      const quizResult = await useCasesWithRoom.createQuiz({
        title: 'Quiz',
        createdBy: userId
      });

      // Create room using this quiz
      const { Room } = require('../../../domain/entities');
      const room = new Room({
        id: 'room-1',
        pin: '123456',
        hostId: 'host-socket',
        quizId: quizResult.quiz.id
      });
      await roomRepository.save(room);

      // Try to delete quiz
      await expect(useCasesWithRoom.deleteQuiz({
        quizId: quizResult.quiz.id,
        requesterId: userId
      })).rejects.toThrow('Cannot delete quiz while it is being used in an active game');

      // Cleanup
      await roomRepository.clear();
    });
  });

  describe('deleteQuiz with cascade game sessions', () => {
    it('should delete related game sessions', async () => {
      const mockGameSessionRepo = {
        deleteByQuiz: jest.fn().mockResolvedValue(5)
      };
      const useCasesWithSession = new QuizUseCases(quizRepository, null, mockGameSessionRepo);

      const quizResult = await useCasesWithSession.createQuiz({
        title: 'Quiz',
        createdBy: userId
      });

      const result = await useCasesWithSession.deleteQuiz({
        quizId: quizResult.quiz.id,
        requesterId: userId
      });

      expect(result.success).toBe(true);
      expect(result.deletedSessionsCount).toBe(5);
      expect(mockGameSessionRepo.deleteByQuiz).toHaveBeenCalledWith(quizResult.quiz.id);
    });
  });

  describe('export/import roundtrip', () => {
    it('should successfully import an exported quiz', async () => {
      // Create original quiz with questions
      const originalResult = await quizUseCases.createQuiz({
        title: 'Roundtrip Quiz',
        description: 'Testing export/import',
        createdBy: userId
      });

      await quizUseCases.addQuestion({
        quizId: originalResult.quiz.id,
        questionData: {
          text: 'What is 1+1?',
          options: ['1', '2', '3'],
          correctAnswerIndex: 1,
          timeLimit: 20,
          points: 500
        },
        requesterId: userId
      });

      // Export
      const exportResult = await quizUseCases.exportQuiz({
        quizId: originalResult.quiz.id,
        requesterId: userId
      });

      // Import as new quiz
      const importResult = await quizUseCases.importQuiz({
        jsonData: exportResult.exportData,
        requesterId: 'user-2'
      });

      expect(importResult.quiz.title).toBe('Roundtrip Quiz');
      expect(importResult.quiz.description).toBe('Testing export/import');
      expect(importResult.quiz.createdBy).toBe('user-2');
      expect(importResult.questionCount).toBe(1);

      // Verify question data
      const questions = await quizUseCases.getQuestions({ quizId: importResult.quiz.id });
      expect(questions.questions[0].text).toBe('What is 1+1?');
      expect(questions.questions[0].correctAnswerIndex).toBe(1);
      expect(questions.questions[0].timeLimit).toBe(20);
      expect(questions.questions[0].points).toBe(500);
    });
  });
});
