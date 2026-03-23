import { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { socketService } from '../services/socketService';
import { useRoom, saveSession } from './RoomContext';
import { useTimer } from './TimerContext';
import { showToast } from '../utils/toast';

const GameContext = createContext(null);

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

const initialGameState = {
  gameState: GAME_STATES.IDLE,
  previousState: null,
  currentQuestion: null,
  currentQuestionIndex: 0,
  totalQuestions: 0,
  score: 0,
  streak: 0,
  lastAnswer: null,
  leaderboard: [],
  podium: [],
  answerDistribution: null,
  correctAnswerIndex: null,
  answeredCount: 0,
  totalPlayersInPhase: 0,
  hasAnswered: false,
  reactions: [],
  teamLeaderboard: [],
  teamPodium: [],
  explanation: null,
  powerUps: { FIFTY_FIFTY: 1, DOUBLE_POINTS: 1, TIME_EXTENSION: 1 },
  eliminatedOptions: [],
  isLightning: false,
};

export function GameProvider({ children }) {
  const room = useRoom();
  const timer = useTimer();
  const [state, setState] = useState(initialGameState);
  const listenersSetupRef = useRef(false);
  const lastSocketIdRef = useRef(null);
  const timerRef = useRef(timer);

  timerRef.current = timer;

  const updateState = useCallback((updates) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  const roomRef = useRef(room);
  roomRef.current = room;

  const resetGame = useCallback(() => {
    timerRef.current.resetTimer();
    listenersSetupRef.current = false;
    lastSocketIdRef.current = null;
    roomRef.current.resetRoom();
    setState(initialGameState);
  }, []);

  // Clean up game-specific socket listeners
  const cleanupGameListeners = useCallback(() => {
    // Only clean up events owned by GameContext — NOT events shared with RoomContext
    // (player_kicked, player_banned, player_returned, spectator_returned, nickname_unbanned
    //  are managed by RoomContext to prevent cleanup conflicts)
    const gameEvents = [
      'you_were_kicked', 'player_reconnected', 'game_started', 'question_intro',
      'answering_started', 'answer_received', 'answer_count_updated', 'all_players_answered',
      'show_results', 'round_ended', 'leaderboard', 'game_over', 'final_results',
      'fifty_fifty_result', 'power_up_activated', 'power_up_used', 'time_extended',
      'timer_started', 'timer_tick', 'time_expired', 'timer_sync',
      'game_paused', 'game_resumed', 'reaction_received', 'room_closed',
      'host_disconnected', 'host_disconnected_warning', 'host_returned', 'error'
    ];
    gameEvents.forEach(event => socketService.off(event));
  }, []);

  // Socket event handlers
  const setupSocketListeners = useCallback(() => {
    const currentSocketId = socketService.getSocketId();
    if (listenersSetupRef.current && lastSocketIdRef.current === currentSocketId) return;

    // Always cleanup before re-attaching to prevent listener accumulation
    cleanupGameListeners();
    listenersSetupRef.current = true;
    lastSocketIdRef.current = currentSocketId;

    // Kick handler — only 'you_were_kicked' is game-specific.
    // Other player/spectator events (player_kicked, player_banned, player_returned,
    // spectator_returned, nickname_unbanned) are handled by RoomContext to avoid
    // duplicate listeners and cleanup conflicts.
    socketService.on('you_were_kicked', ({ reason }) => {
      showToast.error(reason === 'banned' ? 'You have been banned from the game' : 'You have been kicked from the game');
      resetGame();
      socketService.disconnect();
    });

    // Restore game state on player reconnect
    socketService.on('player_reconnected', (data) => {
      const { state, score, streak, powerUps, eliminatedOptions, hasAnswered, currentQuestionIndex, totalQuestions, currentQuestion, timerSync, playerToken } = data || {};
      const updates = {};
      if (state && GAME_STATES[state]) updates.gameState = state;
      if (typeof score === 'number') updates.score = score;
      if (typeof streak === 'number') updates.streak = streak;
      if (powerUps) updates.powerUps = powerUps;
      if (eliminatedOptions && eliminatedOptions.length > 0) updates.eliminatedOptions = eliminatedOptions;
      if (typeof hasAnswered === 'boolean') updates.hasAnswered = hasAnswered;
      if (typeof currentQuestionIndex === 'number') updates.currentQuestionIndex = currentQuestionIndex;
      if (typeof totalQuestions === 'number') updates.totalQuestions = totalQuestions;
      if (currentQuestion) updates.currentQuestion = currentQuestion;
      if (Object.keys(updates).length > 0) updateState(updates);

      // Restore timer if in answering phase
      if (timerSync && timerSync.remainingMs > 0) {
        try {
          const adjustedEndTime = timerSync.endTime + (Date.now() - timerSync.serverTime);
          timerRef.current.startTimer(Math.ceil(timerSync.remainingMs / 1000), adjustedEndTime);
        } catch { /* timer may be unavailable */ }
      }

      // Save rotated token to session storage
      if (playerToken) {
        roomRef.current.updateRoomState({ playerToken });
        saveSession({ playerToken });
      }
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
        isLightning: false,
      }));
    });

    socketService.on('answering_started', ({ timeLimit, isLightning }) => {
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
      const updates = { answeredCount };
      if (typeof totalPlayers === 'number') updates.totalPlayersInPhase = totalPlayers;
      updateState(updates);
    });
    socketService.on('all_players_answered', () => { /* auto-transition to show_results follows */ });

    socketService.on('show_results', ({ correctAnswerIndex, distribution, correctCount, answeredCount, totalPlayers, explanation }) => {
      try { timerRef.current.stopTimer(); } catch { /* timer may be unavailable */ }
      updateState({
        gameState: GAME_STATES.SHOW_RESULTS,
        correctAnswerIndex,
        answerDistribution: distribution,
        answeredCount: answeredCount ?? totalPlayers,
        explanation: explanation || null,
      });
    });

    socketService.on('round_ended', ({ correctAnswerIndex, explanation }) => {
      try { timerRef.current.stopTimer(); } catch { /* timer may be unavailable */ }
      updateState({
        gameState: GAME_STATES.SHOW_RESULTS,
        correctAnswerIndex,
        explanation: explanation || null,
      });
    });

    socketService.on('leaderboard', ({ leaderboard, teamLeaderboard }) => {
      const updates = { gameState: GAME_STATES.LEADERBOARD, leaderboard };
      if (teamLeaderboard) updates.teamLeaderboard = teamLeaderboard;
      updateState(updates);
    });

    socketService.on('game_over', ({ podium, teamPodium }) => {
      const updates = { gameState: GAME_STATES.PODIUM, podium };
      if (teamPodium) updates.teamPodium = teamPodium;
      updateState(updates);
    });

    socketService.on('final_results', ({ leaderboard, podium, teamLeaderboard, teamPodium }) => {
      const updates = { leaderboard, podium, gameState: GAME_STATES.PODIUM };
      if (teamLeaderboard) updates.teamLeaderboard = teamLeaderboard;
      if (teamPodium) updates.teamPodium = teamPodium;
      updateState(updates);
    });

    // Power-up events
    socketService.on('fifty_fifty_result', ({ eliminatedOptions }) => updateState({ eliminatedOptions }));
    socketService.on('power_up_activated', ({ type }) => {
      const labels = { DOUBLE_POINTS: 'Çift Puan', TIME_EXTENSION: 'Süre Uzatma' };
      showToast.success((labels[type] || type) + ' aktif!');
    });
    socketService.on('power_up_used', ({ nickname, powerUpType }) => {
      const labels = { FIFTY_FIFTY: '50:50', DOUBLE_POINTS: 'Çift Puan', TIME_EXTENSION: 'Süre Uzatma' };
      showToast.info(nickname + ' joker kullandı: ' + (labels[powerUpType] || powerUpType));
    });
    socketService.on('time_extended', ({ extraTimeMs }) => {
      try { timerRef.current.extendTimer(extraTimeMs); } catch { /* timer may be unavailable */ }
    });

    // Timer events
    socketService.on('timer_started', ({ duration, endTime, serverTime }) => {
      try {
        const adjustedEndTime = endTime + (Date.now() - serverTime);
        timerRef.current.startTimer(duration, adjustedEndTime);
      } catch { /* timer may be unavailable */ }
    });
    socketService.on('timer_tick', () => {});
    socketService.on('time_expired', () => {
      try { timerRef.current.stopTimer(); } catch { /* timer may be unavailable */ }
      updateState({ remainingTime: 0 });
    });
    socketService.on('timer_sync', (data) => {
      try {
        if (!data || data.active === false) return;
        const { remainingMs, endTime, serverTime } = data;
        if (typeof remainingMs !== 'number' || typeof endTime !== 'number' || typeof serverTime !== 'number') return;
        const adjustedEndTime = endTime + (Date.now() - serverTime);
        timerRef.current.startTimer(Math.ceil(remainingMs / 1000), adjustedEndTime);
      } catch { /* timer may be unavailable */ }
    });

    // Pause/Resume
    socketService.on('game_paused', () => {
      try { timerRef.current.stopTimer(); } catch { /* timer may be unavailable */ }
      setState(prev => ({ ...prev, previousState: prev.gameState, gameState: GAME_STATES.PAUSED }));
      showToast.info('Game paused by host');
    });
    socketService.on('game_resumed', ({ state: resumedState }) => {
      setState(prev => ({
        ...prev, gameState: resumedState || prev.previousState || GAME_STATES.LEADERBOARD, previousState: null,
      }));
      showToast.info('Game resumed');
    });

    // Reactions
    socketService.on('reaction_received', ({ nickname, reaction, timestamp }) => {
      const id = `${timestamp}-${Math.random().toString(36).slice(2, 7)}`;
      setState(prev => {
        const newReactions = [...prev.reactions, { id, nickname, reaction, timestamp }];
        return { ...prev, reactions: newReactions.length > 20 ? newReactions.slice(-20) : newReactions };
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

    socketService.on('host_disconnected', ({ message }) => {
      showToast.warning(message || 'Host disconnected. Waiting for reconnection...');
    });
    socketService.on('host_disconnected_warning', ({ remainingSeconds, message }) => {
      showToast.warning(`${message} (${remainingSeconds}s remaining)`);
    });
    socketService.on('host_returned', () => showToast.success('Host has reconnected!'));
    socketService.on('error', ({ error, message }) => showToast.error(error || message || 'An error occurred'));
    // Dependencies: only stable callbacks and refs. timer/room accessed via timerRef/roomRef
    // to prevent listener rebuild on every timer tick or room state change.
  }, [updateState, resetGame, cleanupGameListeners]);

  // Set up listeners when room connects
  useEffect(() => {
    if (room.roomPin) setupSocketListeners();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.roomPin]);

  // Game actions
  const startGame = useCallback((questionCount) => {
    const extraData = questionCount ? { questionCount } : {};
    return room.hostEmit('start_game', extraData);
  }, [room]);

  const startAnswering = useCallback(() => room.hostEmit('start_answering'), [room]);

  const answerSubmittingRef = useRef(false);
  const submitAnswer = useCallback((answerIndex) => {
    if (room.isHost || !room.roomPin || state.hasAnswered || answerSubmittingRef.current) return Promise.reject(new Error('Cannot submit answer'));
    answerSubmittingRef.current = true;
    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        socketService.off('answer_received', onSuccess);
        socketService.off('error', onError);
      };
      const settle = () => { settled = true; answerSubmittingRef.current = false; };
      const timeout = setTimeout(() => {
        if (settled) return;
        settle();
        cleanup();
        reject(new Error('Answer submission timed out'));
      }, 10000);
      const onSuccess = (data) => {
        if (settled) return;
        settle();
        clearTimeout(timeout);
        cleanup();
        resolve(data);
      };
      const onError = ({ error }) => {
        if (settled) return;
        settle();
        clearTimeout(timeout);
        cleanup();
        reject(new Error(error));
      };
      socketService.on('answer_received', onSuccess);
      socketService.on('error', onError);
      socketService.emit('submit_answer', { pin: room.roomPin, answerIndex });
    });
  }, [room.isHost, room.roomPin, state.hasAnswered]);

  const powerUpPendingRef = useRef(false);
  const powerUpCleanupRef = useRef(null);
  const usePowerUp = useCallback((type) => {
    if (!room.roomPin || room.isHost || state.hasAnswered || powerUpPendingRef.current) return;
    powerUpPendingRef.current = true;

    // Capture previous count synchronously before any async state change
    const previousCount = state.powerUps[type] || 0;
    socketService.emit('use_power_up', { pin: room.roomPin, powerUpType: type });
    setState(prev => ({
      ...prev,
      powerUps: { ...prev.powerUps, [type]: Math.max(0, (prev.powerUps[type] || 0) - 1) },
    }));

    let settled = false;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      powerUpPendingRef.current = false;
      powerUpCleanupRef.current = null;
      clearTimeout(rollbackTimeout);
      socketService.off('error', onError);
      socketService.off('power_up_activated', onSuccess);
    };
    const onError = () => {
      const countToRestore = previousCount;
      cleanup();
      setState(prev => ({
        ...prev,
        powerUps: { ...prev.powerUps, [type]: countToRestore },
      }));
    };
    const onSuccess = () => {
      cleanup();
    };
    const rollbackTimeout = setTimeout(cleanup, 5000);
    powerUpCleanupRef.current = cleanup;
    socketService.on('error', onError);
    socketService.on('power_up_activated', onSuccess);
  }, [room.roomPin, room.isHost, state.hasAnswered, state.powerUps]);

  const endAnswering = useCallback(() => room.hostEmit('end_answering'), [room]);
  const showLeaderboard = useCallback(() => room.hostEmit('show_leaderboard'), [room]);
  const nextQuestion = useCallback(() => room.hostEmit('next_question'), [room]);
  const pauseGame = useCallback(() => room.hostEmit('pause_game'), [room]);
  const resumeGame = useCallback(() => room.hostEmit('resume_game'), [room]);

  const requestTimerSync = useCallback(() => {
    if (!room.roomPin) return;
    socketService.emit('request_timer_sync', { pin: room.roomPin });
  }, [room.roomPin]);

  const getResults = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!room.roomPin) { reject(new Error('Not in a room')); return; }
      const timeout = setTimeout(() => {
        socketService.off('final_results', onFinalResults);
        reject(new Error('get_results timed out'));
      }, 10000);
      const onFinalResults = (response) => {
        clearTimeout(timeout);
        socketService.off('final_results', onFinalResults);
        updateState({ leaderboard: response.leaderboard, podium: response.podium });
        resolve(response);
      };
      socketService.on('final_results', onFinalResults);
      socketService.emit('get_results', { pin: room.roomPin });
    });
  }, [room.roomPin, updateState]);

  const sendReaction = useCallback((reaction) => {
    if (!room.roomPin) return;
    socketService.emit('send_reaction', { pin: room.roomPin, reaction });
  }, [room.roomPin]);

  // Auto-cleanup reactions
  const reactionsActiveRef = useRef(false);
  const hasReactions = state.reactions.length > 0;
  useEffect(() => {
    if (!hasReactions) {
      reactionsActiveRef.current = false;
      return;
    }
    // Only start a new interval if one isn't already running
    if (reactionsActiveRef.current) return;
    reactionsActiveRef.current = true;
    const interval = setInterval(() => {
      const now = Date.now();
      setState(prev => {
        const filtered = prev.reactions.filter(r => now - r.timestamp < 3000);
        if (filtered.length === 0) {
          clearInterval(interval);
          reactionsActiveRef.current = false;
        }
        if (filtered.length === prev.reactions.length) return prev;
        return { ...prev, reactions: filtered };
      });
    }, 500);
    return () => {
      clearInterval(interval);
      reactionsActiveRef.current = false;
    };
  }, [hasReactions]);

  // Cleanup on unmount only — remove game-specific listeners, not all listeners
  useEffect(() => {
    return () => {
      timerRef.current.stopTimer();
      cleanupGameListeners();
      listenersSetupRef.current = false;
      lastSocketIdRef.current = null;
      // Clean up any pending power-up timeout to prevent state updates after unmount
      if (powerUpCleanupRef.current) powerUpCleanupRef.current();
    };
  }, [cleanupGameListeners]);

  const value = useMemo(() => ({
    // Spread room state for backward compatibility
    ...room,
    // Timer state
    remainingTime: timer.remainingTime,
    timeLimit: timer.timeLimit,
    // Game state
    ...state,
    // Game actions
    startGame, startAnswering, submitAnswer, usePowerUp,
    endAnswering, showLeaderboard, nextQuestion,
    pauseGame, resumeGame,
    requestTimerSync, getResults, sendReaction,
    resetGame,
  }), [
    room, timer.remainingTime, timer.timeLimit, state,
    startGame, startAnswering, submitAnswer, usePowerUp,
    endAnswering, showLeaderboard, nextQuestion,
    pauseGame, resumeGame,
    requestTimerSync, getResults, sendReaction,
    resetGame,
  ]);

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const context = useContext(GameContext);
  if (!context) throw new Error('useGame must be used within a GameProvider');
  return context;
}
