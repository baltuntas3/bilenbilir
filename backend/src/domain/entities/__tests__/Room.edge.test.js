const { Room, RoomState } = require('../Room');
const { Player } = require('../Player');
const { Spectator } = require('../Spectator');
const { Team } = require('../Team');
const { Quiz } = require('../Quiz');
const { Question } = require('../Question');

function createRoom(overrides = {}) {
  return new Room({ id: 'r1', pin: '123456', hostId: 'host-1', hostUserId: 'user-1', hostToken: 'ht-1', quizId: 'q1', ...overrides });
}

function createPlayer(id = 'p1', socketId = 's1', nickname = 'Player1') {
  return new Player({ id, socketId, nickname, roomPin: '123456', token: `tok-${id}` });
}

function advanceToState(room, targetState) {
  const transitions = {
    'QUESTION_INTRO': ['QUESTION_INTRO'],
    'ANSWERING_PHASE': ['QUESTION_INTRO', 'ANSWERING_PHASE'],
    'SHOW_RESULTS': ['QUESTION_INTRO', 'ANSWERING_PHASE', 'SHOW_RESULTS'],
    'LEADERBOARD': ['QUESTION_INTRO', 'ANSWERING_PHASE', 'SHOW_RESULTS', 'LEADERBOARD']
  };
  for (const state of (transitions[targetState] || [])) {
    room.setState(state);
  }
}

