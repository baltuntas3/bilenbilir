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
  hostToken: null,
  playerToken: null,
  playerId: null,
  nickname: null,
  gameState: GAME_STATES.IDLE,
  players: [],
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

  // Reset game state
  const resetGame = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    listenersSetupRef.current = false;
    lastSocketIdRef.current = null;
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
      }));
    });

    socketService.on('answering_started', ({ timeLimit, optionCount }) => {
      // Timer will be started by timer_started event from GameTimerService
      updateState({
        gameState: GAME_STATES.ANSWERING_PHASE,
        timeLimit,
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

    socketService.on('show_results', ({ correctAnswerIndex, distribution, correctCount, totalPlayers }) => {
      stopTimer();
      updateState({
        gameState: GAME_STATES.SHOW_RESULTS,
        correctAnswerIndex,
        answerDistribution: distribution,
        answeredCount: totalPlayers,
      });
    });

    socketService.on('leaderboard', ({ leaderboard }) => {
      updateState({
        gameState: GAME_STATES.LEADERBOARD,
        leaderboard,
      });
    });

    socketService.on('game_over', ({ podium }) => {
      updateState({
        gameState: GAME_STATES.PODIUM,
        podium,
      });
    });

    socketService.on('final_results', ({ leaderboard, podium }) => {
      updateState({
        leaderboard,
        podium,
      });
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
    socketService.on('game_paused', () => {
      updateState({ gameState: GAME_STATES.PAUSED });
    });

    socketService.on('game_resumed', ({ state: newState }) => {
      updateState({ gameState: newState });
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

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        socketService.off('room_created', onRoomCreated);
        reject(new Error('Room creation timed out'));
      }, 10000);

      const onRoomCreated = (response) => {
        clearTimeout(timeout);
        socketService.off('room_created', onRoomCreated);

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

        resolve(response);
      };

      socketService.on('room_created', onRoomCreated);
      socketService.emit('create_room', { quizId });
    });
  }, [getToken, connectSocket, updateState]);

  // Join room (player)
  const joinRoom = useCallback(async (pin, nickname) => {
    await connectSocket(); // No token needed for players

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        socketService.off('room_joined', onRoomJoined);
        reject(new Error('Join room timed out'));
      }, 10000);

      const onRoomJoined = (response) => {
        clearTimeout(timeout);
        socketService.off('room_joined', onRoomJoined);

        updateState({
          roomPin: response.pin,
          isHost: false,
          playerId: response.playerId,
          playerToken: response.playerToken,
          nickname: response.nickname || nickname,
          gameState: GAME_STATES.WAITING_PLAYERS,
          players: [],
        });

        resolve(response);
      };

      socketService.on('room_joined', onRoomJoined);
      socketService.emit('join_room', { pin, nickname });
    });
  }, [connectSocket, updateState]);

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
    if (!token) {
      return null;
    }

    await connectSocket(token);

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        socketService.off('my_room', onMyRoom);
        resolve(null);
      }, 5000);

      const onMyRoom = (room) => {
        clearTimeout(timeout);
        socketService.off('my_room', onMyRoom);
        resolve(room);
      };

      socketService.on('my_room', onMyRoom);
      socketService.emit('get_my_room');
    });
  }, [getToken, connectSocket]);

  // Force close existing room (to create a new one)
  const forceCloseExistingRoom = useCallback(async () => {
    const token = getToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    await connectSocket(token);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        socketService.off('room_force_closed', onClosed);
        reject(new Error('Force close timed out'));
      }, 5000);

      const onClosed = (result) => {
        clearTimeout(timeout);
        socketService.off('room_force_closed', onClosed);
        resolve(result);
      };

      socketService.on('room_force_closed', onClosed);
      socketService.emit('force_close_room');
    });
  }, [getToken, connectSocket]);

  // Start game (host only)
  const startGame = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!state.isHost || !state.roomPin) {
        reject(new Error('Not authorized'));
        return;
      }

      socketService.emit('start_game', { pin: state.roomPin });
      resolve();
    });
  }, [state.isHost, state.roomPin]);

  // Start answering phase (host only)
  const startAnswering = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!state.isHost || !state.roomPin) {
        reject(new Error('Not authorized'));
        return;
      }

      socketService.emit('start_answering', { pin: state.roomPin });
      resolve();
    });
  }, [state.isHost, state.roomPin]);

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

  // End answering (host only)
  const endAnswering = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!state.isHost || !state.roomPin) {
        reject(new Error('Not authorized'));
        return;
      }

      socketService.emit('end_answering', { pin: state.roomPin });
      resolve();
    });
  }, [state.isHost, state.roomPin]);

  // Show leaderboard (host only)
  const showLeaderboard = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!state.isHost || !state.roomPin) {
        reject(new Error('Not authorized'));
        return;
      }

      socketService.emit('show_leaderboard', { pin: state.roomPin });
      resolve();
    });
  }, [state.isHost, state.roomPin]);

  // Next question (host only)
  const nextQuestion = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!state.isHost || !state.roomPin) {
        reject(new Error('Not authorized'));
        return;
      }

      socketService.emit('next_question', { pin: state.roomPin });
      resolve();
    });
  }, [state.isHost, state.roomPin]);

  // Kick player (host only)
  const kickPlayer = useCallback((playerId) => {
    return new Promise((resolve, reject) => {
      if (!state.isHost || !state.roomPin) {
        reject(new Error('Not authorized'));
        return;
      }

      socketService.emit('kick_player', { pin: state.roomPin, playerId });
      setState((prev) => ({
        ...prev,
        players: prev.players.filter((p) => p.id !== playerId),
      }));
      resolve();
    });
  }, [state.isHost, state.roomPin]);

  // Ban player (host only)
  const banPlayer = useCallback((playerId) => {
    return new Promise((resolve, reject) => {
      if (!state.isHost || !state.roomPin) {
        reject(new Error('Not authorized'));
        return;
      }

      socketService.emit('ban_player', { pin: state.roomPin, playerId });
      setState((prev) => ({
        ...prev,
        players: prev.players.filter((p) => p.id !== playerId),
      }));
      resolve();
    });
  }, [state.isHost, state.roomPin]);

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
    createRoom,
    joinRoom,
    leaveRoom,
    closeRoom,
    getMyRoom,
    forceCloseExistingRoom,
    startGame,
    startAnswering,
    submitAnswer,
    endAnswering,
    showLeaderboard,
    nextQuestion,
    kickPlayer,
    banPlayer,
    getPlayers,
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
