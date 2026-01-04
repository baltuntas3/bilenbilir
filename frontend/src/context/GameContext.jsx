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
  const { token } = useAuth();
  const [state, setState] = useState(initialState);
  const timerRef = useRef(null);
  const endTimeRef = useRef(null);

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
    // Player events
    socketService.on('player_joined', ({ player, playerCount }) => {
      updateState((prev) => ({
        players: [...prev.players.filter(p => p.id !== player.id), player],
      }));
    });

    socketService.on('player_left', ({ playerId, playerCount }) => {
      setState((prev) => ({
        ...prev,
        players: prev.players.filter((p) => p.id !== playerId),
      }));
    });

    socketService.on('kicked', () => {
      showToast.error('You have been kicked from the game');
      resetGame();
      socketService.disconnect();
    });

    socketService.on('banned', () => {
      showToast.error('You have been banned from the game');
      resetGame();
      socketService.disconnect();
    });

    // Game flow events
    socketService.on('game_started', ({ totalQuestions, currentQuestion, questionIndex }) => {
      updateState({
        gameState: GAME_STATES.QUESTION_INTRO,
        totalQuestions,
        currentQuestion,
        currentQuestionIndex: questionIndex,
        hasAnswered: false,
        lastAnswer: null,
      });
    });

    socketService.on('question_intro', ({ questionIndex, currentQuestion }) => {
      updateState({
        gameState: GAME_STATES.QUESTION_INTRO,
        currentQuestion,
        currentQuestionIndex: questionIndex,
        hasAnswered: false,
        lastAnswer: null,
        answeredCount: 0,
        answerDistribution: null,
        correctAnswerIndex: null,
      });
    });

    socketService.on('answering_started', ({ timeLimit, optionCount, endTime, serverTime }) => {
      const adjustedEndTime = endTime + (Date.now() - serverTime);
      startTimer(timeLimit, adjustedEndTime);
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
    socketService.on('timer_started', ({ duration, endTime, serverTime }) => {
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
    socketService.on('room_closed', () => {
      showToast.info('The game has been closed by the host');
      resetGame();
    });

    // Error handling
    socketService.on('error', ({ message }) => {
      showToast.error(message);
    });
  }, [updateState, startTimer, stopTimer, resetGame]);

  // Connect to socket
  const connectSocket = useCallback(() => {
    socketService.connect(token);
    setupSocketListeners();
  }, [token, setupSocketListeners]);

  // Create room (host)
  const createRoom = useCallback((quizId) => {
    return new Promise((resolve, reject) => {
      connectSocket();

      socketService.createRoom(quizId, (response) => {
        if (response.error) {
          reject(new Error(response.error));
          return;
        }

        updateState({
          roomPin: response.pin,
          isHost: true,
          hostToken: response.hostToken,
          gameState: GAME_STATES.WAITING_PLAYERS,
          quiz: response.quiz,
          players: [],
        });

        resolve(response);
      });
    });
  }, [connectSocket, updateState]);

  // Join room (player)
  const joinRoom = useCallback((pin, nickname) => {
    return new Promise((resolve, reject) => {
      connectSocket();

      socketService.joinRoom(pin, nickname, (response) => {
        if (response.error) {
          reject(new Error(response.error));
          return;
        }

        updateState({
          roomPin: pin,
          isHost: false,
          playerId: response.playerId,
          playerToken: response.playerToken,
          nickname,
          gameState: GAME_STATES.WAITING_PLAYERS,
          players: response.players || [],
        });

        resolve(response);
      });
    });
  }, [connectSocket, updateState]);

  // Leave room
  const leaveRoom = useCallback(() => {
    if (state.roomPin) {
      socketService.leaveRoom(state.roomPin);
    }
    resetGame();
    socketService.disconnect();
  }, [state.roomPin, resetGame]);

  // Close room (host only)
  const closeRoom = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!state.isHost || !state.roomPin) {
        reject(new Error('Not authorized'));
        return;
      }

      socketService.closeRoom(state.roomPin, (response) => {
        if (response.error) {
          reject(new Error(response.error));
          return;
        }

        resetGame();
        socketService.disconnect();
        resolve(response);
      });
    });
  }, [state.isHost, state.roomPin, resetGame]);

  // Start game (host only)
  const startGame = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!state.isHost || !state.roomPin) {
        reject(new Error('Not authorized'));
        return;
      }

      socketService.startGame(state.roomPin, (response) => {
        if (response.error) {
          reject(new Error(response.error));
          return;
        }
        resolve(response);
      });
    });
  }, [state.isHost, state.roomPin]);

  // Start answering phase (host only)
  const startAnswering = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!state.isHost || !state.roomPin) {
        reject(new Error('Not authorized'));
        return;
      }

      socketService.startAnswering(state.roomPin, (response) => {
        if (response.error) {
          reject(new Error(response.error));
          return;
        }
        resolve(response);
      });
    });
  }, [state.isHost, state.roomPin]);

  // Submit answer (player only)
  const submitAnswer = useCallback((answerIndex) => {
    return new Promise((resolve, reject) => {
      if (state.isHost || !state.roomPin || state.hasAnswered) {
        reject(new Error('Cannot submit answer'));
        return;
      }

      socketService.submitAnswer(state.roomPin, answerIndex, (response) => {
        if (response.error) {
          reject(new Error(response.error));
          return;
        }
        resolve(response);
      });
    });
  }, [state.isHost, state.roomPin, state.hasAnswered]);

  // End answering (host only)
  const endAnswering = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!state.isHost || !state.roomPin) {
        reject(new Error('Not authorized'));
        return;
      }

      socketService.endAnswering(state.roomPin, (response) => {
        if (response.error) {
          reject(new Error(response.error));
          return;
        }
        resolve(response);
      });
    });
  }, [state.isHost, state.roomPin]);

  // Show leaderboard (host only)
  const showLeaderboard = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!state.isHost || !state.roomPin) {
        reject(new Error('Not authorized'));
        return;
      }

      socketService.showLeaderboard(state.roomPin, (response) => {
        if (response.error) {
          reject(new Error(response.error));
          return;
        }
        resolve(response);
      });
    });
  }, [state.isHost, state.roomPin]);

  // Next question (host only)
  const nextQuestion = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!state.isHost || !state.roomPin) {
        reject(new Error('Not authorized'));
        return;
      }

      socketService.nextQuestion(state.roomPin, (response) => {
        if (response.error) {
          reject(new Error(response.error));
          return;
        }
        resolve(response);
      });
    });
  }, [state.isHost, state.roomPin]);

  // Kick player (host only)
  const kickPlayer = useCallback((playerId) => {
    return new Promise((resolve, reject) => {
      if (!state.isHost || !state.roomPin) {
        reject(new Error('Not authorized'));
        return;
      }

      socketService.kickPlayer(state.roomPin, playerId, (response) => {
        if (response.error) {
          reject(new Error(response.error));
          return;
        }
        setState((prev) => ({
          ...prev,
          players: prev.players.filter((p) => p.id !== playerId),
        }));
        resolve(response);
      });
    });
  }, [state.isHost, state.roomPin]);

  // Ban player (host only)
  const banPlayer = useCallback((playerId) => {
    return new Promise((resolve, reject) => {
      if (!state.isHost || !state.roomPin) {
        reject(new Error('Not authorized'));
        return;
      }

      socketService.banPlayer(state.roomPin, playerId, (response) => {
        if (response.error) {
          reject(new Error(response.error));
          return;
        }
        setState((prev) => ({
          ...prev,
          players: prev.players.filter((p) => p.id !== playerId),
        }));
        resolve(response);
      });
    });
  }, [state.isHost, state.roomPin]);

  // Get players
  const getPlayers = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!state.roomPin) {
        reject(new Error('Not in a room'));
        return;
      }

      socketService.getPlayers(state.roomPin, (response) => {
        if (response.error) {
          reject(new Error(response.error));
          return;
        }
        updateState({ players: response.players });
        resolve(response.players);
      });
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