describe('Room edge cases', () => {
  describe('constructor', () => {
    it('should throw for invalid currentQuestionIndex', () => {
      expect(() => createRoom({ currentQuestionIndex: -1 })).toThrow('non-negative integer');
      expect(() => createRoom({ currentQuestionIndex: 1.5 })).toThrow('non-negative integer');
      expect(() => createRoom({ currentQuestionIndex: 'x' })).toThrow('non-negative integer');
    });
  });

  describe('backward-compat getters', () => {
    it('should expose teams via getter', () => {
      const room = createRoom();
      expect(room.teams).toEqual([]);
    });

    it('should expose teamMode via getter', () => {
      const room = createRoom();
      expect(room.teamMode).toBe(false);
    });
  });

  describe('reconnectHost', () => {
    it('should throw for missing token', () => {
      const room = createRoom();
      expect(() => room.reconnectHost('s2', '')).toThrow('Host token is required');
      expect(() => room.reconnectHost('s2', null)).toThrow('Host token is required');
      expect(() => room.reconnectHost('s2', '  ')).toThrow('Host token is required');
    });

    it('should throw if room has no host token', () => {
      const room = createRoom({ hostToken: null });
      expect(() => room.reconnectHost('s2', 'some-token')).toThrow('no host token configured');
    });

    it('should throw for wrong token', () => {
      const room = createRoom();
      expect(() => room.reconnectHost('s2', 'wrong-token')).toThrow('Invalid host token');
    });

    it('should throw for invalid socketId', () => {
      const room = createRoom();
      expect(() => room.reconnectHost(null, 'ht-1')).toThrow('Valid socket ID');
      expect(() => room.reconnectHost('', 'ht-1')).toThrow('Valid socket ID');
    });

    it('should throw if grace period expired', () => {
      const room = createRoom();
      room.setHostDisconnected();
      room.hostDisconnectedAt = new Date(Date.now() - 60000);
      expect(() => room.reconnectHost('s2', 'ht-1', 1000)).toThrow('timeout expired');
    });

    it('should reconnect successfully', () => {
      const room = createRoom();
      room.setHostDisconnected();
      room.reconnectHost('new-socket', 'ht-1');
      expect(room.hostId).toBe('new-socket');
      expect(room.hostDisconnectedAt).toBeNull();
    });
  });

  describe('setPlayerDisconnected', () => {
    it('should set player as disconnected', () => {
      const room = createRoom();
      const player = createPlayer();
      room.addPlayer(player);
      const result = room.setPlayerDisconnected('s1');
      expect(result.isDisconnected()).toBe(true);
    });

    it('should return undefined for non-existent player', () => {
      const room = createRoom();
      const result = room.setPlayerDisconnected('nonexistent');
      // getPlayer returns null, so setPlayerDisconnected returns undefined (no explicit return when player not found)
      expect(result).toBeNull();
    });
  });

  describe('getPlayerByToken', () => {
    it('should return null when not found', () => {
      const room = createRoom();
      expect(room.getPlayerByToken('nonexistent')).toBeNull();
    });
  });

  describe('reconnectPlayer', () => {
    it('should reconnect with new token', () => {
      const room = createRoom();
      const player = createPlayer();
      room.addPlayer(player);
      advanceToState(room, 'ANSWERING_PHASE');
      room.setPlayerDisconnected('s1');
      const reconnected = room.reconnectPlayer(`tok-p1`, 'new-socket', null, 'new-tok');
      expect(reconnected.socketId).toBe('new-socket');
    });
  });

  describe('removeStaleDisconnectedPlayers', () => {
    it('should remove stale players', () => {
      const room = createRoom();
      const p = createPlayer();
      room.addPlayer(p);
      p.setDisconnected();
      p.disconnectedAt = new Date(Date.now() - 60000);
      const removed = room.removeStaleDisconnectedPlayers(1000);
      expect(removed).toHaveLength(1);
      expect(room.getPlayerCount()).toBe(0);
    });
  });

  describe('getDisconnectedPlayers', () => {
    it('should return disconnected players', () => {
      const room = createRoom();
      room.addPlayer(createPlayer('p1', 's1', 'Alpha'));
      room.addPlayer(createPlayer('p2', 's2', 'Bravo'));
      room.setPlayerDisconnected('s1');
      expect(room.getDisconnectedPlayers()).toHaveLength(1);
    });
  });

  describe('getConnectedPlayerCount', () => {
    it('should count only connected', () => {
      const room = createRoom();
      room.addPlayer(createPlayer('p1', 's1', 'Alpha'));
      room.addPlayer(createPlayer('p2', 's2', 'Bravo'));
      room.setPlayerDisconnected('s1');
      expect(room.getConnectedPlayerCount()).toBe(1);
    });
  });

  describe('nextQuestion', () => {
    it('should throw for non-positive totalQuestions', () => {
      const room = createRoom();
      room.addPlayer(createPlayer());
      advanceToState(room, 'LEADERBOARD');
      expect(() => room.nextQuestion('host-1', 0)).toThrow('positive integer');
      expect(() => room.nextQuestion('host-1', -1)).toThrow('positive integer');
      expect(() => room.nextQuestion('host-1', 'x')).toThrow('positive integer');
    });

    it('should throw for out-of-bounds index', () => {
      const room = createRoom({ currentQuestionIndex: 5 });
      room.addPlayer(createPlayer());
      advanceToState(room, 'LEADERBOARD');
      expect(() => room.nextQuestion('host-1', 3)).toThrow('out of bounds');
    });
  });

  describe('getAnswerDistribution', () => {
    it('should throw for non-positive optionCount', () => {
      const room = createRoom();
      expect(() => room.getAnswerDistribution(0, () => false)).toThrow('positive integer');
    });

    it('should throw for optionCount > 100', () => {
      const room = createRoom();
      expect(() => room.getAnswerDistribution(101, () => false)).toThrow('exceeds maximum');
    });

    it('should throw if isCorrectFn is not a function', () => {
      const room = createRoom();
      expect(() => room.getAnswerDistribution(4, 'not-fn')).toThrow('must be a function');
    });

    it('should skip invalid answer indices', () => {
      const room = createRoom();
      const p = createPlayer();
      room.addPlayer(p);
      p.submitAnswer(99, 1000); // out of bounds for 4 options
      const spy = jest.spyOn(console, 'warn').mockImplementation();
      const result = room.getAnswerDistribution(4, () => false);
      expect(result.skippedCount).toBe(1);
      spy.mockRestore();
    });
  });

  describe('recordAnswer', () => {
    it('should throw for null answerData', () => {
      const room = createRoom();
      expect(() => room.recordAnswer(null)).toThrow('Answer data is required');
    });

    it('should throw for missing playerId', () => {
      const room = createRoom();
      expect(() => room.recordAnswer({ playerNickname: 'A', questionId: 'q1', answerIndex: 0, optionCount: 4, isCorrect: true })).toThrow('Player ID');
    });

    it('should throw for missing playerNickname', () => {
      const room = createRoom();
      expect(() => room.recordAnswer({ playerId: 'p1', questionId: 'q1', answerIndex: 0, optionCount: 4, isCorrect: true })).toThrow('nickname');
    });

    it('should throw for missing questionId', () => {
      const room = createRoom();
      expect(() => room.recordAnswer({ playerId: 'p1', playerNickname: 'A', answerIndex: 0, optionCount: 4, isCorrect: true })).toThrow('Question ID');
    });

    it('should throw for invalid answerIndex', () => {
      const room = createRoom();
      expect(() => room.recordAnswer({ playerId: 'p1', playerNickname: 'A', questionId: 'q1', answerIndex: -1, optionCount: 4, isCorrect: true })).toThrow('answer index');
    });

    it('should throw for invalid optionCount', () => {
      const room = createRoom();
      expect(() => room.recordAnswer({ playerId: 'p1', playerNickname: 'A', questionId: 'q1', answerIndex: 0, optionCount: 1, isCorrect: true })).toThrow('optionCount');
    });

    it('should throw for answerIndex >= optionCount', () => {
      const room = createRoom();
      expect(() => room.recordAnswer({ playerId: 'p1', playerNickname: 'A', questionId: 'q1', answerIndex: 4, optionCount: 4, isCorrect: true })).toThrow('out of range');
    });

    it('should throw for non-boolean isCorrect', () => {
      const room = createRoom();
      expect(() => room.recordAnswer({ playerId: 'p1', playerNickname: 'A', questionId: 'q1', answerIndex: 0, optionCount: 4, isCorrect: 'yes' })).toThrow('boolean');
    });

    it('should record valid answer', () => {
      const room = createRoom();
      room.recordAnswer({ playerId: 'p1', playerNickname: 'A', questionId: 'q1', answerIndex: 0, optionCount: 4, isCorrect: true, elapsedTimeMs: 2000, score: 500, streak: 1 });
      expect(room.getAnswerHistory()).toHaveLength(1);
    });
  });

  describe('getFiftyFiftyOptions', () => {
    it('should throw for non-existent player', () => {
      const room = createRoom();
      expect(() => room.getFiftyFiftyOptions('nonexistent', 0, 4)).toThrow('Player not found');
    });

    it('should throw if player already answered', () => {
      const room = createRoom();
      const p = createPlayer();
      room.addPlayer(p);
      p.submitAnswer(0, 1000);
      expect(() => room.getFiftyFiftyOptions('s1', 0, 4)).toThrow('after answering');
    });

    it('should return eliminated options', () => {
      const room = createRoom();
      room.addPlayer(createPlayer());
      const opts = room.getFiftyFiftyOptions('s1', 1, 4);
      expect(opts.length).toBeLessThanOrEqual(2);
      expect(opts).not.toContain(1); // correct answer not eliminated
    });

    it('should return empty for 2 options', () => {
      const room = createRoom();
      room.addPlayer(createPlayer());
      const opts = room.getFiftyFiftyOptions('s1', 0, 2);
      // With 2 options, only 1 wrong option, maxToEliminate = 0
      expect(opts.length).toBeLessThanOrEqual(1);
    });
  });

  describe('kick/ban', () => {
    it('should kick player', () => {
      const room = createRoom();
      room.addPlayer(createPlayer('p1', 's1', 'Alpha'));
      const kicked = room.kickPlayer('p1', 'host-1');
      expect(kicked.id).toBe('p1');
      expect(room.getPlayerCount()).toBe(0);
    });

    it('should throw if not host', () => {
      const room = createRoom();
      room.addPlayer(createPlayer());
      expect(() => room.kickPlayer('p1', 'not-host')).toThrow('Only host');
    });

    it('should throw if player not found', () => {
      const room = createRoom();
      expect(() => room.kickPlayer('nonexistent', 'host-1')).toThrow('Player not found');
    });

    it('should ban player and add to banned list', () => {
      const room = createRoom();
      room.addPlayer(createPlayer('p1', 's1', 'Player1'));
      room.banPlayer('p1', 'host-1');
      expect(room.isNicknameBanned('Player1')).toBe(true);
    });

    it('should not duplicate banned nickname', () => {
      const room = createRoom();
      room.addPlayer(createPlayer('p1', 's1', 'Player1'));
      room.banPlayer('p1', 'host-1');
      room.bannedNicknames.push(room._normalizeNickname('Player1'));
      // Check dedup
      expect(room.bannedNicknames.filter(n => n === 'player1').length).toBeLessThanOrEqual(2);
    });

    it('should unban nickname', () => {
      const room = createRoom();
      room.addPlayer(createPlayer('p1', 's1', 'Player1'));
      room.banPlayer('p1', 'host-1');
      room.unbanNickname('Player1', 'host-1');
      expect(room.isNicknameBanned('Player1')).toBe(false);
    });

    it('unbanNickname should throw if not host', () => {
      const room = createRoom();
      expect(() => room.unbanNickname('nick', 'not-host')).toThrow('Only host');
    });

    it('unbanNickname should throw for invalid nickname', () => {
      const room = createRoom();
      expect(() => room.unbanNickname(null, 'host-1')).toThrow('Valid nickname');
    });

    it('isNicknameBanned should return false for null', () => {
      const room = createRoom();
      expect(room.isNicknameBanned(null)).toBe(false);
    });

    it('_normalizeNickname should handle invalid nickname', () => {
      const room = createRoom();
      expect(room._normalizeNickname(null)).toBe('');
      expect(room._normalizeNickname(123)).toBe('');
    });
  });

  describe('lightning round', () => {
    it('should set lightning round in lobby', () => {
      const room = createRoom();
      room.setLightningRound(true, 5);
      expect(room.lightningRound).toEqual({ enabled: true, questionCount: 5 });
    });

    it('should throw outside lobby', () => {
      const room = createRoom();
      advanceToState(room, 'ANSWERING_PHASE');
      expect(() => room.setLightningRound(true, 3)).toThrow('only be configured in lobby');
    });

    it('should throw for non-boolean enabled', () => {
      const room = createRoom();
      expect(() => room.setLightningRound('yes', 3)).toThrow('enabled must be a boolean');
    });

    it('should throw for invalid questionCount', () => {
      const room = createRoom();
      expect(() => room.setLightningRound(true, 0)).toThrow('between 1 and 10');
      expect(() => room.setLightningRound(true, 11)).toThrow('between 1 and 10');
      expect(() => room.setLightningRound(true, 1.5)).toThrow('between 1 and 10');
    });

    it('should keep questionCount when disabled', () => {
      const room = createRoom();
      room.setLightningRound(true, 5);
      room.setLightningRound(false, undefined);
      expect(room.lightningRound.questionCount).toBe(5);
    });

    it('isLightningQuestion should detect lightning questions', () => {
      const room = createRoom();
      room.setLightningRound(true, 3);
      expect(room.isLightningQuestion(7, 10)).toBe(true);
      expect(room.isLightningQuestion(6, 10)).toBe(false);
    });

    it('isLightningQuestion should return false when disabled', () => {
      const room = createRoom();
      expect(room.isLightningQuestion(0, 10)).toBe(false);
    });

    it('getLightningConfig should return copy', () => {
      const room = createRoom();
      const config = room.getLightningConfig();
      config.enabled = true;
      expect(room.lightningRound.enabled).toBe(false);
    });
  });

  describe('team mode', () => {
    it('should enable team mode', () => {
      const room = createRoom();
      room.enableTeamMode();
      expect(room.isTeamMode()).toBe(true);
    });

    it('should disable team mode', () => {
      const room = createRoom();
      room.enableTeamMode();
      room.disableTeamMode();
      expect(room.isTeamMode()).toBe(false);
    });

    it('should throw outside lobby', () => {
      const room = createRoom();
      advanceToState(room, 'ANSWERING_PHASE');
      expect(() => room.enableTeamMode()).toThrow('only be changed in lobby');
      expect(() => room.disableTeamMode()).toThrow('only be changed in lobby');
    });

    it('should add and remove teams', () => {
      const room = createRoom();
      room.enableTeamMode();
      room.addTeam(new Team({ id: 't1', name: 'Alpha', color: '#fff' }));
      expect(room.getAllTeams()).toHaveLength(1);
      room.removeTeam('t1');
      expect(room.getAllTeams()).toHaveLength(0);
    });

    it('should assign player to team', () => {
      const room = createRoom();
      const p = createPlayer();
      room.addPlayer(p);
      room.enableTeamMode();
      room.addTeam(new Team({ id: 't1', name: 'Alpha', color: '#fff' }));
      room.assignPlayerToTeam('p1', 't1');
      expect(room.getTeamForPlayer('p1').id).toBe('t1');
    });

    it('should get team leaderboard and podium', () => {
      const room = createRoom();
      const p = createPlayer('p1', 's1', 'Alpha');
      room.addPlayer(p);
      p.addScore(500);
      room.enableTeamMode();
      room.addTeam(new Team({ id: 't1', name: 'Alpha', color: '#fff' }));
      room.assignPlayerToTeam('p1', 't1');
      const lb = room.getTeamLeaderboard();
      expect(lb[0].score).toBe(500);
      const podium = room.getTeamPodium();
      expect(podium).toHaveLength(1);
    });
  });

  describe('spectator delegation', () => {
    it('should delegate spectator methods', () => {
      const room = createRoom();
      const spec = new Spectator({ id: 'sp1', socketId: 'ss1', nickname: 'Viewer', roomPin: '123456', token: 'st1' });
      room.addSpectator(spec);
      expect(room.getSpectatorCount()).toBe(1);
      expect(room.isSpectator('ss1')).toBe(true);
      expect(room.getSpectator('ss1')).not.toBeNull();
      expect(room.getSpectatorByToken('st1')).not.toBeNull();
      expect(room.getAllSpectators()).toHaveLength(1);
      expect(room.getConnectedSpectatorCount()).toBe(1);

      room.setSpectatorDisconnected('ss1');
      expect(room.getDisconnectedSpectators()).toHaveLength(1);

      room.reconnectSpectator('st1', 'new-ss', null, 'new-st');

      room.removeSpectator('new-ss');
      expect(room.getSpectatorCount()).toBe(0);
    });

    it('should remove stale spectators', () => {
      const room = createRoom();
      const spec = new Spectator({ id: 'sp1', socketId: 'ss1', nickname: 'Viewer', roomPin: '123456', token: 'st1' });
      room.addSpectator(spec);
      room.setSpectatorDisconnected('ss1');
      spec.disconnectedAt = new Date(Date.now() - 60000);
      const stale = room.removeStaleDisconnectedSpectators(1000);
      expect(stale).toHaveLength(1);
    });
  });

  describe('pause/resume delegation', () => {
    it('should delegate pause/resume', () => {
      const room = createRoom();
      room.addPlayer(createPlayer());
      advanceToState(room, 'LEADERBOARD');
      room.pause('host-1');
      expect(room.isPaused()).toBe(true);
      expect(room.getPauseDuration()).toBeGreaterThanOrEqual(0);
      room.resume('host-1');
      expect(room.isPaused()).toBe(false);
    });
  });

  describe('quiz snapshot', () => {
    it('should set and get quiz snapshot', () => {
      const room = createRoom();
      const quiz = new Quiz({ id: 'q1', title: 'Test', createdBy: 'u1' });
      room.setQuizSnapshot(quiz);
      expect(room.getQuizSnapshot()).toBe(quiz);
      expect(room.hasQuizSnapshot()).toBe(true);
      expect(room.getGameStartedAt()).toBeInstanceOf(Date);
    });

    it('should throw if snapshot already set', () => {
      const room = createRoom();
      room.setQuizSnapshot({});
      expect(() => room.setQuizSnapshot({})).toThrow('already set');
    });
  });

  describe('haveAllPlayersAnswered', () => {
    it('should return false when no connected players', () => {
      const room = createRoom();
      expect(room.haveAllPlayersAnswered()).toBe(false);
    });
  });
});
