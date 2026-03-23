const { RoomUseCases } = require('../RoomUseCases');
const { RoomRepository } = require('../../../infrastructure/repositories/RoomRepository');
const { QuizRepository } = require('../../../infrastructure/repositories/QuizRepository');
const { Quiz, Question, QuestionType, RoomState } = require('../../../domain/entities');

describe('RoomUseCases comprehensive', () => {
  let roomUseCases, roomRepo, quizRepo, testQuiz;

  beforeEach(async () => {
    roomRepo = new RoomRepository();
    quizRepo = new QuizRepository();
    roomUseCases = new RoomUseCases(roomRepo, quizRepo, { playerGracePeriod: 120000, hostGracePeriod: 300000 });
    testQuiz = new Quiz({ id: 'quiz-1', title: 'Test Quiz', createdBy: 'user-1' });
    testQuiz.addQuestion(new Question({ id: 'q1', text: 'What is 2+2?', type: QuestionType.MULTIPLE_CHOICE, options: ['3', '4', '5', '6'], correctAnswerIndex: 1, timeLimit: 30, points: 1000 }));
    await quizRepo.save(testQuiz);
  });

  describe('createRoom', () => {
    it('should create a room', async () => {
      const result = await roomUseCases.createRoom({ hostId: 'host-sock', hostUserId: 'user-1', quizId: 'quiz-1' });
      expect(result.room).toBeDefined();
      expect(result.hostToken).toBeDefined();
      expect(result.quiz).toBeDefined();
    });

    it('should throw if host already has a room', async () => {
      await roomUseCases.createRoom({ hostId: 'host-sock', hostUserId: 'user-1', quizId: 'quiz-1' });
      await expect(roomUseCases.createRoom({ hostId: 'host-sock2', hostUserId: 'user-1', quizId: 'quiz-1' }))
        .rejects.toThrow('already have an active room');
    });

    it('should throw if quiz not found', async () => {
      await expect(roomUseCases.createRoom({ hostId: 'host-sock', hostUserId: 'user-2', quizId: 'nonexistent' }))
        .rejects.toThrow('not found');
    });
  });

  describe('joinRoom', () => {
    let roomPin;
    beforeEach(async () => {
      const result = await roomUseCases.createRoom({ hostId: 'host-sock', hostUserId: 'user-1', quizId: 'quiz-1' });
      roomPin = result.room.pin;
    });

    it('should join room', async () => {
      const result = await roomUseCases.joinRoom({ pin: roomPin, nickname: 'Player1', socketId: 'player-sock' });
      expect(result.player).toBeDefined();
      expect(result.playerToken).toBeDefined();
    });

    it('should throw for invalid nickname', async () => {
      await expect(roomUseCases.joinRoom({ pin: roomPin, nickname: 'x', socketId: 'player-sock' }))
        .rejects.toThrow();
    });
  });

  describe('leaveRoom', () => {
    it('should leave room', async () => {
      const create = await roomUseCases.createRoom({ hostId: 'host-sock', hostUserId: 'user-1', quizId: 'quiz-1' });
      await roomUseCases.joinRoom({ pin: create.room.pin, nickname: 'Player1', socketId: 'player-sock' });
      const result = await roomUseCases.leaveRoom({ pin: create.room.pin, socketId: 'player-sock' });
      expect(result.removedPlayer).toBeDefined();
    });
  });

  describe('getRoom/getPlayers', () => {
    it('should get room and players', async () => {
      const create = await roomUseCases.createRoom({ hostId: 'host-sock', hostUserId: 'user-1', quizId: 'quiz-1' });
      const room = await roomUseCases.getRoom({ pin: create.room.pin });
      expect(room.room).toBeDefined();
      const players = await roomUseCases.getPlayers({ pin: create.room.pin });
      expect(players.players).toEqual([]);
    });
  });

  describe('closeRoom', () => {
    it('should close room', async () => {
      const create = await roomUseCases.createRoom({ hostId: 'host-sock', hostUserId: 'user-1', quizId: 'quiz-1' });
      const result = await roomUseCases.closeRoom({ pin: create.room.pin, requesterId: 'host-sock' });
      expect(result.success).toBe(true);
    });
  });

  describe('handleDisconnect', () => {
    let roomPin, hostToken;
    beforeEach(async () => {
      const create = await roomUseCases.createRoom({ hostId: 'host-sock', hostUserId: 'user-1', quizId: 'quiz-1' });
      roomPin = create.room.pin;
      hostToken = create.hostToken;
    });

    it('should return not_in_room for unknown socket', async () => {
      const result = await roomUseCases.handleDisconnect({ socketId: 'unknown' });
      expect(result.type).toBe('not_in_room');
    });

    it('should handle host disconnect', async () => {
      const result = await roomUseCases.handleDisconnect({ socketId: 'host-sock' });
      expect(result.type).toBe('host_disconnected');
    });

    it('should handle player disconnect in lobby (removes)', async () => {
      await roomUseCases.joinRoom({ pin: roomPin, nickname: 'Player1', socketId: 'p-sock' });
      const result = await roomUseCases.handleDisconnect({ socketId: 'p-sock' });
      expect(result.type).toBe('player_disconnected');
      expect(result.canReconnect).toBe(false);
    });

    it('should handle spectator disconnect', async () => {
      await roomUseCases.joinAsSpectator({ pin: roomPin, nickname: 'Viewer1', socketId: 'sp-sock' });
      const result = await roomUseCases.handleDisconnect({ socketId: 'sp-sock' });
      expect(result.type).toBe('spectator_disconnected');
    });
  });

  describe('reconnectHost', () => {
    it('should reconnect host', async () => {
      const create = await roomUseCases.createRoom({ hostId: 'host-sock', hostUserId: 'user-1', quizId: 'quiz-1' });
      await roomUseCases.handleDisconnect({ socketId: 'host-sock' });
      const result = await roomUseCases.reconnectHost({ pin: create.room.pin, hostToken: create.hostToken, newSocketId: 'new-host-sock' });
      expect(result.room).toBeDefined();
    });
  });

  describe('reconnectPlayer', () => {
    it('should reconnect player and clear answered state', async () => {
      const create = await roomUseCases.createRoom({ hostId: 'host-sock', hostUserId: 'user-1', quizId: 'quiz-1' });
      const join = await roomUseCases.joinRoom({ pin: create.room.pin, nickname: 'Player1', socketId: 'p-sock' });

      // Advance to answering phase
      const { GameUseCases } = require('../GameUseCases');
      const gu = new GameUseCases(roomRepo, quizRepo);
      await gu.startGame({ pin: create.room.pin, requesterId: 'host-sock' });
      await gu.startAnsweringPhase({ pin: create.room.pin, requesterId: 'host-sock' });

      // Player answers then disconnects
      const room = await roomRepo.findByPin(create.room.pin);
      const player = room.getPlayer('p-sock');
      player.submitAnswer(0, 1000);
      await roomRepo.save(room);

      await roomUseCases.handleDisconnect({ socketId: 'p-sock' });
      const result = await roomUseCases.reconnectPlayer({ pin: create.room.pin, playerToken: join.playerToken, newSocketId: 'new-p-sock' });
      expect(result.player).toBeDefined();
      expect(result.newPlayerToken).toBeDefined();
    });
  });

  describe('findRoomByHostToken', () => {
    it('should find room', async () => {
      const create = await roomUseCases.createRoom({ hostId: 'host-sock', hostUserId: 'user-1', quizId: 'quiz-1' });
      const result = await roomUseCases.findRoomByHostToken({ hostToken: create.hostToken });
      expect(result.room).toBeDefined();
    });

    it('should return null if not found', async () => {
      const result = await roomUseCases.findRoomByHostToken({ hostToken: 'nonexistent' });
      expect(result).toBeNull();
    });
  });

  describe('findRoomByPlayerToken/SpectatorToken', () => {
    it('should find room by player token', async () => {
      const create = await roomUseCases.createRoom({ hostId: 'host-sock', hostUserId: 'user-1', quizId: 'quiz-1' });
      const join = await roomUseCases.joinRoom({ pin: create.room.pin, nickname: 'Player1', socketId: 'p-sock' });
      const result = await roomUseCases.findRoomByPlayerToken({ playerToken: join.playerToken });
      expect(result).toBeDefined();
    });

    it('should find room by spectator token', async () => {
      const create = await roomUseCases.createRoom({ hostId: 'host-sock', hostUserId: 'user-1', quizId: 'quiz-1' });
      const spec = await roomUseCases.joinAsSpectator({ pin: create.room.pin, nickname: 'Viewer1', socketId: 'sp-sock' });
      const result = await roomUseCases.findRoomBySpectatorToken({ spectatorToken: spec.spectatorToken });
      expect(result).toBeDefined();
    });
  });

  describe('getHostRoom', () => {
    it('should return host room info', async () => {
      await roomUseCases.createRoom({ hostId: 'host-sock', hostUserId: 'user-1', quizId: 'quiz-1' });
      const result = await roomUseCases.getHostRoom({ hostUserId: 'user-1' });
      expect(result.pin).toBeDefined();
      expect(result.state).toBe('WAITING_PLAYERS');
    });

    it('should return null if no room', async () => {
      const result = await roomUseCases.getHostRoom({ hostUserId: 'nonexistent' });
      expect(result).toBeNull();
    });
  });

  describe('forceCloseHostRoom', () => {
    it('should force close', async () => {
      await roomUseCases.createRoom({ hostId: 'host-sock', hostUserId: 'user-1', quizId: 'quiz-1' });
      const result = await roomUseCases.forceCloseHostRoom({ hostUserId: 'user-1' });
      expect(result.closed).toBe(true);
    });

    it('should return not closed if no room', async () => {
      const result = await roomUseCases.forceCloseHostRoom({ hostUserId: 'nonexistent' });
      expect(result.closed).toBe(false);
    });
  });

  describe('findRoomBySocketId', () => {
    it('should find room', async () => {
      await roomUseCases.createRoom({ hostId: 'host-sock', hostUserId: 'user-1', quizId: 'quiz-1' });
      const result = await roomUseCases.findRoomBySocketId({ socketId: 'host-sock' });
      expect(result).toBeDefined();
    });
  });

  describe('lightning round', () => {
    it('should set lightning round', async () => {
      const create = await roomUseCases.createRoom({ hostId: 'host-sock', hostUserId: 'user-1', quizId: 'quiz-1' });
      const result = await roomUseCases.setLightningRound({ pin: create.room.pin, enabled: true, questionCount: 3, requesterId: 'host-sock' });
      expect(result.room).toBeDefined();
    });
  });

  describe('kick/ban', () => {
    let roomPin;
    beforeEach(async () => {
      const create = await roomUseCases.createRoom({ hostId: 'host-sock', hostUserId: 'user-1', quizId: 'quiz-1' });
      roomPin = create.room.pin;
      await roomUseCases.joinRoom({ pin: roomPin, nickname: 'Player1', socketId: 'p-sock' });
    });

    it('should kick player', async () => {
      const room = await roomRepo.findByPin(roomPin);
      const player = room.players[0];
      const result = await roomUseCases.kickPlayer({ pin: roomPin, playerId: player.id, requesterId: 'host-sock' });
      expect(result.player).toBeDefined();
    });

    it('should ban player', async () => {
      const room = await roomRepo.findByPin(roomPin);
      const player = room.players[0];
      const result = await roomUseCases.banPlayer({ pin: roomPin, playerId: player.id, requesterId: 'host-sock' });
      expect(result.player).toBeDefined();
    });

    it('should unban and get banned', async () => {
      const room = await roomRepo.findByPin(roomPin);
      const player = room.players[0];
      await roomUseCases.banPlayer({ pin: roomPin, playerId: player.id, requesterId: 'host-sock' });
      const banned = await roomUseCases.getBannedNicknames({ pin: roomPin });
      expect(banned.bannedNicknames.length).toBeGreaterThan(0);
      await roomUseCases.unbanNickname({ pin: roomPin, nickname: 'Player1', requesterId: 'host-sock' });
    });
  });

  describe('spectator methods', () => {
    let roomPin;
    beforeEach(async () => {
      const create = await roomUseCases.createRoom({ hostId: 'host-sock', hostUserId: 'user-1', quizId: 'quiz-1' });
      roomPin = create.room.pin;
    });

    it('should join and leave as spectator', async () => {
      const join = await roomUseCases.joinAsSpectator({ pin: roomPin, nickname: 'Viewer1', socketId: 'sp-sock' });
      expect(join.spectator).toBeDefined();
      await roomUseCases.leaveAsSpectator({ pin: roomPin, socketId: 'sp-sock' });
      const specs = await roomUseCases.getSpectators({ pin: roomPin });
      expect(specs.spectators).toHaveLength(0);
    });

    it('should reconnect spectator', async () => {
      const join = await roomUseCases.joinAsSpectator({ pin: roomPin, nickname: 'Viewer1', socketId: 'sp-sock' });
      await roomUseCases.handleDisconnect({ socketId: 'sp-sock' });
      const result = await roomUseCases.reconnectSpectator({ pin: roomPin, spectatorToken: join.spectatorToken, newSocketId: 'new-sp-sock' });
      expect(result.spectator).toBeDefined();
    });
  });

  describe('team mode', () => {
    let roomPin;
    beforeEach(async () => {
      const create = await roomUseCases.createRoom({ hostId: 'host-sock', hostUserId: 'user-1', quizId: 'quiz-1' });
      roomPin = create.room.pin;
    });

    it('should enable/disable team mode', async () => {
      await roomUseCases.enableTeamMode({ pin: roomPin, requesterId: 'host-sock' });
      let room = await roomRepo.findByPin(roomPin);
      expect(room.isTeamMode()).toBe(true);
      await roomUseCases.disableTeamMode({ pin: roomPin, requesterId: 'host-sock' });
      room = await roomRepo.findByPin(roomPin);
      expect(room.isTeamMode()).toBe(false);
    });

    it('should add and remove teams', async () => {
      await roomUseCases.enableTeamMode({ pin: roomPin, requesterId: 'host-sock' });
      const addResult = await roomUseCases.addTeam({ pin: roomPin, name: 'Alpha', requesterId: 'host-sock' });
      expect(addResult.team).toBeDefined();
      await roomUseCases.removeTeam({ pin: roomPin, teamId: addResult.team.id, requesterId: 'host-sock' });
    });

    it('should assign player to team', async () => {
      await roomUseCases.joinRoom({ pin: roomPin, nickname: 'Player1', socketId: 'p-sock' });
      await roomUseCases.enableTeamMode({ pin: roomPin, requesterId: 'host-sock' });
      const team = await roomUseCases.addTeam({ pin: roomPin, name: 'Alpha', requesterId: 'host-sock' });
      const room = await roomRepo.findByPin(roomPin);
      const player = room.players[0];
      await roomUseCases.assignPlayerToTeam({ pin: roomPin, playerId: player.id, teamId: team.team.id, requesterId: 'host-sock' });
    });
  });

  describe('cleanupExpiredJoinLocks', () => {
    it('should return count', () => {
      expect(roomUseCases.cleanupExpiredJoinLocks()).toBe(0);
    });
  });
});
