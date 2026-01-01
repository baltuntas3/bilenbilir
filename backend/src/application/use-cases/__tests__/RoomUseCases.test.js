const { RoomUseCases } = require('../RoomUseCases');
const { RoomRepository } = require('../../../infrastructure/repositories/RoomRepository');
const { QuizRepository } = require('../../../infrastructure/repositories/QuizRepository');
const { Quiz, Question, QuestionType, RoomState } = require('../../../domain/entities');

describe('RoomUseCases', () => {
  let roomUseCases;
  let roomRepository;
  let quizRepository;
  let testQuiz;

  beforeEach(async () => {
    roomRepository = new RoomRepository();
    quizRepository = new QuizRepository();
    roomUseCases = new RoomUseCases(roomRepository, quizRepository);

    // Create a test quiz
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
      timeLimit: 30
    }));
    await quizRepository.save(testQuiz);
  });

  afterEach(async () => {
    await roomRepository.clear();
    await quizRepository.clear();
  });

  describe('createRoom', () => {
    it('should create a room with valid quiz', async () => {
      const result = await roomUseCases.createRoom({
        hostId: 'host-socket-1',
        quizId: 'quiz-1'
      });

      expect(result.room).toBeDefined();
      expect(result.room.pin).toHaveLength(6);
      expect(result.room.hostId).toBe('host-socket-1');
      expect(result.room.quizId).toBe('quiz-1');
      expect(result.room.state).toBe(RoomState.WAITING_PLAYERS);
      expect(result.quiz).toBe(testQuiz);
    });

    it('should throw error for non-existent quiz', async () => {
      await expect(roomUseCases.createRoom({
        hostId: 'host-socket-1',
        quizId: 'non-existent'
      })).rejects.toThrow('Quiz not found');
    });

    it('should generate unique PINs', async () => {
      const pins = new Set();

      for (let i = 0; i < 10; i++) {
        const result = await roomUseCases.createRoom({
          hostId: `host-${i}`,
          quizId: 'quiz-1'
        });
        pins.add(result.room.pin);
      }

      expect(pins.size).toBe(10);
    });
  });

  describe('joinRoom', () => {
    let roomPin;

    beforeEach(async () => {
      const result = await roomUseCases.createRoom({
        hostId: 'host-socket-1',
        quizId: 'quiz-1'
      });
      roomPin = result.room.pin;
    });

    it('should add player to room', async () => {
      const result = await roomUseCases.joinRoom({
        pin: roomPin,
        nickname: 'Player1',
        socketId: 'player-socket-1'
      });

      expect(result.player).toBeDefined();
      expect(result.player.nickname).toBe('Player1');
      expect(result.player.socketId).toBe('player-socket-1');
      expect(result.room.getPlayerCount()).toBe(1);
    });

    it('should throw error for non-existent room', async () => {
      await expect(roomUseCases.joinRoom({
        pin: '999999',
        nickname: 'Player1',
        socketId: 'player-socket-1'
      })).rejects.toThrow('Room not found');
    });

    it('should throw error for duplicate nickname', async () => {
      await roomUseCases.joinRoom({
        pin: roomPin,
        nickname: 'Player1',
        socketId: 'player-socket-1'
      });

      await expect(roomUseCases.joinRoom({
        pin: roomPin,
        nickname: 'player1', // Same nickname, different case
        socketId: 'player-socket-2'
      })).rejects.toThrow('Nickname already taken');
    });

    it('should allow multiple players with different nicknames', async () => {
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

      const { room } = await roomUseCases.getRoom({ pin: roomPin });
      expect(room.getPlayerCount()).toBe(2);
    });
  });

  describe('leaveRoom', () => {
    let roomPin;

    beforeEach(async () => {
      const result = await roomUseCases.createRoom({
        hostId: 'host-socket-1',
        quizId: 'quiz-1'
      });
      roomPin = result.room.pin;

      await roomUseCases.joinRoom({
        pin: roomPin,
        nickname: 'Player1',
        socketId: 'player-socket-1'
      });
    });

    it('should remove player from room', async () => {
      const result = await roomUseCases.leaveRoom({
        pin: roomPin,
        socketId: 'player-socket-1'
      });

      expect(result.room.getPlayerCount()).toBe(0);
    });

    it('should throw error for non-existent room', async () => {
      await expect(roomUseCases.leaveRoom({
        pin: '999999',
        socketId: 'player-socket-1'
      })).rejects.toThrow('Room not found');
    });
  });

  describe('getRoom', () => {
    it('should return room by PIN', async () => {
      const createResult = await roomUseCases.createRoom({
        hostId: 'host-socket-1',
        quizId: 'quiz-1'
      });

      const result = await roomUseCases.getRoom({ pin: createResult.room.pin });

      expect(result.room.pin).toBe(createResult.room.pin);
    });

    it('should throw error for non-existent room', async () => {
      await expect(roomUseCases.getRoom({ pin: '999999' }))
        .rejects.toThrow('Room not found');
    });
  });

  describe('getPlayers', () => {
    let roomPin;

    beforeEach(async () => {
      const result = await roomUseCases.createRoom({
        hostId: 'host-socket-1',
        quizId: 'quiz-1'
      });
      roomPin = result.room.pin;
    });

    it('should return empty array for room with no players', async () => {
      const result = await roomUseCases.getPlayers({ pin: roomPin });

      expect(result.players).toEqual([]);
    });

    it('should return all players in room', async () => {
      await roomUseCases.joinRoom({
        pin: roomPin,
        nickname: 'Player1',
        socketId: 'socket-1'
      });
      await roomUseCases.joinRoom({
        pin: roomPin,
        nickname: 'Player2',
        socketId: 'socket-2'
      });

      const result = await roomUseCases.getPlayers({ pin: roomPin });

      expect(result.players).toHaveLength(2);
      expect(result.players.map(p => p.nickname)).toContain('Player1');
      expect(result.players.map(p => p.nickname)).toContain('Player2');
    });
  });

  describe('closeRoom', () => {
    let roomPin;

    beforeEach(async () => {
      const result = await roomUseCases.createRoom({
        hostId: 'host-socket-1',
        quizId: 'quiz-1'
      });
      roomPin = result.room.pin;
    });

    it('should close room when called by host', async () => {
      const result = await roomUseCases.closeRoom({
        pin: roomPin,
        requesterId: 'host-socket-1'
      });

      expect(result.success).toBe(true);

      await expect(roomUseCases.getRoom({ pin: roomPin }))
        .rejects.toThrow('Room not found');
    });

    it('should throw error when called by non-host', async () => {
      await expect(roomUseCases.closeRoom({
        pin: roomPin,
        requesterId: 'someone-else'
      })).rejects.toThrow('Only host can close the room');
    });

    it('should throw error for non-existent room', async () => {
      await expect(roomUseCases.closeRoom({
        pin: '999999',
        requesterId: 'host-socket-1'
      })).rejects.toThrow('Room not found');
    });
  });
});
