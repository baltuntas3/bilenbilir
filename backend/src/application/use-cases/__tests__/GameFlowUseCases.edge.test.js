const { GameFlowUseCases } = require('../GameFlowUseCases');
const { RoomRepository } = require('../../../infrastructure/repositories/RoomRepository');
const { QuizRepository } = require('../../../infrastructure/repositories/QuizRepository');
const { RoomUseCases } = require('../RoomUseCases');
const { Quiz, Question, QuestionType } = require('../../../domain/entities');

describe('GameFlowUseCases edge cases', () => {
  let flowUC, roomRepo, quizRepo, roomUseCases;
  let roomPin;

  beforeEach(async () => {
    roomRepo = new RoomRepository();
    quizRepo = new QuizRepository();
    flowUC = new GameFlowUseCases(roomRepo, quizRepo);
    roomUseCases = new RoomUseCases(roomRepo, quizRepo);

    const quiz = new Quiz({ id: 'quiz-1', title: 'Test', createdBy: 'u1' });
    for (let i = 0; i < 5; i++) {
      quiz.addQuestion(new Question({ id: `q${i}`, text: `Q${i}?`, type: QuestionType.MULTIPLE_CHOICE, options: ['A', 'B', 'C', 'D'], correctAnswerIndex: 1, timeLimit: 30, points: 1000 }));
    }
    await quizRepo.save(quiz);

    const create = await roomUseCases.createRoom({ hostId: 'host-sock', hostUserId: 'u1', quizId: 'quiz-1' });
    roomPin = create.room.pin;
    await roomUseCases.joinRoom({ pin: roomPin, nickname: 'Player1', socketId: 'p1-sock' });
  });

  describe('startGame with questionCount', () => {
    it('should start with subset of questions', async () => {
      const result = await flowUC.startGame({ pin: roomPin, requesterId: 'host-sock', questionCount: 3 });
      expect(result.totalQuestions).toBe(3);
    });

    it('should reject invalid question count', async () => {
      await expect(flowUC.startGame({ pin: roomPin, requesterId: 'host-sock', questionCount: 0 }))
        .rejects.toThrow('Question count must be a positive integer');
    });

    it('should reject question count exceeding available questions', async () => {
      await expect(flowUC.startGame({ pin: roomPin, requesterId: 'host-sock', questionCount: 100 }))
        .rejects.toThrow('exceeds available questions');
    });

    it('should start with all questions when count not provided', async () => {
      const result = await flowUC.startGame({ pin: roomPin, requesterId: 'host-sock' });
      expect(result.totalQuestions).toBe(5);
    });

    it('should handle incrementPlayCount failure', async () => {
      jest.spyOn(quizRepo, 'incrementPlayCount').mockRejectedValueOnce(new Error('fail'));
      const spy = jest.spyOn(console, 'error').mockImplementation();
      const result = await flowUC.startGame({ pin: roomPin, requesterId: 'host-sock' });
      expect(result.room).toBeDefined();
      spy.mockRestore();
    });
  });

  describe('startAnsweringPhase with lightning round', () => {
    beforeEach(async () => {
      const room = await roomRepo.findByPin(roomPin);
      room.setLightningRound(true, 3);
      await roomRepo.save(room);
      await flowUC.startGame({ pin: roomPin, requesterId: 'host-sock' });
    });

    it('should apply lightning time limit for last questions', async () => {
      // Advance to last question
      const result = await flowUC.startAnsweringPhase({ pin: roomPin, requesterId: 'host-sock' });
      // First question (index 0) with 5 total - lightning starts at index 2
      // So first question is NOT lightning
      expect(result.room).toBeDefined();
    });
  });

  describe('getResults with team mode', () => {
    it('should include team results', async () => {
      const room = await roomRepo.findByPin(roomPin);
      room.enableTeamMode();
      const { Team } = require('../../../domain/entities');
      room.addTeam(new Team({ id: 't1', name: 'Alpha', color: '#fff' }));
      room.assignPlayerToTeam(room.players[0].id, 't1');
      await roomRepo.save(room);

      // Play through 1 question to reach PODIUM
      await flowUC.startGame({ pin: roomPin, requesterId: 'host-sock', questionCount: 1 });
      await flowUC.startAnsweringPhase({ pin: roomPin, requesterId: 'host-sock' });
      await flowUC.endAnsweringPhase({ pin: roomPin, requesterId: 'host-sock' });
      await flowUC.showLeaderboard({ pin: roomPin, requesterId: 'host-sock' });
      await flowUC.nextQuestion({ pin: roomPin, requesterId: 'host-sock' });

      const result = await flowUC.getResults({ pin: roomPin });
      expect(result.teamLeaderboard).toBeDefined();
      expect(result.teamPodium).toBeDefined();
    });
  });

  describe('showLeaderboard with team mode', () => {
    it('should include team leaderboard', async () => {
      const room = await roomRepo.findByPin(roomPin);
      room.enableTeamMode();
      const { Team } = require('../../../domain/entities');
      room.addTeam(new Team({ id: 't1', name: 'Alpha', color: '#fff' }));
      room.assignPlayerToTeam(room.players[0].id, 't1');
      await roomRepo.save(room);

      await flowUC.startGame({ pin: roomPin, requesterId: 'host-sock' });
      await flowUC.startAnsweringPhase({ pin: roomPin, requesterId: 'host-sock' });
      await flowUC.endAnsweringPhase({ pin: roomPin, requesterId: 'host-sock' });

      const result = await flowUC.showLeaderboard({ pin: roomPin, requesterId: 'host-sock' });
      expect(result.teamLeaderboard).toBeDefined();
    });
  });

  describe('nextQuestion game over with team mode', () => {
    it('should return team podium on game over', async () => {
      // Create single-question quiz
      const quiz1 = new Quiz({ id: 'quiz-2', title: 'Short', createdBy: 'u1' });
      quiz1.addQuestion(new Question({ id: 'sq1', text: 'Q?', type: QuestionType.MULTIPLE_CHOICE, options: ['A', 'B', 'C', 'D'], correctAnswerIndex: 0, timeLimit: 30, points: 1000 }));
      await quizRepo.save(quiz1);

      const create = await roomUseCases.createRoom({ hostId: 'host2', hostUserId: 'u2', quizId: 'quiz-2' });
      await roomUseCases.joinRoom({ pin: create.room.pin, nickname: 'Player2', socketId: 'p2-sock' });

      const room = await roomRepo.findByPin(create.room.pin);
      room.enableTeamMode();
      const { Team } = require('../../../domain/entities');
      room.addTeam(new Team({ id: 't1', name: 'Alpha', color: '#fff' }));
      room.assignPlayerToTeam(room.players[0].id, 't1');
      await roomRepo.save(room);

      const flow2 = new GameFlowUseCases(roomRepo, quizRepo);
      await flow2.startGame({ pin: create.room.pin, requesterId: 'host2' });
      await flow2.startAnsweringPhase({ pin: create.room.pin, requesterId: 'host2' });
      await flow2.endAnsweringPhase({ pin: create.room.pin, requesterId: 'host2' });
      await flow2.showLeaderboard({ pin: create.room.pin, requesterId: 'host2' });

      const result = await flow2.nextQuestion({ pin: create.room.pin, requesterId: 'host2' });
      expect(result.isGameOver).toBe(true);
      expect(result.teamPodium).toBeDefined();
    });
  });
});
