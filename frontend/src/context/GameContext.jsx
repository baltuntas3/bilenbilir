import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { socketService } from '../services/socketService';
import { useAuth } from './AuthContext';
import { showToast } from '../utils/toast';

const GameContext = createContext(null);

// Game states matching backend
export const GAME_STATES = {
  IDLE: 'IDLE',
  WAITING_PLAYERS: 'WAITING_PLAYERS',
  QUESTION_INTRO: 'QUESTION_INTRO',
  ANSWERING_PHASE: 'ANSWERING_PHASE',
  SHOW_RESULTS: 'SHOW_RESULTS',
  LEADERBOARD: 'LEADERBOARD',
  PODIUM: 'PODIUM',
  PAUSED: 'PAUSED',
};

const initialState = {
  roomPin: null,
  isHost: false,
  isSpectator: false,
  hostToken: null,
  playerToken: null,
  spectatorToken: null,
  playerId: null,
  spectatorId: null,
  nickname: null,
  gameState: GAME_STATES.IDLE,
  previousState: null, // State before pause
  players: [],
  spectators: [],
  bannedNicknames: [],
  currentQuestion: null,
  currentQuestionIndex: 0,
  totalQuestions: 0,
  timeLimit: 30,
  remainingTime: 0,
  score: 0,
  streak: 0,
  lastAnswer: null,
  leaderboard: [],
  podium: [],
  answerDistribution: null,
  correctAnswerIndex: null,
  answeredCount: 0,
  hasAnswered: false,
  quiz: null,
  isReconnecting: false,
  reactions: [],
  // Team mode
  teams: [],
  teamMode: false,
  teamLeaderboard: [],
  teamPodium: [],
  explanation: null,
  // Power-ups
  powerUps: { FIFTY_FIFTY: 1, DOUBLE_POINTS: 1, TIME_EXTENSION: 1 },
  eliminatedOptions: [],
  // Lightning round
  lightningRound: { enabled: false, questionCount: 3 },
  isLightning: false,
};

// Session storage keys
const SESSION_KEYS = {
  PIN: 'game_pin',
  HOST_TOKEN: 'game_host_token',
  PLAYER_TOKEN: 'game_player_token',
  SPECTATOR_TOKEN: 'game_spectator_token',
  ROLE: 'game_role', // 'host', 'player', 'spectator'
  NICKNAME: 'game_nickname',
};

// Save session to storage
const saveSession = (data) => {
  if (data.pin) sessionStorage.setItem(SESSION_KEYS.PIN, data.pin);
  if (data.hostToken) sessionStorage.setItem(SESSION_KEYS.HOST_TOKEN, data.hostToken);
  if (data.playerToken) sessionStorage.setItem(SESSION_KEYS.PLAYER_TOKEN, data.playerToken);
  if (data.spectatorToken) sessionStorage.setItem(SESSION_KEYS.SPECTATOR_TOKEN, data.spectatorToken);
  if (data.role) sessionStorage.setItem(SESSION_KEYS.ROLE, data.role);
  if (data.nickname) sessionStorage.setItem(SESSION_KEYS.NICKNAME, data.nickname);
};

// Get session from storage
const getSession = () => {
  const pin = sessionStorage.getItem(SESSION_KEYS.PIN);
  const hostToken = sessionStorage.getItem(SESSION_KEYS.HOST_TOKEN);
  const playerToken = sessionStorage.getItem(SESSION_KEYS.PLAYER_TOKEN);
  const spectatorToken = sessionStorage.getItem(SESSION_KEYS.SPECTATOR_TOKEN);
  const role = sessionStorage.getItem(SESSION_KEYS.ROLE);
  const nickname = sessionStorage.getItem(SESSION_KEYS.NICKNAME);

  if (!pin || !role) return null;

  return { pin, hostToken, playerToken, spectatorToken, role, nickname };
};

// Clear session from storage
const clearSession = () => {
  Object.values(SESSION_KEYS).forEach(key => sessionStorage.removeItem(key));
};

