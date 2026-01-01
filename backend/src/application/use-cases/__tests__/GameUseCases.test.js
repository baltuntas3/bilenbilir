const { GameUseCases } = require('../GameUseCases');
const { RoomUseCases } = require('../RoomUseCases');
const { RoomRepository } = require('../../../infrastructure/repositories/RoomRepository');
const { QuizRepository } = require('../../../infrastructure/repositories/QuizRepository');
const { Quiz, Question, QuestionType, RoomState } = require('../../../domain/entities');

describe('GameUseCases', () => {
  let gameUseCases;
  let roomUseCases;
  let roomRepository;
  let quizRepository;
  let testQuiz;
  let roomPin;

  beforeEach(async () => {
    roomRepository = new RoomRepository();
    quizRepository = new QuizRepository();
    gameUseCases = new GameUseCases(roomRepository, quizRepository);
    roomUseCases = new RoomUseCases(roomRepository, quizRepository);

    // Create a test quiz with 2 questions
    testQuiz = new Quiz({
      id: 'quiz-1',
      title: 'Test Quiz',
      createdBy: 'user-1'
    });
    testQuiz.addQuestion(new Question({
      id: 'q1',
      text: 'What is 2+2?',
      type: QuestionType.MULTIPLE_CHOICE,
      options: ['3', '4', '5', '6'],
      correctAnswerIndex: 1,
      timeLimit: 30,
      points: 1000
    }));
    testQuiz.addQuestion(new Question({
      id: 'q2',
      text: 'What is 3+3?',
      type: QuestionType.MULTIPLE_CHOICE,
      options: ['5', '6', '7', '8'],
      correctAnswerIndex: 1,
      timeLimit: 30,
      points: 1000
    }));
    await quizRepository.save(testQuiz);

    // Create room and add players
    const createResult = await roomUseCases.createRoom({
      hostId: 'host-socket',
      quizId: 'quiz-1'
    });
    roomPin = createResult.room.pin;

    await roomUseCases.joinRoom({
      pin: roomPin,
      nickname: 'Player1',
      socketId: 'player-socket-1'
    });
    await roomUseCases.joinRoom({
      pin: roomPin,
      nickname: 'Player2',
      socketId: 'player-socket-2'
    });
  });

  afterEach(async () => {
    await roomRepository.clear();
    await quizRepository.clear();
  });

  describe('startGame', () => {
    it('should start game when called by host', async () => {
      const result = await gameUseCases.startGame({
        pin: roomPin,
        requesterId: 'host-socket'
      });

      expect(result.room.state).toBe(RoomState.QUESTION_INTRO);
      expect(result.totalQuestions).toBe(2);
      expect(result.currentQuestion).toBeDefined();
      expect(result.currentQuestion.text).toBe('What is 2+2?');
      expect(result.currentQuestion).not.toHaveProperty('correctAnswerIndex');
    });

    it('should throw error when called by non-host', async () => {
      await expect(gameUseCases.startGame({
        pin: roomPin,
        requesterId: 'player-socket-1'
      })).rejects.toThrow('Only host can start the game');
    });

    it('should throw error for non-existent room', async () => {
      await expect(gameUseCases.startGame({
        pin: '999999',
        requesterId: 'host-socket'
      })).rejects.toThrow('Room not found');
    });
  });

  describe('startAnsweringPhase', () => {
    beforeEach(async () => {
      await gameUseCases.startGame({
        pin: roomPin,
        requesterId: 'host-socket'
      });
    });

    it('should start answering phase', async () => {
      const result = await gameUseCases.startAnsweringPhase({
        pin: roomPin,
        requesterId: 'host-socket'
      });

      expect(result.room.state).toBe(RoomState.ANSWERING_PHASE);
      expect(result.timeLimit).toBe(30);
    });

    it('should throw error when called by non-host', async () => {
      await expect(gameUseCases.startAnsweringPhase({
        pin: roomPin,
        requesterId: 'player-socket-1'
      })).rejects.toThrow('Only host can control game flow');
    });
  });

  describe('submitAnswer', () => {
    beforeEach(async () => {
      await gameUseCases.startGame({
        pin: roomPin,
        requesterId: 'host-socket'
      });
      await gameUseCases.startAnsweringPhase({
        pin: roomPin,
        requesterId: 'host-socket'
      });
    });

    it('should accept correct answer and calculate score', async () => {
      const result = await gameUseCases.submitAnswer({
        pin: roomPin,
        socketId: 'player-socket-1',
        answerIndex: 1, // Correct answer
        elapsedTimeMs: 1000
      });

      expect(result.answer.isCorrect).toBe(true);
      expect(result.answer.score).toBeGreaterThan(0);
      expect(result.player.score).toBeGreaterThan(0);
      expect(result.player.streak).toBe(1);
      expect(result.answeredCount).toBe(1);
      expect(result.totalPlayers).toBe(2);
    });

    it('should accept wrong answer with 0 score', async () => {
      const result = await gameUseCases.submitAnswer({
        pin: roomPin,
        socketId: 'player-socket-1',
        answerIndex: 0, // Wrong answer
        elapsedTimeMs: 1000
      });

      expect(result.answer.isCorrect).toBe(false);
      expect(result.answer.score).toBe(0);
      expect(result.player.score).toBe(0);
      expect(result.player.streak).toBe(0);
    });

    it('should set allAnswered to true when all players answered', async () => {
      await gameUseCases.submitAnswer({
        pin: roomPin,
        socketId: 'player-socket-1',
        answerIndex: 1,
        elapsedTimeMs: 1000
      });

      const result = await gameUseCases.submitAnswer({
        pin: roomPin,
        socketId: 'player-socket-2',
        answerIndex: 1,
        elapsedTimeMs: 2000
      });

      expect(result.allAnswered).toBe(true);
      expect(result.answeredCount).toBe(2);
    });

    it('should throw error for double answer', async () => {
      await gameUseCases.submitAnswer({
        pin: roomPin,
        socketId: 'player-socket-1',
        answerIndex: 1,
        elapsedTimeMs: 1000
      });

      await expect(gameUseCases.submitAnswer({
        pin: roomPin,
        socketId: 'player-socket-1',
        answerIndex: 0,
        elapsedTimeMs: 2000
      })).rejects.toThrow('Already answered');
    });

    // Note: Time validation is now done server-side by GameTimerService
    // The use case no longer validates client-provided elapsedTimeMs

    it('should throw error when not in answering phase', async () => {
      // End answering phase first
      await gameUseCases.endAnsweringPhase({
        pin: roomPin,
        requesterId: 'host-socket'
      });

      await expect(gameUseCases.submitAnswer({
        pin: roomPin,
        socketId: 'player-socket-1',
        answerIndex: 1,
        elapsedTimeMs: 1000
      })).rejects.toThrow('Not in answering phase');
    });
  });

  describe('endAnsweringPhase', () => {
    beforeEach(async () => {
      await gameUseCases.startGame({
        pin: roomPin,
        requesterId: 'host-socket'
      });
      await gameUseCases.startAnsweringPhase({
        pin: roomPin,
        requesterId: 'host-socket'
      });

      // Both players answer
      await gameUseCases.submitAnswer({
        pin: roomPin,
        socketId: 'player-socket-1',
        answerIndex: 1, // Correct
        elapsedTimeMs: 1000
      });
      await gameUseCases.submitAnswer({
        pin: roomPin,
        socketId: 'player-socket-2',
        answerIndex: 0, // Wrong
        elapsedTimeMs: 2000
      });
    });

    it('should show results with distribution', async () => {
      const result = await gameUseCases.endAnsweringPhase({
        pin: roomPin,
        requesterId: 'host-socket'
      });

      expect(result.room.state).toBe(RoomState.SHOW_RESULTS);
      expect(result.correctAnswerIndex).toBe(1);
      expect(result.distribution).toEqual([1, 1, 0, 0]);
      expect(result.correctCount).toBe(1);
      expect(result.totalPlayers).toBe(2);
    });
  });

  describe('showLeaderboard', () => {
    beforeEach(async () => {
      await gameUseCases.startGame({
        pin: roomPin,
        requesterId: 'host-socket'
      });
      await gameUseCases.startAnsweringPhase({
        pin: roomPin,
        requesterId: 'host-socket'
      });

      // Player1 answers correctly fast, Player2 answers correctly slow
      await gameUseCases.submitAnswer({
        pin: roomPin,
        socketId: 'player-socket-1',
        answerIndex: 1,
        elapsedTimeMs: 1000
      });
      await gameUseCases.submitAnswer({
        pin: roomPin,
        socketId: 'player-socket-2',
        answerIndex: 1,
        elapsedTimeMs: 20000
      });

      await gameUseCases.endAnsweringPhase({
        pin: roomPin,
        requesterId: 'host-socket'
      });
    });

    it('should show sorted leaderboard', async () => {
      const result = await gameUseCases.showLeaderboard({
        pin: roomPin,
        requesterId: 'host-socket'
      });

      expect(result.room.state).toBe(RoomState.LEADERBOARD);
      expect(result.leaderboard).toHaveLength(2);
      expect(result.leaderboard[0].nickname).toBe('Player1'); // Higher score (faster)
      expect(result.leaderboard[0].score).toBeGreaterThan(result.leaderboard[1].score);
    });
  });

  describe('nextQuestion', () => {
    beforeEach(async () => {
      await gameUseCases.startGame({
        pin: roomPin,
        requesterId: 'host-socket'
      });
      await gameUseCases.startAnsweringPhase({
        pin: roomPin,
        requesterId: 'host-socket'
      });
      await gameUseCases.endAnsweringPhase({
        pin: roomPin,
        requesterId: 'host-socket'
      });
      await gameUseCases.showLeaderboard({
        pin: roomPin,
        requesterId: 'host-socket'
      });
    });

    it('should move to next question', async () => {
      const result = await gameUseCases.nextQuestion({
        pin: roomPin,
        requesterId: 'host-socket'
      });

      expect(result.isGameOver).toBe(false);
      expect(result.questionIndex).toBe(1);
      expect(result.currentQuestion.text).toBe('What is 3+3?');
    });

    it('should end game after last question', async () => {
      // Move to question 2
      await gameUseCases.nextQuestion({
        pin: roomPin,
        requesterId: 'host-socket'
      });

      // Complete question 2
      await gameUseCases.startAnsweringPhase({
        pin: roomPin,
        requesterId: 'host-socket'
      });
      await gameUseCases.endAnsweringPhase({
        pin: roomPin,
        requesterId: 'host-socket'
      });
      await gameUseCases.showLeaderboard({
        pin: roomPin,
        requesterId: 'host-socket'
      });

      // Try to go to next (should end game)
      const result = await gameUseCases.nextQuestion({
        pin: roomPin,
        requesterId: 'host-socket'
      });

      expect(result.isGameOver).toBe(true);
      expect(result.podium).toBeDefined();
      expect(result.room.state).toBe(RoomState.PODIUM);
    });
  });

  describe('getResults', () => {
    beforeEach(async () => {
      await gameUseCases.startGame({
        pin: roomPin,
        requesterId: 'host-socket'
      });
      await gameUseCases.startAnsweringPhase({
        pin: roomPin,
        requesterId: 'host-socket'
      });

      await gameUseCases.submitAnswer({
        pin: roomPin,
        socketId: 'player-socket-1',
        answerIndex: 1,
        elapsedTimeMs: 1000
      });
    });

    it('should return leaderboard and podium', async () => {
      const result = await gameUseCases.getResults({ pin: roomPin });

      expect(result.leaderboard).toBeDefined();
      expect(result.podium).toBeDefined();
      expect(result.podium.length).toBeLessThanOrEqual(3);
    });
  });

  describe('streak bonus', () => {
    beforeEach(async () => {
      await gameUseCases.startGame({
        pin: roomPin,
        requesterId: 'host-socket'
      });
    });

    it('should add streak bonus for consecutive correct answers', async () => {
      // Question 1 - correct
      await gameUseCases.startAnsweringPhase({
        pin: roomPin,
        requesterId: 'host-socket'
      });
      const answer1 = await gameUseCases.submitAnswer({
        pin: roomPin,
        socketId: 'player-socket-1',
        answerIndex: 1,
        elapsedTimeMs: 1000
      });
      const score1 = answer1.player.score;

      await gameUseCases.endAnsweringPhase({
        pin: roomPin,
        requesterId: 'host-socket'
      });
      await gameUseCases.showLeaderboard({
        pin: roomPin,
        requesterId: 'host-socket'
      });
      await gameUseCases.nextQuestion({
        pin: roomPin,
        requesterId: 'host-socket'
      });

      // Question 2 - correct (should get streak bonus)
      await gameUseCases.startAnsweringPhase({
        pin: roomPin,
        requesterId: 'host-socket'
      });
      const answer2 = await gameUseCases.submitAnswer({
        pin: roomPin,
        socketId: 'player-socket-1',
        answerIndex: 1,
        elapsedTimeMs: 1000
      });

      expect(answer2.player.streak).toBe(2);
      expect(answer2.answer.streakBonus).toBe(100); // 1 streak * 100
      expect(answer2.player.score).toBeGreaterThan(score1 * 2); // More than just base score
    });
  });
});
