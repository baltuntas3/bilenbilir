const { Room, RoomState } = require('../Room');
const { Player } = require('../Player');

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
});
