import { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { socketService } from '../services/socketService';
import { useRoom } from './RoomContext';
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

  const resetGame = useCallback(() => {
    timer.resetTimer();
    listenersSetupRef.current = false;
    lastSocketIdRef.current = null;
    room.resetRoom();
    setState(initialGameState);
  }, [timer, room]);

  // Socket event handlers
  const setupSocketListeners = useCallback(() => {
    const currentSocketId = socketService.getSocketId();
    if (listenersSetupRef.current && lastSocketIdRef.current !== currentSocketId) {
      listenersSetupRef.current = false;
    }
    if (listenersSetupRef.current) return;
    listenersSetupRef.current = true;
    lastSocketIdRef.current = currentSocketId;

    // Player/spectator toast-only events (state is managed by RoomContext)
    socketService.on('you_were_kicked', ({ reason }) => {
      showToast.error(reason === 'banned' ? 'You have been banned from the game' : 'You have been kicked from the game');
      resetGame();
      socketService.disconnect();
    });

    socketService.on('player_kicked', ({ nickname }) => {
      showToast.success(`${nickname} was kicked`);
    });

    socketService.on('player_banned', ({ nickname }) => {
      showToast.success(`${nickname} was banned`);
    });

    socketService.on('player_returned', ({ playerId, nickname }) => {
      showToast.info(`${nickname} reconnected`);
    });

    socketService.on('spectator_returned', ({ nickname }) => {
      showToast.info(`${nickname} reconnected`);
    });

    socketService.on('nickname_unbanned', ({ nickname }) => {
      showToast.success(`${nickname} unbanned`);
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

    socketService.on('answer_count_updated', ({ answeredCount }) => updateState({ answeredCount }));
    socketService.on('all_players_answered', () => {});

    socketService.on('show_results', ({ correctAnswerIndex, distribution, correctCount, totalPlayers, explanation }) => {
      timer.stopTimer();
      updateState({
        gameState: GAME_STATES.SHOW_RESULTS,
        correctAnswerIndex,
        answerDistribution: distribution,
        answeredCount: totalPlayers,
        explanation: explanation || null,
      });
    });

    socketService.on('round_ended', ({ correctAnswerIndex, explanation }) => {
      timer.stopTimer();
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
      const updates = { leaderboard, podium };
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
    socketService.on('time_extended', ({ extraTimeMs }) => timer.extendTimer(extraTimeMs));

    // Timer events
    socketService.on('timer_started', ({ duration, endTime, serverTime }) => {
      const adjustedEndTime = endTime + (Date.now() - serverTime);
      timer.startTimer(duration, adjustedEndTime);
    });
    socketService.on('timer_tick', () => {});
    socketService.on('time_expired', () => { timer.stopTimer(); updateState({ remainingTime: 0 }); });
    socketService.on('timer_sync', ({ remainingMs, endTime, serverTime }) => {
      const adjustedEndTime = endTime + (Date.now() - serverTime);
      timer.startTimer(Math.ceil(remainingMs / 1000), adjustedEndTime);
    });

    // Pause/Resume
    socketService.on('game_paused', () => {
      timer.stopTimer();
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
  }, [updateState, timer, room, resetGame]);

  // Set up listeners when room connects
  useEffect(() => {
    if (room.roomPin) setupSocketListeners();
  }, [room.roomPin, setupSocketListeners]);

  // Game actions
  const startGame = useCallback((questionCount) => {
    const extraData = questionCount ? { questionCount } : {};
    return room.hostEmit('start_game', extraData);
  }, [room]);

  const startAnswering = useCallback(() => room.hostEmit('start_answering'), [room]);

  const submitAnswer = useCallback((answerIndex) => {
    if (room.isHost || !room.roomPin || state.hasAnswered) return Promise.reject(new Error('Cannot submit answer'));
    socketService.emit('submit_answer', { pin: room.roomPin, answerIndex });
    return Promise.resolve();
  }, [room.isHost, room.roomPin, state.hasAnswered]);

  const usePowerUp = useCallback((type) => {
    if (!room.roomPin || room.isHost || state.hasAnswered) return;
    socketService.emit('use_power_up', { pin: room.roomPin, powerUpType: type });
    setState(prev => ({
      ...prev,
      powerUps: { ...prev.powerUps, [type]: Math.max(0, (prev.powerUps[type] || 0) - 1) },
    }));
  }, [room.roomPin, room.isHost, state.hasAnswered]);

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
      const onFinalResults = (response) => {
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
  useEffect(() => {
    if (state.reactions.length === 0) return;
    const interval = setInterval(() => {
      const now = Date.now();
      setState(prev => {
        const filtered = prev.reactions.filter(r => now - r.timestamp < 3000);
        if (filtered.length === prev.reactions.length) return prev;
        return { ...prev, reactions: filtered };
      });
    }, 500);
    return () => clearInterval(interval);
  }, [state.reactions.length]);

  // Cleanup on unmount only
  useEffect(() => {
    return () => {
      timerRef.current.stopTimer();
      socketService.removeAllListeners();
      socketService.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = {
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
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const context = useContext(GameContext);
  if (!context) throw new Error('useGame must be used within a GameProvider');
  return context;
}
