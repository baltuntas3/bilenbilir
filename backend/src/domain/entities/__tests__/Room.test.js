const { Room, RoomState } = require('../Room');
const { Player } = require('../Player');
const { Spectator } = require('../Spectator');
const { Quiz } = require('../Quiz');
const { Question, QuestionType } = require('../Question');

describe('Room', () => {
  let room;

  beforeEach(() => {
    room = new Room({
      id: 'room-1',
      pin: '123456',
      hostId: 'host-socket-id',
      quizId: 'quiz-1'
    });
  });

  describe('constructor', () => {
    it('should create room with default values', () => {
      expect(room.id).toBe('room-1');
      expect(room.pin).toBe('123456');
      expect(room.hostId).toBe('host-socket-id');
      expect(room.state).toBe(RoomState.WAITING_PLAYERS);
      expect(room.currentQuestionIndex).toBe(0);
      expect(room.players).toEqual([]);
    });
  });

  describe('isHost', () => {
    it('should return true for host socket id', () => {
      expect(room.isHost('host-socket-id')).toBe(true);
    });

    it('should return false for non-host socket id', () => {
      expect(room.isHost('player-socket-id')).toBe(false);
    });
  });

  describe('addPlayer', () => {
    it('should add player during lobby phase', () => {
      const player = new Player({
        id: 'player-1',
        socketId: 'socket-1',
        nickname: 'TestPlayer',
        roomPin: '123456'
      });

      room.addPlayer(player);

      expect(room.getPlayerCount()).toBe(1);
      expect(room.getPlayer('socket-1')).toBe(player);
    });

    it('should throw error when adding player outside lobby phase', () => {
      // Create room in ANSWERING_PHASE state
      const gameRoom = new Room({
        id: 'room-2',
        pin: '654321',
        hostId: 'host-socket-id',
        quizId: 'quiz-1',
        state: RoomState.ANSWERING_PHASE
      });

      const player = new Player({
        id: 'player-1',
        socketId: 'socket-1',
        nickname: 'TestPlayer',
        roomPin: '654321'
      });

      expect(() => gameRoom.addPlayer(player)).toThrow('Players can only join during lobby phase');
    });

    it('should throw error for duplicate nickname', () => {
      const player1 = new Player({
        id: 'player-1',
        socketId: 'socket-1',
        nickname: 'TestPlayer',
        roomPin: '123456'
      });
      const player2 = new Player({
        id: 'player-2',
        socketId: 'socket-2',
        nickname: 'testplayer',
        roomPin: '123456'
      });

      room.addPlayer(player1);

      expect(() => room.addPlayer(player2)).toThrow('Nickname already taken');
    });
  });

  describe('removePlayer', () => {
    it('should remove player by socket id', () => {
      const player = new Player({
        id: 'player-1',
        socketId: 'socket-1',
        nickname: 'TestPlayer',
        roomPin: '123456'
      });

      room.addPlayer(player);
      expect(room.getPlayerCount()).toBe(1);

      room.removePlayer('socket-1');
      expect(room.getPlayerCount()).toBe(0);
    });
  });

  describe('startGame', () => {
    beforeEach(() => {
      const player = new Player({
        id: 'player-1',
        socketId: 'socket-1',
        nickname: 'TestPlayer',
        roomPin: '123456'
      });
      room.addPlayer(player);
    });

    it('should allow starting game when called by host', () => {
      expect(() => room.startGame('host-socket-id')).not.toThrow();
    });

    it('should throw error when called by non-host', () => {
      expect(() => room.startGame('player-socket-id')).toThrow('Only host can start the game');
    });

    it('should throw error when not in lobby state', () => {
      // Create room in different state
      const gameRoom = new Room({
        id: 'room-2',
        pin: '654321',
        hostId: 'host-socket-id',
        quizId: 'quiz-1',
        state: RoomState.ANSWERING_PHASE
      });

      expect(() => gameRoom.startGame('host-socket-id')).toThrow('Game can only start from lobby');
    });

    it('should throw error when no players', () => {
      room.removePlayer('socket-1');

      expect(() => room.startGame('host-socket-id')).toThrow('At least one player required');
    });
  });

  describe('setState', () => {
    it('should allow valid state transitions', () => {
      // WAITING_PLAYERS → QUESTION_INTRO
      room.setState(RoomState.QUESTION_INTRO);
      expect(room.state).toBe(RoomState.QUESTION_INTRO);

      // QUESTION_INTRO → ANSWERING_PHASE
      room.setState(RoomState.ANSWERING_PHASE);
      expect(room.state).toBe(RoomState.ANSWERING_PHASE);

      // ANSWERING_PHASE → SHOW_RESULTS
      room.setState(RoomState.SHOW_RESULTS);
      expect(room.state).toBe(RoomState.SHOW_RESULTS);

      // SHOW_RESULTS → LEADERBOARD
      room.setState(RoomState.LEADERBOARD);
      expect(room.state).toBe(RoomState.LEADERBOARD);
    });

    it('should throw error for invalid state transitions', () => {
      // Cannot go from WAITING_PLAYERS to PODIUM directly
      expect(() => room.setState(RoomState.PODIUM))
        .toThrow('Invalid state transition: WAITING_PLAYERS → PODIUM');

      // Cannot go from WAITING_PLAYERS to LEADERBOARD
      expect(() => room.setState(RoomState.LEADERBOARD))
        .toThrow('Invalid state transition: WAITING_PLAYERS → LEADERBOARD');
    });

    it('should not allow transition from terminal state PODIUM', () => {
      const podiumRoom = new Room({
        id: 'room-2',
        pin: '654321',
        hostId: 'host-socket-id',
        quizId: 'quiz-1',
        state: RoomState.PODIUM
      });

      expect(() => podiumRoom.setState(RoomState.WAITING_PLAYERS))
        .toThrow('Invalid state transition: PODIUM → WAITING_PLAYERS');
    });
  });

  describe('nextQuestion', () => {
    let leaderboardRoom;

    beforeEach(() => {
      leaderboardRoom = new Room({
        id: 'room-2',
        pin: '654321',
        hostId: 'host-socket-id',
        quizId: 'quiz-1',
        state: RoomState.LEADERBOARD
      });
    });

    it('should advance to next question when called by host', () => {
      const hasMore = leaderboardRoom.nextQuestion('host-socket-id', 5);

      expect(hasMore).toBe(true);
      expect(leaderboardRoom.currentQuestionIndex).toBe(1);
      expect(leaderboardRoom.state).toBe(RoomState.QUESTION_INTRO);
    });

    it('should return false and go to podium on last question', () => {
      leaderboardRoom.currentQuestionIndex = 4;

      const hasMore = leaderboardRoom.nextQuestion('host-socket-id', 5);

      expect(hasMore).toBe(false);
      expect(leaderboardRoom.state).toBe(RoomState.PODIUM);
    });

    it('should throw error when called by non-host', () => {
      expect(() => leaderboardRoom.nextQuestion('player-socket-id', 5))
        .toThrow('Only host can advance questions');
    });
  });

  describe('getLeaderboard', () => {
    it('should return players sorted by score descending', () => {
      const player1 = new Player({ id: '1', socketId: 's1', nickname: 'Alice', roomPin: '123456' });
      const player2 = new Player({ id: '2', socketId: 's2', nickname: 'Bob', roomPin: '123456' });
      const player3 = new Player({ id: '3', socketId: 's3', nickname: 'Charlie', roomPin: '123456' });

      player1.addScore(500);
      player2.addScore(1000);
      player3.addScore(750);

      room.addPlayer(player1);
      room.addPlayer(player2);
      room.addPlayer(player3);

      const leaderboard = room.getLeaderboard();

      expect(leaderboard[0].nickname).toBe('Bob');
      expect(leaderboard[1].nickname).toBe('Charlie');
      expect(leaderboard[2].nickname).toBe('Alice');
    });
  });

  describe('getPodium', () => {
    it('should return top 3 players', () => {
      for (let i = 0; i < 5; i++) {
        const player = new Player({ id: `${i}`, socketId: `s${i}`, nickname: `P${i}`, roomPin: '123456' });
        player.addScore(i * 100);
        room.addPlayer(player);
      }

      const podium = room.getPodium();

      expect(podium.length).toBe(3);
      expect(podium[0].nickname).toBe('P4');
      expect(podium[1].nickname).toBe('P3');
      expect(podium[2].nickname).toBe('P2');
    });
  });

  describe('reconnectPlayer with grace period', () => {
    let player;

    beforeEach(() => {
      player = new Player({
        id: 'player-1',
        socketId: 'socket-1',
        nickname: 'TestPlayer',
        roomPin: '123456',
        playerToken: 'token-123'
      });
      room.addPlayer(player);
    });

    it('should allow reconnection within grace period', () => {
      player.setDisconnected();

      const reconnected = room.reconnectPlayer('token-123', 'new-socket', 120000);

      expect(reconnected).toBe(player);
      expect(player.socketId).toBe('new-socket');
      expect(player.isDisconnected()).toBe(false);
    });

    it('should throw error when grace period exceeded', () => {
      // Simulate disconnection 3 minutes ago
      player.disconnectedAt = new Date(Date.now() - 180000);

      expect(() => room.reconnectPlayer('token-123', 'new-socket', 120000))
        .toThrow('Reconnection timeout expired');
    });

    it('should allow reconnection when grace period is null', () => {
      // Simulate disconnection 10 minutes ago
      player.disconnectedAt = new Date(Date.now() - 600000);

      const reconnected = room.reconnectPlayer('token-123', 'new-socket', null);

      expect(reconnected).toBe(player);
      expect(player.isDisconnected()).toBe(false);
    });

    it('should allow reconnection when player never disconnected', () => {
      const reconnected = room.reconnectPlayer('token-123', 'new-socket', 120000);

      expect(reconnected).toBe(player);
      expect(player.socketId).toBe('new-socket');
    });
  });

  describe('removeStaleDisconnectedPlayers', () => {
    beforeEach(() => {
      const player1 = new Player({
        id: 'player-1',
        socketId: 'socket-1',
        nickname: 'Player1',
        roomPin: '123456'
      });
      const player2 = new Player({
        id: 'player-2',
        socketId: 'socket-2',
        nickname: 'Player2',
        roomPin: '123456'
      });
      const player3 = new Player({
        id: 'player-3',
        socketId: 'socket-3',
        nickname: 'Player3',
        roomPin: '123456'
      });

      room.addPlayer(player1);
      room.addPlayer(player2);
      room.addPlayer(player3);
    });

    it('should remove players disconnected longer than grace period', () => {
      const player1 = room.getPlayer('socket-1');
      const player2 = room.getPlayer('socket-2');

      // Player1 disconnected 3 minutes ago
      player1.disconnectedAt = new Date(Date.now() - 180000);
      // Player2 disconnected 1 minute ago
      player2.disconnectedAt = new Date(Date.now() - 60000);
      // Player3 is still connected

      const removed = room.removeStaleDisconnectedPlayers(120000); // 2 min grace

      expect(removed.length).toBe(1);
      expect(removed[0].id).toBe('player-1');
      expect(room.getPlayerCount()).toBe(2);
      expect(room.getPlayer('socket-1')).toBeNull();
      expect(room.getPlayer('socket-2')).not.toBeNull();
    });

    it('should return empty array when no stale players', () => {
      const removed = room.removeStaleDisconnectedPlayers(120000);

      expect(removed.length).toBe(0);
      expect(room.getPlayerCount()).toBe(3);
    });
  });

  describe('getDisconnectedPlayers', () => {
    beforeEach(() => {
      const player1 = new Player({
        id: 'player-1',
        socketId: 'socket-1',
        nickname: 'Player1',
        roomPin: '123456'
      });
      const player2 = new Player({
        id: 'player-2',
        socketId: 'socket-2',
        nickname: 'Player2',
        roomPin: '123456'
      });

      room.addPlayer(player1);
      room.addPlayer(player2);
    });

    it('should return only disconnected players', () => {
      const player1 = room.getPlayer('socket-1');
      player1.setDisconnected();

      const disconnected = room.getDisconnectedPlayers();

      expect(disconnected.length).toBe(1);
      expect(disconnected[0].id).toBe('player-1');
    });

    it('should return empty array when no disconnected players', () => {
      const disconnected = room.getDisconnectedPlayers();

      expect(disconnected.length).toBe(0);
    });
  });

  // ==================== HOST DISCONNECT/RECONNECT ====================

  describe('host disconnect and reconnect', () => {
    it('should track host disconnection', () => {
      expect(room.isHostDisconnected()).toBe(false);

      room.setHostDisconnected();

      expect(room.isHostDisconnected()).toBe(true);
      expect(room.hostDisconnectedAt).toBeInstanceOf(Date);
    });

    it('should calculate host disconnected duration', () => {
      expect(room.getHostDisconnectedDuration()).toBe(0);

      room.setHostDisconnected();

      expect(room.getHostDisconnectedDuration()).toBeGreaterThanOrEqual(0);
    });

    it('should allow host reconnection with valid token', () => {
      const roomWithToken = new Room({
        id: 'room-1',
        pin: '123456',
        hostId: 'old-socket',
        hostToken: 'host-token-123',
        quizId: 'quiz-1'
      });

      roomWithToken.setHostDisconnected();
      roomWithToken.reconnectHost('new-socket', 'host-token-123');

      expect(roomWithToken.hostId).toBe('new-socket');
      expect(roomWithToken.isHostDisconnected()).toBe(false);
    });

    it('should throw error for invalid host token', () => {
      const roomWithToken = new Room({
        id: 'room-1',
        pin: '123456',
        hostId: 'old-socket',
        hostToken: 'host-token-123',
        quizId: 'quiz-1'
      });

      expect(() => roomWithToken.reconnectHost('new-socket', 'wrong-token'))
        .toThrow('Invalid host token');
    });

    it('should throw error when grace period exceeded', () => {
      const roomWithToken = new Room({
        id: 'room-1',
        pin: '123456',
        hostId: 'old-socket',
        hostToken: 'host-token-123',
        quizId: 'quiz-1'
      });

      roomWithToken.hostDisconnectedAt = new Date(Date.now() - 600000); // 10 min ago

      expect(() => roomWithToken.reconnectHost('new-socket', 'host-token-123', 300000))
        .toThrow('Host reconnection timeout expired');
    });
  });

  // ==================== KICK/BAN ====================

  describe('kickPlayer', () => {
    let player;

    beforeEach(() => {
      player = new Player({
        id: 'player-1',
        socketId: 'socket-1',
        nickname: 'TestPlayer',
        roomPin: '123456'
      });
      room.addPlayer(player);
    });

    it('should kick player when called by host', () => {
      const kicked = room.kickPlayer('player-1', 'host-socket-id');

      expect(kicked).toBe(player);
      expect(room.getPlayerCount()).toBe(0);
    });

    it('should throw error when called by non-host', () => {
      expect(() => room.kickPlayer('player-1', 'other-socket'))
        .toThrow('Only host can kick players');
    });

    it('should throw error for non-existent player', () => {
      expect(() => room.kickPlayer('non-existent', 'host-socket-id'))
        .toThrow('Player not found');
    });
  });

  describe('banPlayer', () => {
    let player;

    beforeEach(() => {
      player = new Player({
        id: 'player-1',
        socketId: 'socket-1',
        nickname: 'TestPlayer',
        roomPin: '123456'
      });
      room.addPlayer(player);
    });

    it('should ban player and add nickname to ban list', () => {
      const banned = room.banPlayer('player-1', 'host-socket-id');

      expect(banned).toBe(player);
      expect(room.getPlayerCount()).toBe(0);
      expect(room.isNicknameBanned('TestPlayer')).toBe(true);
      expect(room.isNicknameBanned('testplayer')).toBe(true); // case insensitive
    });

    it('should prevent banned nickname from rejoining', () => {
      room.banPlayer('player-1', 'host-socket-id');

      const newPlayer = new Player({
        id: 'player-2',
        socketId: 'socket-2',
        nickname: 'TestPlayer',
        roomPin: '123456'
      });

      expect(() => room.addPlayer(newPlayer))
        .toThrow('This nickname is banned from this room');
    });
  });

  describe('unbanNickname', () => {
    beforeEach(() => {
      const player = new Player({
        id: 'player-1',
        socketId: 'socket-1',
        nickname: 'TestPlayer',
        roomPin: '123456'
      });
      room.addPlayer(player);
      room.banPlayer('player-1', 'host-socket-id');
    });

    it('should unban nickname when called by host', () => {
      expect(room.isNicknameBanned('TestPlayer')).toBe(true);

      room.unbanNickname('TestPlayer', 'host-socket-id');

      expect(room.isNicknameBanned('TestPlayer')).toBe(false);
    });

    it('should throw error when called by non-host', () => {
      expect(() => room.unbanNickname('TestPlayer', 'other-socket'))
        .toThrow('Only host can unban players');
    });
  });

  describe('getBannedNicknames', () => {
    it('should return list of banned nicknames', () => {
      const player1 = new Player({ id: 'p1', socketId: 's1', nickname: 'Alice', roomPin: '123456' });
      const player2 = new Player({ id: 'p2', socketId: 's2', nickname: 'Bob', roomPin: '123456' });
      room.addPlayer(player1);
      room.addPlayer(player2);

      room.banPlayer('p1', 'host-socket-id');
      room.banPlayer('p2', 'host-socket-id');

      const banned = room.getBannedNicknames();

      expect(banned).toContain('alice');
      expect(banned).toContain('bob');
      expect(banned.length).toBe(2);
    });
  });

  // ==================== SPECTATORS ====================

  describe('addSpectator', () => {
    it('should add spectator to room', () => {
      const spectator = new Spectator({
        id: 'spectator-1',
        socketId: 'spec-socket-1',
        nickname: 'Viewer',
        roomPin: '123456'
      });

      room.addSpectator(spectator);

      expect(room.getSpectatorCount()).toBe(1);
      expect(room.getSpectator('spec-socket-1')).toBe(spectator);
    });

    it('should throw error for duplicate nickname with player', () => {
      const player = new Player({
        id: 'player-1',
        socketId: 'socket-1',
        nickname: 'TestUser',
        roomPin: '123456'
      });
      room.addPlayer(player);

      const spectator = new Spectator({
        id: 'spectator-1',
        socketId: 'spec-socket-1',
        nickname: 'TestUser',
        roomPin: '123456'
      });

      expect(() => room.addSpectator(spectator))
        .toThrow('Nickname already taken');
    });

    it('should throw error for duplicate nickname with spectator', () => {
      const spectator1 = new Spectator({
        id: 'spectator-1',
        socketId: 'spec-socket-1',
        nickname: 'Viewer',
        roomPin: '123456'
      });
      const spectator2 = new Spectator({
        id: 'spectator-2',
        socketId: 'spec-socket-2',
        nickname: 'viewer',
        roomPin: '123456'
      });

      room.addSpectator(spectator1);

      expect(() => room.addSpectator(spectator2))
        .toThrow('Nickname already taken');
    });

    it('should throw error when max spectators reached', () => {
      for (let i = 0; i < Room.MAX_SPECTATORS; i++) {
        const spectator = new Spectator({
          id: `spec-${i}`,
          socketId: `spec-socket-${i}`,
          nickname: `Viewer${i}`,
          roomPin: '123456'
        });
        room.addSpectator(spectator);
      }

      const extraSpectator = new Spectator({
        id: 'spec-extra',
        socketId: 'spec-socket-extra',
        nickname: 'ExtraViewer',
        roomPin: '123456'
      });

      expect(() => room.addSpectator(extraSpectator))
        .toThrow(`Room is full (maximum ${Room.MAX_SPECTATORS} spectators)`);
    });
  });

  describe('removeSpectator', () => {
    it('should remove spectator by socket id', () => {
      const spectator = new Spectator({
        id: 'spectator-1',
        socketId: 'spec-socket-1',
        nickname: 'Viewer',
        roomPin: '123456'
      });

      room.addSpectator(spectator);
      expect(room.getSpectatorCount()).toBe(1);

      room.removeSpectator('spec-socket-1');
      expect(room.getSpectatorCount()).toBe(0);
    });
  });

  describe('spectator disconnect and reconnect', () => {
    let spectator;

    beforeEach(() => {
      spectator = new Spectator({
        id: 'spectator-1',
        socketId: 'spec-socket-1',
        nickname: 'Viewer',
        roomPin: '123456',
        spectatorToken: 'spec-token-123'
      });
      room.addSpectator(spectator);
    });

    it('should track spectator disconnection', () => {
      const disconnected = room.setSpectatorDisconnected('spec-socket-1');

      expect(disconnected).toBe(spectator);
      expect(spectator.isDisconnected()).toBe(true);
    });

    it('should reconnect spectator with valid token', () => {
      spectator.setDisconnected();

      const reconnected = room.reconnectSpectator('spec-token-123', 'new-socket', 120000);

      expect(reconnected).toBe(spectator);
      expect(spectator.socketId).toBe('new-socket');
      expect(spectator.isDisconnected()).toBe(false);
    });

    it('should throw error for invalid spectator token', () => {
      expect(() => room.reconnectSpectator('wrong-token', 'new-socket'))
        .toThrow('Invalid spectator token');
    });
  });

  describe('getDisconnectedSpectators', () => {
    it('should return only disconnected spectators', () => {
      const spectator1 = new Spectator({ id: 's1', socketId: 'ss1', nickname: 'V1', roomPin: '123456' });
      const spectator2 = new Spectator({ id: 's2', socketId: 'ss2', nickname: 'V2', roomPin: '123456' });

      room.addSpectator(spectator1);
      room.addSpectator(spectator2);

      spectator1.setDisconnected();

      const disconnected = room.getDisconnectedSpectators();

      expect(disconnected.length).toBe(1);
      expect(disconnected[0].id).toBe('s1');
    });
  });

  describe('removeStaleDisconnectedSpectators', () => {
    it('should remove spectators disconnected longer than grace period', () => {
      const spectator1 = new Spectator({ id: 's1', socketId: 'ss1', nickname: 'V1', roomPin: '123456' });
      const spectator2 = new Spectator({ id: 's2', socketId: 'ss2', nickname: 'V2', roomPin: '123456' });

      room.addSpectator(spectator1);
      room.addSpectator(spectator2);

      spectator1.disconnectedAt = new Date(Date.now() - 180000); // 3 min ago

      const removed = room.removeStaleDisconnectedSpectators(120000);

      expect(removed.length).toBe(1);
      expect(removed[0].id).toBe('s1');
      expect(room.getSpectatorCount()).toBe(1);
    });
  });

  // ==================== PAUSE/RESUME ====================

  describe('pause and resume', () => {
    let leaderboardRoom;

    beforeEach(() => {
      leaderboardRoom = new Room({
        id: 'room-2',
        pin: '654321',
        hostId: 'host-socket-id',
        quizId: 'quiz-1',
        state: RoomState.LEADERBOARD
      });
    });

    it('should pause game from leaderboard state', () => {
      leaderboardRoom.pause('host-socket-id');

      expect(leaderboardRoom.state).toBe(RoomState.PAUSED);
      expect(leaderboardRoom.isPaused()).toBe(true);
      expect(leaderboardRoom.pausedAt).toBeInstanceOf(Date);
      expect(leaderboardRoom.pausedFromState).toBe(RoomState.LEADERBOARD);
    });

    it('should throw error when pausing from non-leaderboard state', () => {
      expect(() => room.pause('host-socket-id'))
        .toThrow('Game can only be paused from leaderboard');
    });

    it('should throw error when non-host tries to pause', () => {
      expect(() => leaderboardRoom.pause('other-socket'))
        .toThrow('Only host can pause the game');
    });

    it('should resume game to previous state', () => {
      leaderboardRoom.pause('host-socket-id');
      leaderboardRoom.resume('host-socket-id');

      expect(leaderboardRoom.state).toBe(RoomState.LEADERBOARD);
      expect(leaderboardRoom.isPaused()).toBe(false);
      expect(leaderboardRoom.pausedAt).toBeNull();
    });

    it('should throw error when resuming non-paused game', () => {
      expect(() => leaderboardRoom.resume('host-socket-id'))
        .toThrow('Game is not paused');
    });

    it('should calculate pause duration', () => {
      leaderboardRoom.pause('host-socket-id');

      expect(leaderboardRoom.getPauseDuration()).toBeGreaterThanOrEqual(0);
    });
  });

  // ==================== QUIZ SNAPSHOT ====================

  describe('quiz snapshot', () => {
    let testQuiz;

    beforeEach(() => {
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
    });

    it('should set quiz snapshot', () => {
      expect(room.hasQuizSnapshot()).toBe(false);

      room.setQuizSnapshot(testQuiz);

      expect(room.hasQuizSnapshot()).toBe(true);
      expect(room.getQuizSnapshot()).toBe(testQuiz);
      expect(room.getGameStartedAt()).toBeInstanceOf(Date);
    });

    it('should throw error when setting snapshot twice', () => {
      room.setQuizSnapshot(testQuiz);

      expect(() => room.setQuizSnapshot(testQuiz))
        .toThrow('Quiz snapshot already set');
    });
  });

  // ==================== ANSWER DISTRIBUTION ====================

  describe('getAnswerDistribution', () => {
    beforeEach(() => {
      const player1 = new Player({ id: 'p1', socketId: 's1', nickname: 'P1', roomPin: '123456' });
      const player2 = new Player({ id: 'p2', socketId: 's2', nickname: 'P2', roomPin: '123456' });
      const player3 = new Player({ id: 'p3', socketId: 's3', nickname: 'P3', roomPin: '123456' });

      room.addPlayer(player1);
      room.addPlayer(player2);
      room.addPlayer(player3);

      player1.submitAnswer(0, 1000);
      player2.submitAnswer(1, 2000);
      player3.submitAnswer(1, 3000);
    });

    it('should return answer distribution', () => {
      const { distribution, correctCount } = room.getAnswerDistribution(4, (idx) => idx === 1);

      expect(distribution).toEqual([1, 2, 0, 0]);
      expect(correctCount).toBe(2);
    });
  });

  // ==================== ANSWER HISTORY ====================

  describe('recordAnswer and getAnswerHistory', () => {
    it('should record and retrieve answer history', () => {
      room.recordAnswer({
        playerId: 'player-1',
        playerNickname: 'TestPlayer',
        questionId: 'q1',
        answerIndex: 1,
        isCorrect: true,
        elapsedTimeMs: 1500,
        score: 900,
        streak: 1
      });

      const history = room.getAnswerHistory();

      expect(history.length).toBe(1);
      expect(history[0].playerNickname).toBe('TestPlayer');
      expect(history[0].isCorrect).toBe(true);
      expect(history[0].questionIndex).toBe(0);
    });

    it('should throw error for invalid answer data', () => {
      expect(() => room.recordAnswer(null))
        .toThrow('Answer data is required');

      expect(() => room.recordAnswer({ answerIndex: 0, isCorrect: true }))
        .toThrow('Player nickname is required for answer record');
    });
  });

  // ==================== PLAYER COUNTS ====================

  describe('player count methods', () => {
    beforeEach(() => {
      const player1 = new Player({ id: 'p1', socketId: 's1', nickname: 'P1', roomPin: '123456' });
      const player2 = new Player({ id: 'p2', socketId: 's2', nickname: 'P2', roomPin: '123456' });
      const player3 = new Player({ id: 'p3', socketId: 's3', nickname: 'P3', roomPin: '123456' });

      room.addPlayer(player1);
      room.addPlayer(player2);
      room.addPlayer(player3);
    });

    it('should return total player count', () => {
      expect(room.getPlayerCount()).toBe(3);
    });

    it('should return connected player count', () => {
      room.getPlayer('s1').setDisconnected();

      expect(room.getPlayerCount()).toBe(3);
      expect(room.getConnectedPlayerCount()).toBe(2);
    });

    it('should return all players as array', () => {
      const players = room.getAllPlayers();

      expect(players.length).toBe(3);
      expect(players).not.toBe(room.players); // Should be a copy
    });
  });

  // ==================== SPECTATOR COUNTS ====================

  describe('spectator count methods', () => {
    beforeEach(() => {
      const s1 = new Spectator({ id: 's1', socketId: 'ss1', nickname: 'V1', roomPin: '123456' });
      const s2 = new Spectator({ id: 's2', socketId: 'ss2', nickname: 'V2', roomPin: '123456' });

      room.addSpectator(s1);
      room.addSpectator(s2);
    });

    it('should return spectator count', () => {
      expect(room.getSpectatorCount()).toBe(2);
    });

    it('should return connected spectator count', () => {
      room.getSpectator('ss1').setDisconnected();

      expect(room.getSpectatorCount()).toBe(2);
      expect(room.getConnectedSpectatorCount()).toBe(1);
    });

    it('should check if socket is spectator', () => {
      expect(room.isSpectator('ss1')).toBe(true);
      expect(room.isSpectator('unknown')).toBe(false);
    });

    it('should return all spectators as array', () => {
      const spectators = room.getAllSpectators();

      expect(spectators.length).toBe(2);
      expect(spectators).not.toBe(room.spectators); // Should be a copy
    });
  });

  // ==================== ANSWER TRACKING ====================

  describe('haveAllPlayersAnswered', () => {
    beforeEach(() => {
      const player1 = new Player({ id: 'p1', socketId: 's1', nickname: 'P1', roomPin: '123456' });
      const player2 = new Player({ id: 'p2', socketId: 's2', nickname: 'P2', roomPin: '123456' });

      room.addPlayer(player1);
      room.addPlayer(player2);
    });

    it('should return false when not all answered', () => {
      room.getPlayer('s1').submitAnswer(0, 1000);

      expect(room.haveAllPlayersAnswered()).toBe(false);
    });

    it('should return true when all connected players answered', () => {
      room.getPlayer('s1').submitAnswer(0, 1000);
      room.getPlayer('s2').submitAnswer(1, 2000);

      expect(room.haveAllPlayersAnswered()).toBe(true);
    });

    it('should exclude disconnected players', () => {
      room.getPlayer('s1').submitAnswer(0, 1000);
      room.getPlayer('s2').setDisconnected();

      expect(room.haveAllPlayersAnswered()).toBe(true);
    });

    it('should return true for empty connected players', () => {
      room.getPlayer('s1').setDisconnected();
      room.getPlayer('s2').setDisconnected();

      expect(room.haveAllPlayersAnswered()).toBe(true);
    });
  });

  describe('getAnsweredCount', () => {
    beforeEach(() => {
      const player1 = new Player({ id: 'p1', socketId: 's1', nickname: 'P1', roomPin: '123456' });
      const player2 = new Player({ id: 'p2', socketId: 's2', nickname: 'P2', roomPin: '123456' });
      const player3 = new Player({ id: 'p3', socketId: 's3', nickname: 'P3', roomPin: '123456' });

      room.addPlayer(player1);
      room.addPlayer(player2);
      room.addPlayer(player3);
    });

    it('should return count of answered connected players', () => {
      room.getPlayer('s1').submitAnswer(0, 1000);
      room.getPlayer('s3').submitAnswer(2, 3000);

      expect(room.getAnsweredCount()).toBe(2);
    });

    it('should exclude disconnected players from count', () => {
      room.getPlayer('s1').submitAnswer(0, 1000);
      room.getPlayer('s1').setDisconnected();

      expect(room.getAnsweredCount()).toBe(0);
    });
  });

  describe('clearAllAnswerAttempts', () => {
    it('should clear all player answer attempts', () => {
      const player1 = new Player({ id: 'p1', socketId: 's1', nickname: 'P1', roomPin: '123456' });
      const player2 = new Player({ id: 'p2', socketId: 's2', nickname: 'P2', roomPin: '123456' });

      room.addPlayer(player1);
      room.addPlayer(player2);

      player1.submitAnswer(0, 1000);
      player2.submitAnswer(1, 2000);

      expect(room.getAnsweredCount()).toBe(2);

      room.clearAllAnswerAttempts();

      expect(room.getAnsweredCount()).toBe(0);
      expect(player1.hasAnswered()).toBe(false);
      expect(player2.hasAnswered()).toBe(false);
    });
  });

  // ==================== MAX PLAYERS ====================

  describe('MAX_PLAYERS limit', () => {
    it('should throw error when max players reached', () => {
      for (let i = 0; i < Room.MAX_PLAYERS; i++) {
        const player = new Player({
          id: `player-${i}`,
          socketId: `socket-${i}`,
          nickname: `Player${i}`,
          roomPin: '123456'
        });
        room.addPlayer(player);
      }

      const extraPlayer = new Player({
        id: 'extra',
        socketId: 'extra-socket',
        nickname: 'ExtraPlayer',
        roomPin: '123456'
      });

      expect(() => room.addPlayer(extraPlayer))
        .toThrow(`Room is full (maximum ${Room.MAX_PLAYERS} players)`);
    });
  });

  // ==================== STATIC CONSTANTS ====================

  describe('static constants', () => {
    it('should have MAX_PLAYERS defined', () => {
      expect(Room.MAX_PLAYERS).toBe(50);
    });

    it('should have MAX_SPECTATORS defined', () => {
      expect(Room.MAX_SPECTATORS).toBe(10);
    });
  });
});