export function GameProvider({ children }) {
  const { getToken } = useAuth();
  const [state, setState] = useState(initialState);
  const timerRef = useRef(null);
  const endTimeRef = useRef(null);
  const listenersSetupRef = useRef(false);
  const lastSocketIdRef = useRef(null);

  // Update state helper
  const updateState = useCallback((updates) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  /**
   * Generic socket emit with response/error handling and timeout
   * Eliminates duplicated promise+timeout+cleanup pattern
   */
  const emitWithResponse = useCallback((emitEvent, emitData, responseEvent, timeoutMs = 10000) => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        socketService.off(responseEvent, onResponse);
        socketService.off('error', onError);
        reject(new Error(`${responseEvent} timed out`));
      }, timeoutMs);

      const onResponse = (response) => {
        clearTimeout(timeout);
        socketService.off(responseEvent, onResponse);
        socketService.off('error', onError);
        resolve(response);
      };

      const onError = ({ error }) => {
        clearTimeout(timeout);
        socketService.off(responseEvent, onResponse);
        socketService.off('error', onError);
        reject(new Error(error));
      };

      socketService.on(responseEvent, onResponse);
      socketService.on('error', onError);
      socketService.emit(emitEvent, emitData);
    });
  }, []);

  /**
   * Helper for host-only emit actions (no response expected)
   */
  const hostEmit = useCallback((event, extraData = {}) => {
    if (!state.isHost || !state.roomPin) {
      return Promise.reject(new Error('Not authorized'));
    }
    socketService.emit(event, { pin: state.roomPin, ...extraData });
    return Promise.resolve();
  }, [state.isHost, state.roomPin]);

  // Reset game state
  const resetGame = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    listenersSetupRef.current = false;
    lastSocketIdRef.current = null;
    clearSession();
    setState(initialState);
  }, []);

  // Timer management
  const startTimer = useCallback((duration, endTime) => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    endTimeRef.current = endTime;
    updateState({ remainingTime: duration, timeLimit: duration });

    timerRef.current = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((endTimeRef.current - now) / 1000));
      updateState({ remainingTime: remaining });

      if (remaining <= 0) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }, 100);
  }, [updateState]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Socket event handlers setup
  const setupSocketListeners = useCallback(() => {
    const currentSocketId = socketService.getSocketId();

    // If socket changed (e.g., after HMR or reconnect), reset the flag
    if (listenersSetupRef.current && lastSocketIdRef.current !== currentSocketId) {
      listenersSetupRef.current = false;
    }

    if (listenersSetupRef.current) {
      return;
    }

    listenersSetupRef.current = true;
    lastSocketIdRef.current = currentSocketId;

    // Player events
    socketService.on('player_joined', ({ player, playerCount }) => {
      setState((prev) => ({
        ...prev,
        players: [...prev.players.filter(p => p.id !== player.id), player],
      }));
    });

    socketService.on('player_left', ({ playerId, playerCount }) => {
      setState((prev) => ({
        ...prev,
        players: prev.players.filter((p) => p.id !== playerId),
      }));
    });

    socketService.on('you_were_kicked', ({ reason }) => {
      showToast.error(reason === 'banned' ? 'You have been banned from the game' : 'You have been kicked from the game');
      resetGame();
      socketService.disconnect();
    });

    // Kick/Ban feedback for host
    socketService.on('player_kicked', ({ playerId, nickname, playerCount }) => {
      showToast.success(`${nickname} was kicked`);
      setState((prev) => ({
        ...prev,
        players: prev.players.filter((p) => p.id !== playerId),
      }));
    });

    socketService.on('player_banned', ({ playerId, nickname, playerCount }) => {
      showToast.success(`${nickname} was banned`);
      setState((prev) => ({
        ...prev,
        players: prev.players.filter((p) => p.id !== playerId),
      }));
    });

    // Player reconnection events
    socketService.on('player_returned', ({ playerId, nickname }) => {
      showToast.info(`${nickname} reconnected`);
      setState((prev) => ({
        ...prev,
        players: prev.players.map((p) =>
          p.id === playerId ? { ...p, disconnectedAt: null } : p
        ),
      }));
    });

    // Spectator events
    socketService.on('spectator_joined', ({ spectator, spectatorCount }) => {
      setState((prev) => ({
        ...prev,
        spectators: [...prev.spectators.filter(s => s.id !== spectator.id), spectator],
      }));
    });

    socketService.on('spectator_left', ({ spectatorId, spectatorCount }) => {
      setState((prev) => ({
        ...prev,
        spectators: prev.spectators.filter((s) => s.id !== spectatorId),
      }));
    });

    socketService.on('spectator_returned', ({ spectatorId, nickname }) => {
      setState((prev) => ({
        ...prev,
        spectators: prev.spectators.map((s) =>
          s.id === spectatorId ? { ...s, disconnectedAt: null } : s
        ),
      }));
    });

    // Ban management
    socketService.on('nickname_unbanned', ({ nickname }) => {
      showToast.success(`${nickname} unbanned`);
      setState((prev) => ({
        ...prev,
        bannedNicknames: prev.bannedNicknames.filter((n) => n !== nickname),
      }));
    });

    socketService.on('banned_nicknames', ({ bannedNicknames }) => {
      updateState({ bannedNicknames });
    });

    // Team mode events
    socketService.on('team_mode_updated', ({ teamMode, teams }) => {
      updateState({ teamMode, teams });
    });

    socketService.on('teams_updated', ({ teams }) => {
      updateState({ teams });
    });

    // Lightning round
    socketService.on('lightning_round_updated', ({ enabled, questionCount }) => {
      updateState({ lightningRound: { enabled, questionCount } });
    });

    // Game flow events
    socketService.on('game_started', (data) => {
      const { totalQuestions, currentQuestion, questionIndex } = data || {};
      setState((prev) => ({
        ...prev,
        gameState: GAME_STATES.QUESTION_INTRO,
        totalQuestions: totalQuestions ?? prev.totalQuestions,
        currentQuestion: currentQuestion ?? prev.currentQuestion,
        currentQuestionIndex: questionIndex ?? 0,
        hasAnswered: false,
        lastAnswer: null,
        powerUps: { FIFTY_FIFTY: 1, DOUBLE_POINTS: 1, TIME_EXTENSION: 1 },
        eliminatedOptions: [],
      }));
    });

    socketService.on('question_intro', ({ questionIndex, totalQuestions, currentQuestion }) => {
      setState((prev) => ({
        ...prev,
        gameState: GAME_STATES.QUESTION_INTRO,
        currentQuestion: currentQuestion ?? prev.currentQuestion,
        currentQuestionIndex: questionIndex ?? 0,
        totalQuestions: totalQuestions ?? prev.totalQuestions,
        hasAnswered: false,
        lastAnswer: null,
        answeredCount: 0,
        answerDistribution: null,
        correctAnswerIndex: null,
        explanation: null,
        eliminatedOptions: [],
      }));
    });

    socketService.on('answering_started', ({ timeLimit, optionCount, isLightning }) => {
      // Timer will be started by timer_started event from GameTimerService
      updateState({
        gameState: GAME_STATES.ANSWERING_PHASE,
        timeLimit,
        isLightning: isLightning || false,
      });
    });

    socketService.on('answer_received', ({ isCorrect, score, totalScore, streak, streakBonus }) => {
      updateState({
        hasAnswered: true,
        lastAnswer: { isCorrect, score, streakBonus },
        score: totalScore,
        streak: isCorrect ? streak : 0,
      });
    });

    socketService.on('answer_count_updated', ({ answeredCount, totalPlayers }) => {
      updateState({ answeredCount });
    });

    socketService.on('all_players_answered', () => {
      // Host can proceed to end answering
    });

    socketService.on('show_results', ({ correctAnswerIndex, distribution, correctCount, totalPlayers, explanation }) => {
      stopTimer();
      updateState({
        gameState: GAME_STATES.SHOW_RESULTS,
        correctAnswerIndex,
        answerDistribution: distribution,
        answeredCount: totalPlayers,
        explanation: explanation || null,
      });
    });

    // Round ended - sent to players when host ends answering
    socketService.on('round_ended', ({ correctAnswerIndex, explanation }) => {
      stopTimer();
      updateState({
        gameState: GAME_STATES.SHOW_RESULTS,
        correctAnswerIndex,
        explanation: explanation || null,
      });
    });

    socketService.on('leaderboard', ({ leaderboard, teamLeaderboard }) => {
      const updates = {
        gameState: GAME_STATES.LEADERBOARD,
        leaderboard,
      };
      if (teamLeaderboard) {
        updates.teamLeaderboard = teamLeaderboard;
      }
      updateState(updates);
    });

    socketService.on('game_over', ({ podium, teamPodium }) => {
      const updates = {
        gameState: GAME_STATES.PODIUM,
        podium,
      };
      if (teamPodium) {
        updates.teamPodium = teamPodium;
      }
      updateState(updates);
    });

    socketService.on('final_results', ({ leaderboard, podium, teamLeaderboard, teamPodium }) => {
      const updates = {
        leaderboard,
        podium,
      };
      if (teamLeaderboard) {
        updates.teamLeaderboard = teamLeaderboard;
      }
      if (teamPodium) {
        updates.teamPodium = teamPodium;
      }
      updateState(updates);
    });

    // Power-up events
    socketService.on('fifty_fifty_result', ({ eliminatedOptions }) => {
      updateState({ eliminatedOptions });
    });

    socketService.on('power_up_activated', ({ type }) => {
      const labels = { DOUBLE_POINTS: 'Çift Puan', TIME_EXTENSION: 'Süre Uzatma' };
      showToast.success((labels[type] || type) + ' aktif!');
    });

    socketService.on('power_up_used', ({ nickname, powerUpType }) => {
      const labels = { FIFTY_FIFTY: '50:50', DOUBLE_POINTS: 'Çift Puan', TIME_EXTENSION: 'Süre Uzatma' };
      showToast.info(nickname + ' joker kullandı: ' + (labels[powerUpType] || powerUpType));
    });

    socketService.on('time_extended', ({ extraTimeMs }) => {
      // Extend the local timer end time
      if (endTimeRef.current) {
        endTimeRef.current += extraTimeMs;
      }
    });

    // Timer events
    socketService.on('timer_started', ({ duration, durationMs, endTime, serverTime }) => {
      // Adjust endTime for network latency
      const adjustedEndTime = endTime + (Date.now() - serverTime);
      startTimer(duration, adjustedEndTime);
    });

    socketService.on('timer_tick', ({ remainingMs }) => {
      // Server tick - use for sync if needed
    });

    socketService.on('time_expired', () => {
      stopTimer();
      updateState({ remainingTime: 0 });
    });

    socketService.on('timer_sync', ({ remainingMs, endTime, serverTime }) => {
      const adjustedEndTime = endTime + (Date.now() - serverTime);
      const remaining = Math.ceil(remainingMs / 1000);
      startTimer(remaining, adjustedEndTime);
    });

    // Pause/Resume
    socketService.on('game_paused', ({ pausedAt }) => {
      stopTimer();
      setState((prev) => ({
        ...prev,
        previousState: prev.gameState,
        gameState: GAME_STATES.PAUSED,
      }));
      showToast.info('Game paused by host');
    });

    socketService.on('game_resumed', ({ state: resumedState, pauseDuration }) => {
      setState((prev) => ({
        ...prev,
        gameState: resumedState || prev.previousState || GAME_STATES.LEADERBOARD,
        previousState: null,
      }));
      showToast.info('Game resumed');
    });

    // Live reactions
    socketService.on('reaction_received', ({ nickname, reaction, timestamp }) => {
      const id = `${timestamp}-${Math.random().toString(36).slice(2, 7)}`;
      setState((prev) => {
        const newReactions = [...prev.reactions, { id, nickname, reaction, timestamp }];
        // Keep max 20 visible reactions
        return {
          ...prev,
          reactions: newReactions.length > 20 ? newReactions.slice(-20) : newReactions,
        };
      });
    });

    // Room closed
    socketService.on('room_closed', ({ reason } = {}) => {
      const message = reason === 'Host reconnection timeout'
        ? 'The game was closed because the host did not reconnect'
        : 'The game has been closed by the host';
      showToast.info(message);
      resetGame();
      socketService.disconnect();
    });

    // Host disconnected - notify players
    socketService.on('host_disconnected', ({ message }) => {
      showToast.warning(message || 'Host disconnected. Waiting for reconnection...');
    });

    // Host disconnection warning with countdown
    socketService.on('host_disconnected_warning', ({ remainingSeconds, message }) => {
      showToast.warning(`${message} (${remainingSeconds}s remaining)`);
    });

    // Host returned after disconnection
    socketService.on('host_returned', () => {
      showToast.success('Host has reconnected!');
    });

    // Error handling
    socketService.on('error', ({ error, message }) => {
      showToast.error(error || message || 'An error occurred');
    });
  }, [updateState, startTimer, stopTimer, resetGame]);

  // Connect to socket and wait for connection
  const connectSocket = useCallback(async (token = null) => {
    await socketService.connect(token);
    setupSocketListeners();
  }, [setupSocketListeners]);

  // Create room (host)
  const createRoom = useCallback(async (quizId) => {
    const token = getToken();
    if (!token) {
      throw new Error('You must be logged in to host a game');
    }

    await connectSocket(token);

    const response = await emitWithResponse(
      'create_room', { quizId },
      'room_created'
    );

    saveSession({
      pin: response.pin,
      hostToken: response.hostToken,
      role: 'host',
    });

    updateState({
      roomPin: response.pin,
      isHost: true,
      hostToken: response.hostToken,
      gameState: GAME_STATES.WAITING_PLAYERS,
      totalQuestions: response.totalQuestions,
      quiz: {
        title: response.quizTitle,
        questionCount: response.totalQuestions,
      },
      players: [],
    });

    return response;
  }, [getToken, connectSocket, updateState, emitWithResponse]);

  // Join room (player)
  const joinRoom = useCallback(async (pin, nickname) => {
    await connectSocket();

    const response = await emitWithResponse(
      'join_room', { pin, nickname },
      'room_joined'
    );

    saveSession({
      pin: response.pin,
      playerToken: response.playerToken,
      role: 'player',
      nickname: response.nickname || nickname,
    });

    updateState({
      roomPin: response.pin,
      isHost: false,
      playerId: response.playerId,
      playerToken: response.playerToken,
      nickname: response.nickname || nickname,
      gameState: GAME_STATES.WAITING_PLAYERS,
      players: [],
    });

    return response;
  }, [connectSocket, updateState, emitWithResponse]);

  // Leave room
  const leaveRoom = useCallback(() => {
    if (state.roomPin) {
      socketService.emit('leave_room', { pin: state.roomPin });
    }
    resetGame();
    socketService.disconnect();
  }, [state.roomPin, resetGame]);

  // Close room (host only)
  const closeRoom = useCallback(() => {
    return new Promise((resolve) => {
      if (!state.isHost || !state.roomPin) {
        resolve();
        return;
      }

      socketService.emit('close_room', { pin: state.roomPin });
      resetGame();
      socketService.disconnect();
      resolve();
    });
  }, [state.isHost, state.roomPin, resetGame]);

  // Get host's existing room
  const getMyRoom = useCallback(async () => {
    const token = getToken();
    if (!token) return null;

    await connectSocket(token);

    try {
      return await emitWithResponse('get_my_room', {}, 'my_room', 5000);
    } catch {
      return null;
    }
  }, [getToken, connectSocket, emitWithResponse]);

  // Force close existing room (to create a new one)
  const forceCloseExistingRoom = useCallback(async () => {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');

    await connectSocket(token);
    return emitWithResponse('force_close_room', {}, 'room_force_closed', 5000);
  }, [getToken, connectSocket, emitWithResponse]);

  // Start game (host only) - accepts optional questionCount
  const startGame = useCallback((questionCount) => {
    const extraData = questionCount ? { questionCount } : {};
    return hostEmit('start_game', extraData);
  }, [hostEmit]);

  // Start answering phase (host only)
  const startAnswering = useCallback(() => hostEmit('start_answering'), [hostEmit]);

  // Submit answer (player only)
  const submitAnswer = useCallback((answerIndex) => {
    return new Promise((resolve, reject) => {
      if (state.isHost || !state.roomPin || state.hasAnswered) {
        reject(new Error('Cannot submit answer'));
        return;
      }

      socketService.emit('submit_answer', { pin: state.roomPin, answerIndex });
      resolve();
    });
  }, [state.isHost, state.roomPin, state.hasAnswered]);

  // Use power-up (player only)
  const usePowerUp = useCallback((type) => {
    if (!state.roomPin || state.isHost || state.hasAnswered) return;
    socketService.emit('use_power_up', { pin: state.roomPin, powerUpType: type });
    // Optimistically decrement local power-up count
    setState((prev) => ({
      ...prev,
      powerUps: {
        ...prev.powerUps,
        [type]: Math.max(0, (prev.powerUps[type] || 0) - 1),
      },
    }));
  }, [state.roomPin, state.isHost, state.hasAnswered]);

  // End answering (host only)
  const endAnswering = useCallback(() => hostEmit('end_answering'), [hostEmit]);

  // Show leaderboard (host only)
  const showLeaderboard = useCallback(() => hostEmit('show_leaderboard'), [hostEmit]);

  // Next question (host only)
  const nextQuestion = useCallback(() => hostEmit('next_question'), [hostEmit]);

  // Kick player (host only)
  const kickPlayer = useCallback((playerId) => {
    const result = hostEmit('kick_player', { playerId });
    setState((prev) => ({
      ...prev,
      players: prev.players.filter((p) => p.id !== playerId),
    }));
    return result;
  }, [hostEmit]);

  // Ban player (host only)
  const banPlayer = useCallback((playerId) => {
    const result = hostEmit('ban_player', { playerId });
    setState((prev) => ({
      ...prev,
      players: prev.players.filter((p) => p.id !== playerId),
    }));
    return result;
  }, [hostEmit]);

  // Get players
  const getPlayers = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!state.roomPin) {
        reject(new Error('Not in a room'));
        return;
      }

      const onPlayersList = (response) => {
        socketService.off('players_list', onPlayersList);
        updateState({ players: response.players });
        resolve(response.players);
      };

      socketService.on('players_list', onPlayersList);
      socketService.emit('get_players', { pin: state.roomPin });
    });
  }, [state.roomPin, updateState]);

  // ==================== RECONNECTION ====================

  // Reconnect as host
  const reconnectHost = useCallback(async (pin, hostToken) => {
    const token = getToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    await connectSocket(token);

    const response = await emitWithResponse(
      'reconnect_host', { pin, hostToken },
      'host_reconnected'
    );

    updateState({
      roomPin: response.pin,
      isHost: true,
      hostToken,
      gameState: response.state,
      currentQuestionIndex: response.currentQuestionIndex,
    });

    return response;
  }, [getToken, connectSocket, updateState, emitWithResponse]);

  // Reconnect as player
  const reconnectPlayer = useCallback(async (pin, playerToken) => {
    await connectSocket();

    const response = await emitWithResponse(
      'reconnect_player', { pin, playerToken },
      'player_reconnected'
    );

    updateState({
      roomPin: response.pin,
      isHost: false,
      playerId: response.playerId,
      playerToken: response.playerToken,
      nickname: response.nickname,
      score: response.score,
      gameState: response.state,
      currentQuestionIndex: response.currentQuestionIndex,
    });

    // Handle timer sync if in answering phase
    if (response.timerSync && response.state === GAME_STATES.ANSWERING_PHASE) {
      const adjustedEndTime = response.timerSync.endTime + (Date.now() - response.timerSync.serverTime);
      startTimer(response.timerSync.remaining, adjustedEndTime);
    }

    return response;
  }, [connectSocket, updateState, startTimer, emitWithResponse]);

  // ==================== PAUSE/RESUME ====================

  // Pause game (host only)
  const pauseGame = useCallback(() => hostEmit('pause_game'), [hostEmit]);

  // Resume game (host only)
  const resumeGame = useCallback(() => hostEmit('resume_game'), [hostEmit]);

  // ==================== SPECTATOR ====================

  // Join as spectator
  const joinAsSpectator = useCallback(async (pin, nickname) => {
    await connectSocket();

    const response = await emitWithResponse(
      'join_as_spectator', { pin, nickname },
      'room_joined_spectator'
    );

    saveSession({
      pin: response.pin,
      spectatorToken: response.spectatorToken,
      role: 'spectator',
      nickname: response.nickname,
    });

    updateState({
      roomPin: response.pin,
      isHost: false,
      isSpectator: true,
      spectatorId: response.spectatorId,
      spectatorToken: response.spectatorToken,
      nickname: response.nickname,
      gameState: response.state,
    });

    return response;
  }, [connectSocket, updateState, emitWithResponse]);

  // Leave as spectator
  const leaveSpectator = useCallback(() => {
    if (state.roomPin) {
      socketService.emit('leave_spectator', { pin: state.roomPin });
    }
    resetGame();
    socketService.disconnect();
  }, [state.roomPin, resetGame]);

  // Reconnect as spectator
  const reconnectSpectator = useCallback(async (pin, spectatorToken) => {
    await connectSocket();

    const response = await emitWithResponse(
      'reconnect_spectator', { pin, spectatorToken },
      'spectator_reconnected'
    );

    updateState({
      roomPin: response.pin,
      isHost: false,
      isSpectator: true,
      spectatorId: response.spectatorId,
      spectatorToken: response.spectatorToken,
      nickname: response.nickname,
      gameState: response.state,
    });

    return response;
  }, [connectSocket, updateState, emitWithResponse]);

  // Get spectators
  const getSpectators = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!state.roomPin) {
        reject(new Error('Not in a room'));
        return;
      }

      const onSpectatorsList = (response) => {
        socketService.off('spectators_list', onSpectatorsList);
        updateState({ spectators: response.spectators });
        resolve(response.spectators);
      };

      socketService.on('spectators_list', onSpectatorsList);
      socketService.emit('get_spectators', { pin: state.roomPin });
    });
  }, [state.roomPin, updateState]);

  // ==================== BAN MANAGEMENT ====================

  // Unban nickname (host only)
  const unbanNickname = useCallback((nickname) => hostEmit('unban_nickname', { nickname }), [hostEmit]);

  // Get banned nicknames
  const getBannedNicknames = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!state.roomPin) {
        reject(new Error('Not in a room'));
        return;
      }

      const onBannedNicknames = (response) => {
        socketService.off('banned_nicknames', onBannedNicknames);
        updateState({ bannedNicknames: response.bannedNicknames });
        resolve(response.bannedNicknames);
      };

      socketService.on('banned_nicknames', onBannedNicknames);
      socketService.emit('get_banned_nicknames', { pin: state.roomPin });
    });
  }, [state.roomPin, updateState]);

  // ==================== TEAM MODE ====================

  // Enable team mode (host only)
  const enableTeamMode = useCallback(() => hostEmit('enable_team_mode'), [hostEmit]);

  // Disable team mode (host only)
  const disableTeamMode = useCallback(() => hostEmit('disable_team_mode'), [hostEmit]);

  // Add team (host only)
  const addTeam = useCallback((name) => hostEmit('add_team', { name }), [hostEmit]);

  // Remove team (host only)
  const removeTeam = useCallback((teamId) => hostEmit('remove_team', { teamId }), [hostEmit]);

  // Assign player to team (host only)
  const assignTeam = useCallback((playerId, teamId) => hostEmit('assign_team', { playerId, teamId }), [hostEmit]);

  // Lightning round (host only)
  const setLightningRound = useCallback((enabled, questionCount) => hostEmit('set_lightning_round', { enabled, questionCount }), [hostEmit]);

  // ==================== TIMER & RESULTS ====================

  // Request timer sync
  const requestTimerSync = useCallback(() => {
    if (!state.roomPin) return;
    socketService.emit('request_timer_sync', { pin: state.roomPin });
  }, [state.roomPin]);

  // Get final results
  const getResults = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!state.roomPin) {
        reject(new Error('Not in a room'));
        return;
      }

      const onFinalResults = (response) => {
        socketService.off('final_results', onFinalResults);
        updateState({
          leaderboard: response.leaderboard,
          podium: response.podium,
        });
        resolve(response);
      };

      socketService.on('final_results', onFinalResults);
      socketService.emit('get_results', { pin: state.roomPin });
    });
  }, [state.roomPin, updateState]);

  // Send reaction
  const sendReaction = useCallback((reaction) => {
    if (!state.roomPin) return;
    socketService.emit('send_reaction', { pin: state.roomPin, reaction });
  }, [state.roomPin]);

  // Auto-cleanup: remove reactions older than 3 seconds
  useEffect(() => {
    if (state.reactions.length === 0) return;

    const interval = setInterval(() => {
      const now = Date.now();
      setState((prev) => {
        const filtered = prev.reactions.filter(r => now - r.timestamp < 3000);
        if (filtered.length === prev.reactions.length) return prev;
        return { ...prev, reactions: filtered };
      });
    }, 500);

    return () => clearInterval(interval);
  }, [state.reactions.length]);

  // Auto-reconnection logic - reuses the reconnect functions above
  useEffect(() => {
    const attemptReconnection = async () => {
      const session = getSession();
      if (!session) return;

      updateState({ isReconnecting: true });
      showToast.info('Reconnecting...');

      try {
        if (session.role === 'host' && session.hostToken && getToken()) {
          await reconnectHost(session.pin, session.hostToken);
          updateState({ isReconnecting: false });
          showToast.success('Reconnected as host!');
        } else if (session.role === 'player' && session.playerToken) {
          await reconnectPlayer(session.pin, session.playerToken);
          updateState({ isReconnecting: false });
          showToast.success('Reconnected to game!');
        } else if (session.role === 'spectator' && session.spectatorToken) {
          await reconnectSpectator(session.pin, session.spectatorToken);
          updateState({ isReconnecting: false });
          showToast.success('Reconnected as spectator!');
        }
      } catch (error) {
        showToast.error('Failed to reconnect: ' + error.message);
        clearSession();
        updateState({ isReconnecting: false });
      }
    };

    socketService.setReconnectCallback(() => {
      attemptReconnection();
    });

    socketService.setDisconnectCallback((reason) => {
      if (state.roomPin && reason !== 'io client disconnect') {
        showToast.warning('Connection lost. Attempting to reconnect...');
      }
    });

    const session = getSession();
    if (session && !state.roomPin) {
      attemptReconnection();
    }
  }, [getToken, reconnectHost, reconnectPlayer, reconnectSpectator, updateState, state.roomPin]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTimer();
      socketService.removeAllListeners();
      socketService.disconnect();
    };
  }, [stopTimer]);

  const value = {
    ...state,
    // Room management
    createRoom,
    joinRoom,
    leaveRoom,
    closeRoom,
    getMyRoom,
    forceCloseExistingRoom,
    // Game flow
    startGame,
    startAnswering,
    submitAnswer,
    usePowerUp,
    endAnswering,
    showLeaderboard,
    nextQuestion,
    // Player management
    kickPlayer,
    banPlayer,
    getPlayers,
    // Reconnection
    reconnectHost,
    reconnectPlayer,
    // Pause/Resume
    pauseGame,
    resumeGame,
    // Spectator
    joinAsSpectator,
    leaveSpectator,
    reconnectSpectator,
    getSpectators,
    // Ban management
    unbanNickname,
    getBannedNicknames,
    // Team mode
    enableTeamMode,
    disableTeamMode,
    addTeam,
    removeTeam,
    assignTeam,
    // Lightning round
    setLightningRound,
    // Timer & Results
    requestTimerSync,
    getResults,
    // Reactions
    sendReaction,
    // Utils
    resetGame,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
}
