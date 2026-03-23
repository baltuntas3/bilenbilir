const { AnswerUseCases } = require('../AnswerUseCases');
const { RoomRepository } = require('../../../infrastructure/repositories/RoomRepository');
const { QuizRepository } = require('../../../infrastructure/repositories/QuizRepository');
const { RoomUseCases } = require('../RoomUseCases');
const { GameFlowUseCases } = require('../GameFlowUseCases');
const { Quiz, Question, QuestionType } = require('../../../domain/entities');

describe('AnswerUseCases', () => {
  let answerUC, roomRepo, quizRepo, roomUseCases, flowUC;
  let roomPin;

  beforeEach(async () => {
    roomRepo = new RoomRepository();
    quizRepo = new QuizRepository();
    answerUC = new AnswerUseCases(roomRepo, quizRepo);
    roomUseCases = new RoomUseCases(roomRepo, quizRepo);
    flowUC = new GameFlowUseCases(roomRepo, quizRepo);

    const quiz = new Quiz({ id: 'quiz-1', title: 'Test', createdBy: 'u1' });
    quiz.addQuestion(new Question({ id: 'q1', text: 'Q1?', type: QuestionType.MULTIPLE_CHOICE, options: ['A', 'B', 'C', 'D'], correctAnswerIndex: 1, timeLimit: 30, points: 1000 }));
    quiz.addQuestion(new Question({ id: 'q2', text: 'Q2?', type: QuestionType.MULTIPLE_CHOICE, options: ['A', 'B', 'C', 'D'], correctAnswerIndex: 0, timeLimit: 30, points: 1000 }));
    await quizRepo.save(quiz);

    const create = await roomUseCases.createRoom({ hostId: 'host-sock', hostUserId: 'u1', quizId: 'quiz-1' });
    roomPin = create.room.pin;
    await roomUseCases.joinRoom({ pin: roomPin, nickname: 'Player1', socketId: 'p1-sock' });
    await flowUC.startGame({ pin: roomPin, requesterId: 'host-sock' });
    await flowUC.startAnsweringPhase({ pin: roomPin, requesterId: 'host-sock' });
  });

  describe('submitAnswer', () => {
    it('should submit correct answer', async () => {
      const result = await answerUC.submitAnswer({ pin: roomPin, socketId: 'p1-sock', answerIndex: 1, elapsedTimeMs: 1000 });
      expect(result.answer.isCorrect).toBe(true);
      expect(result.actualScore).toBeGreaterThan(0);
    });

    it('should submit wrong answer', async () => {
      const result = await answerUC.submitAnswer({ pin: roomPin, socketId: 'p1-sock', answerIndex: 0, elapsedTimeMs: 1000 });
      expect(result.answer.isCorrect).toBe(false);
      expect(result.actualScore).toBe(0);
    });

    it('should throw for invalid answer index', async () => {
      await expect(answerUC.submitAnswer({ pin: roomPin, socketId: 'p1-sock', answerIndex: -1, elapsedTimeMs: 1000 }))
        .rejects.toThrow('Invalid answer index');
    });

    it('should throw for null answer index', async () => {
      await expect(answerUC.submitAnswer({ pin: roomPin, socketId: 'p1-sock', answerIndex: null, elapsedTimeMs: 1000 }))
        .rejects.toThrow('Invalid answer index');
    });

    it('should throw for invalid elapsed time', async () => {
      await expect(answerUC.submitAnswer({ pin: roomPin, socketId: 'p1-sock', answerIndex: 0, elapsedTimeMs: 'bad' }))
        .rejects.toThrow('Invalid elapsed time');
    });

    it('should throw for out of bounds answer index', async () => {
      await expect(answerUC.submitAnswer({ pin: roomPin, socketId: 'p1-sock', answerIndex: 10, elapsedTimeMs: 1000 }))
        .rejects.toThrow('out of bounds');
    });

    it('should throw if already answered', async () => {
      await answerUC.submitAnswer({ pin: roomPin, socketId: 'p1-sock', answerIndex: 0, elapsedTimeMs: 1000 });
      await expect(answerUC.submitAnswer({ pin: roomPin, socketId: 'p1-sock', answerIndex: 1, elapsedTimeMs: 1000 }))
        .rejects.toThrow('Already answered');
    });

    it('should throw for non-existent player', async () => {
      await expect(answerUC.submitAnswer({ pin: roomPin, socketId: 'nonexistent', answerIndex: 0, elapsedTimeMs: 1000 }))
        .rejects.toThrow('not found');
    });

    it('should handle double points power-up', async () => {
      const room = await roomRepo.findByPin(roomPin);
      const player = room.getPlayer('p1-sock');
      player.usePowerUp('DOUBLE_POINTS');
      await roomRepo.save(room);
      const result = await answerUC.submitAnswer({ pin: roomPin, socketId: 'p1-sock', answerIndex: 1, elapsedTimeMs: 1000 });
      expect(result.actualScore).toBeGreaterThan(0);
    });
  });

  describe('usePowerUp', () => {
    it('should use fifty-fifty power-up', async () => {
      const result = await answerUC.usePowerUp({ pin: roomPin, socketId: 'p1-sock', powerUpType: 'FIFTY_FIFTY' });
      expect(result.result.type).toBe('FIFTY_FIFTY');
      expect(result.emitActions).toBeDefined();
    });

    it('should throw if no power-up remaining', async () => {
      await answerUC.usePowerUp({ pin: roomPin, socketId: 'p1-sock', powerUpType: 'FIFTY_FIFTY' });
      await expect(answerUC.usePowerUp({ pin: roomPin, socketId: 'p1-sock', powerUpType: 'FIFTY_FIFTY' }))
        .rejects.toThrow('remaining');
    });

    it('should throw if already answered', async () => {
      await answerUC.submitAnswer({ pin: roomPin, socketId: 'p1-sock', answerIndex: 0, elapsedTimeMs: 1000 });
      await expect(answerUC.usePowerUp({ pin: roomPin, socketId: 'p1-sock', powerUpType: 'DOUBLE_POINTS' }))
        .rejects.toThrow('after answering');
    });
  });

  describe('getServerElapsedTime', () => {
    it('should throw when time expired', () => {
      const timerService = { getElapsedTime: jest.fn().mockReturnValue(5000), isTimeExpired: jest.fn().mockReturnValue(true) };
      expect(() => answerUC.getServerElapsedTime(timerService, roomPin)).toThrow('Time expired');
    });

    it('should throw when elapsed time is null', () => {
      const timerService = { isTimeExpired: jest.fn().mockReturnValue(false), getElapsedTime: jest.fn().mockReturnValue(null) };
      expect(() => answerUC.getServerElapsedTime(timerService, roomPin)).toThrow('Time expired');
    });

    it('should clamp elapsed time to timer duration', () => {
      const timerService = {
        isTimeExpired: jest.fn().mockReturnValue(false),
        getElapsedTime: jest.fn().mockReturnValue(50000),
        getTimerSync: jest.fn().mockReturnValue({ duration: 30000 })
      };
      const result = answerUC.getServerElapsedTime(timerService, roomPin);
      expect(result).toBe(30000);
    });

    it('should return elapsed time without clamping', () => {
      const timerService = {
        isTimeExpired: jest.fn().mockReturnValue(false),
        getElapsedTime: jest.fn().mockReturnValue(5000),
        getTimerSync: jest.fn().mockReturnValue(null)
      };
      const result = answerUC.getServerElapsedTime(timerService, roomPin);
      expect(result).toBe(5000);
    });

    it('should return elapsed time when timer is active and not expired', () => {
      const timerService = {
        isTimeExpired: jest.fn().mockReturnValue(false),
        getElapsedTime: jest.fn().mockReturnValue(5000),
        getTimerSync: jest.fn().mockReturnValue({ duration: 30000 })
      };
      const result = answerUC.getServerElapsedTime(timerService, roomPin);
      expect(result).toBe(5000);
    });
  });

  describe('cleanupExpiredLocks', () => {
    it('should return count', () => {
      expect(answerUC.cleanupExpiredLocks()).toBe(0);
    });
  });
});
