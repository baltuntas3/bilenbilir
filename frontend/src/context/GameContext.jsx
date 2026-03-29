import { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { socketService } from '../services/socketService';
import { useRoom, saveSession } from './RoomContext';
import { useTimer } from './TimerContext';
import { showToast } from '../utils/toast';

const GameContext = createContext(null);

/**
 * Calculate clock-skew-adjusted end time from server timer sync data.
 * Clamps the result so the effective remaining time stays within
 * [0, remainingMs + 2000ms] to prevent extreme skew from breaking the timer.
 */
function calcAdjustedEndTime(endTime, serverTime, remainingMs) {
  const clockOffset = Date.now() - serverTime;
  const adjusted = endTime + clockOffset;
  // Clamp: don't let adjusted time drift more than 2s beyond expected
  const now = Date.now();
  const maxEnd = now + remainingMs + 2000;
  const minEnd = now;
  return Math.max(minEnd, Math.min(adjusted, maxEnd));
}

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
  connectedPlayerCount: 0,
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
  // No longer using a blanket suppressErrorToastRef — answer/power-up errors
  // are handled in their own ack callbacks; the global error handler only
  // suppresses known answer-related messages to avoid duplicates.

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
      'you_were_kicked', 'room_joined_spectator', 'player_reconnected', 'host_reconnected', 'spectator_reconnected', 'game_started',
      'question_intro', 'answering_started', 'answer_received', 'answer_count_updated',
      'all_players_answered', 'show_results', 'leaderboard', 'game_over',
      'final_results', 'fifty_fifty_result', 'power_up_activated', 'power_up_used',
      'time_extended', 'power_up_refund_failed', 'timer_started', 'timer_tick', 'time_expired', 'timer_sync',
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
      const {
        state, score, streak, powerUps, eliminatedOptions, hasAnswered, lastAnswer,
        currentQuestionIndex, totalQuestions, currentQuestion, timerSync, playerToken,
        answeredCount, totalPlayersInPhase, connectedPlayerCount, correctAnswerIndex, distribution, explanation,
        leaderboard, podium, teamLeaderboard, teamPodium, pausedFromState
      } = data || {};
      const updates = {};
      if (state && GAME_STATES[state]) updates.gameState = state;
      if (typeof score === 'number') updates.score = score;
      if (typeof streak === 'number') updates.streak = streak;
      if (powerUps) updates.powerUps = powerUps;
      if (Array.isArray(eliminatedOptions)) updates.eliminatedOptions = eliminatedOptions;
      if (typeof hasAnswered === 'boolean') updates.hasAnswered = hasAnswered;
      if (lastAnswer) updates.lastAnswer = lastAnswer;
      if (typeof currentQuestionIndex === 'number') updates.currentQuestionIndex = currentQuestionIndex;
      if (typeof totalQuestions === 'number') updates.totalQuestions = totalQuestions;
      if (currentQuestion) updates.currentQuestion = currentQuestion;
      if (typeof answeredCount === 'number') updates.answeredCount = answeredCount;
      if (typeof totalPlayersInPhase === 'number') updates.totalPlayersInPhase = totalPlayersInPhase;
      if (typeof connectedPlayerCount === 'number') updates.connectedPlayerCount = connectedPlayerCount;
      if (typeof correctAnswerIndex === 'number') updates.correctAnswerIndex = correctAnswerIndex;
      if (distribution) updates.answerDistribution = distribution;
      if (explanation !== undefined) updates.explanation = explanation;
      if (leaderboard) updates.leaderboard = leaderboard;
      if (podium) updates.podium = podium;
      if (teamLeaderboard) updates.teamLeaderboard = teamLeaderboard;
      if (teamPodium) updates.teamPodium = teamPodium;
      if (pausedFromState) updates.previousState = pausedFromState;
      if (Object.keys(updates).length > 0) updateState(updates);

      // Restore timer if in answering phase
      if (timerSync && timerSync.remainingMs > 0) {
        try {
          const adjustedEndTime = calcAdjustedEndTime(timerSync.endTime, timerSync.serverTime, timerSync.remainingMs);
          timerRef.current.startTimer(Math.ceil(timerSync.remainingMs / 1000), adjustedEndTime, true);
        } catch { /* timer may be unavailable */ }
      }

      // Save rotated token and restore room-level state (team mode, lightning round)
      const roomUpdates = {};
      if (playerToken) roomUpdates.playerToken = playerToken;
      if (typeof data.teamMode === 'boolean') roomUpdates.teamMode = data.teamMode;
      if (data.teams) roomUpdates.teams = data.teams;
      if (data.lightningRound) roomUpdates.lightningRound = data.lightningRound;
      if (Object.keys(roomUpdates).length > 0) {
        roomRef.current.updateRoomState(roomUpdates);
        if (playerToken) saveSession({ playerToken });
      }
    });

    // Restore game state on host reconnect
    socketService.on('host_reconnected', (data) => {
      const {
        state, currentQuestionIndex, totalQuestions, currentQuestion,
        players, timerSync, leaderboard, podium,
        correctAnswerIndex, distribution, explanation,
        answeredCount, totalPlayersInPhase, connectedPlayerCount,
        teamLeaderboard, teamPodium, pausedFromState
      } = data || {};
      const updates = {};
      if (state && GAME_STATES[state]) updates.gameState = state;
      if (typeof currentQuestionIndex === 'number') updates.currentQuestionIndex = currentQuestionIndex;
      if (typeof totalQuestions === 'number') updates.totalQuestions = totalQuestions;
      if (currentQuestion) updates.currentQuestion = currentQuestion;
      if (typeof correctAnswerIndex === 'number') updates.correctAnswerIndex = correctAnswerIndex;
      if (distribution) updates.answerDistribution = distribution;
      if (explanation !== undefined) updates.explanation = explanation;
      if (typeof answeredCount === 'number') updates.answeredCount = answeredCount;
      if (typeof totalPlayersInPhase === 'number') updates.totalPlayersInPhase = totalPlayersInPhase;
      if (typeof connectedPlayerCount === 'number') updates.connectedPlayerCount = connectedPlayerCount;
      if (leaderboard) updates.leaderboard = leaderboard;
      if (podium) updates.podium = podium;
      if (teamLeaderboard) updates.teamLeaderboard = teamLeaderboard;
      if (teamPodium) updates.teamPodium = teamPodium;
      if (pausedFromState) updates.previousState = pausedFromState;
      if (Object.keys(updates).length > 0) updateState(updates);

      // Restore players list, rotated host token, and room-level config in RoomContext
      const roomUpdates = {};
      if (players) roomUpdates.players = players;
      if (data.hostToken) roomUpdates.hostToken = data.hostToken;
      if (typeof data.teamMode === 'boolean') roomUpdates.teamMode = data.teamMode;
      if (data.teams) roomUpdates.teams = data.teams;
      if (data.lightningRound) roomUpdates.lightningRound = data.lightningRound;
      if (Object.keys(roomUpdates).length > 0) {
        roomRef.current.updateRoomState(roomUpdates);
        if (data.hostToken) saveSession({ hostToken: data.hostToken });
      }

      // Restore timer if in answering phase
      if (timerSync && timerSync.remainingMs > 0) {
        try {
          const adjustedEndTime = calcAdjustedEndTime(timerSync.endTime, timerSync.serverTime, timerSync.remainingMs);
          timerRef.current.startTimer(Math.ceil(timerSync.remainingMs / 1000), adjustedEndTime, true);
        } catch { /* timer may be unavailable */ }
      }
    });

    // Apply spectator snapshot for both initial join and reconnect.
    const applySpectatorSnapshot = (data) => {
      const {
        state, currentQuestionIndex, totalQuestions, currentQuestion,
        answeredCount, totalPlayersInPhase, connectedPlayerCount, correctAnswerIndex, distribution, explanation,
        leaderboard, podium, teamLeaderboard, teamPodium, timerSync, pausedFromState
      } = data || {};
      const updates = {};
      if (state && GAME_STATES[state]) updates.gameState = state;
      if (typeof currentQuestionIndex === 'number') updates.currentQuestionIndex = currentQuestionIndex;
      if (typeof totalQuestions === 'number') updates.totalQuestions = totalQuestions;
      if (currentQuestion) updates.currentQuestion = currentQuestion;
      if (typeof answeredCount === 'number') updates.answeredCount = answeredCount;
      if (typeof totalPlayersInPhase === 'number') updates.totalPlayersInPhase = totalPlayersInPhase;
      if (typeof connectedPlayerCount === 'number') updates.connectedPlayerCount = connectedPlayerCount;
      if (typeof correctAnswerIndex === 'number') updates.correctAnswerIndex = correctAnswerIndex;
      if (distribution) updates.answerDistribution = distribution;
      if (explanation !== undefined) updates.explanation = explanation;
      if (leaderboard) updates.leaderboard = leaderboard;
      if (podium) updates.podium = podium;
      if (teamLeaderboard) updates.teamLeaderboard = teamLeaderboard;
      if (teamPodium) updates.teamPodium = teamPodium;
      if (pausedFromState) updates.previousState = pausedFromState;
      if (Object.keys(updates).length > 0) updateState(updates);

      // Restore room-level config (team mode, lightning round)
      const roomUpdates = {};
      if (typeof data.teamMode === 'boolean') roomUpdates.teamMode = data.teamMode;
      if (data.teams) roomUpdates.teams = data.teams;
      if (data.lightningRound) roomUpdates.lightningRound = data.lightningRound;
      if (data.spectatorToken) roomUpdates.spectatorToken = data.spectatorToken;
      if (Object.keys(roomUpdates).length > 0) roomRef.current.updateRoomState(roomUpdates);

      if (timerSync && timerSync.remainingMs > 0) {
        try {
          const adjustedEndTime = calcAdjustedEndTime(timerSync.endTime, timerSync.serverTime, timerSync.remainingMs);
          timerRef.current.startTimer(Math.ceil(timerSync.remainingMs / 1000), adjustedEndTime, true);
        } catch { /* timer may be unavailable */ }
      }
    };
    socketService.on('room_joined_spectator', applySpectatorSnapshot);
    socketService.on('spectator_reconnected', applySpectatorSnapshot);

    // Game flow events
    socketService.on('game_started', (data) => {
      const { totalQuestions, currentQuestion, questionIndex, powerUps, teamMode } = data || {};
      // Sync teamMode to RoomContext so UI components render team tabs
      if (typeof teamMode === 'boolean') {
        roomRef.current.updateRoomState({ teamMode });
      }
      setState((prev) => ({
        ...prev,
        gameState: GAME_STATES.QUESTION_INTRO,
        totalQuestions: totalQuestions ?? prev.totalQuestions,
        currentQuestion: currentQuestion ?? prev.currentQuestion,
        currentQuestionIndex: questionIndex ?? 0,
        hasAnswered: false,
        lastAnswer: null,
        powerUps: powerUps ?? prev.powerUps,
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
        totalPlayersInPhase: 0,
        answerDistribution: null,
        correctAnswerIndex: null,
        explanation: null,
        eliminatedOptions: [],
        isLightning: false,
      }));
    });

    socketService.on('answering_started', ({ timeLimit, isLightning, connectedPlayerCount }) => {
      const updates = {
        gameState: GAME_STATES.ANSWERING_PHASE,
        timeLimit,
        isLightning: isLightning || false,
        answeredCount: 0,
        // Defensive reset: if question_intro was missed (network hiccup),
        // ensure player can still answer in this phase
        hasAnswered: false,
        lastAnswer: null,
      };
      if (typeof connectedPlayerCount === 'number') {
        updates.totalPlayersInPhase = connectedPlayerCount;
        updates.connectedPlayerCount = connectedPlayerCount;
      }
      updateState(updates);
    });

    socketService.on('answer_received', ({ isCorrect, score, totalScore, streak, streakBonus, doublePointsRefunded }) => {
      // If we have a pending answer submission, mark it as accepted by the server
      if (answerPendingRef.current) {
        answerPendingRef.current = false;
        answerAcceptedRef.current = true;
      }
      setState(prev => {
        const updates = {
          ...prev,
          hasAnswered: true,
          lastAnswer: { isCorrect, score, streakBonus },
          score: totalScore,
          streak,
        };
        // Restore DOUBLE_POINTS power-up when refunded on wrong answer
        if (doublePointsRefunded) {
          updates.powerUps = { ...prev.powerUps, DOUBLE_POINTS: (prev.powerUps.DOUBLE_POINTS || 0) + 1 };
        }
        return updates;
      });
    });

    socketService.on('answer_count_updated', ({ answeredCount, totalPlayersInPhase, connectedPlayerCount }) => {
      const updates = { answeredCount };
      if (typeof totalPlayersInPhase === 'number') updates.totalPlayersInPhase = totalPlayersInPhase;
      if (typeof connectedPlayerCount === 'number') updates.connectedPlayerCount = connectedPlayerCount;
      updateState(updates);
    });
    socketService.on('all_players_answered', () => { /* auto-transition to show_results follows */ });

    socketService.on('show_results', ({ correctAnswerIndex, distribution, answeredCount, totalPlayersInPhase, connectedPlayerCount, explanation }) => {
      try { timerRef.current.stopTimer(); } catch { /* timer may be unavailable */ }
      const updates = {
        gameState: GAME_STATES.SHOW_RESULTS,
        correctAnswerIndex,
        answerDistribution: distribution,
        answeredCount: typeof answeredCount === 'number' ? answeredCount : 0,
        totalPlayersInPhase,
        explanation: explanation || null,
      };
      if (typeof connectedPlayerCount === 'number') updates.connectedPlayerCount = connectedPlayerCount;
      updateState(updates);
    });

    socketService.on('leaderboard', ({ leaderboard, teamLeaderboard }) => {
      const updates = { gameState: GAME_STATES.LEADERBOARD, leaderboard };
      if (teamLeaderboard) updates.teamLeaderboard = teamLeaderboard;
      updateState(updates);
    });

    socketService.on('game_over', ({ podium, leaderboard, teamPodium, teamLeaderboard }) => {
      const updates = { gameState: GAME_STATES.PODIUM, podium };
      if (leaderboard) updates.leaderboard = leaderboard;
      if (teamPodium) updates.teamPodium = teamPodium;
      if (teamLeaderboard) updates.teamLeaderboard = teamLeaderboard;
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
      // Skip our own pending power-up — already handled via optimistic UI.
      // Match both type AND nickname to avoid suppressing other players' same-type power-ups.
      const myNickname = roomRef.current.nickname;
      if (pendingPowerUpTypeRef.current === powerUpType && nickname === myNickname) {
        pendingPowerUpTypeRef.current = null;
        return;
      }
      const labels = { FIFTY_FIFTY: '50:50', DOUBLE_POINTS: 'Çift Puan', TIME_EXTENSION: 'Süre Uzatma' };
      showToast.info(nickname + ' joker kullandı: ' + (labels[powerUpType] || powerUpType));
    });
    socketService.on('time_extended', ({ extraTimeMs }) => {
      try { timerRef.current.extendTimer(extraTimeMs); } catch { /* timer may be unavailable */ }
    });
    socketService.on('power_up_refund_failed', ({ powerUpType }) => {
      const labels = { FIFTY_FIFTY: '50:50', DOUBLE_POINTS: 'Çift Puan', TIME_EXTENSION: 'Süre Uzatma' };
      showToast.error((labels[powerUpType] || powerUpType) + ' jokeri geri alınamadı. Lütfen yöneticiye bildirin.');
    });

    // Timer events
    socketService.on('timer_started', ({ duration, endTime, serverTime }) => {
      try {
        const adjustedEndTime = calcAdjustedEndTime(endTime, serverTime, duration * 1000);
        timerRef.current.startTimer(duration, adjustedEndTime);
      } catch { /* timer may be unavailable */ }
    });
    // Re-sync client timer on every server tick to prevent drift
    socketService.on('timer_tick', (data) => {
      try {
        if (!data) return;
        const { remainingMs, endTime, serverTime } = data;
        if (typeof remainingMs !== 'number' || typeof endTime !== 'number' || typeof serverTime !== 'number') return;
        const adjustedEndTime = calcAdjustedEndTime(endTime, serverTime, remainingMs);
        timerRef.current.syncTimer(Math.ceil(remainingMs / 1000), adjustedEndTime);
      } catch { /* timer may be unavailable */ }
    });
    socketService.on('time_expired', () => {
      try { timerRef.current.stopTimer(); } catch { /* timer may be unavailable */ }
      updateState({ remainingTime: 0 });
    });
    socketService.on('timer_sync', (data) => {
      try {
        if (!data || data.active === false) return;
        const { remainingMs, endTime, serverTime } = data;
        if (typeof remainingMs !== 'number' || typeof endTime !== 'number' || typeof serverTime !== 'number') return;
        const adjustedEndTime = calcAdjustedEndTime(endTime, serverTime, remainingMs);
        timerRef.current.startTimer(Math.ceil(remainingMs / 1000), adjustedEndTime, true);
      } catch { /* timer may be unavailable */ }
    });

    // Pause/Resume
    socketService.on('game_paused', ({ pausedFromState } = {}) => {
      try { timerRef.current.stopTimer(); } catch { /* timer may be unavailable */ }
      setState(prev => ({
        ...prev,
        // Prefer server-authoritative pausedFromState over local gameState to avoid race conditions
        previousState: pausedFromState || prev.gameState,
        gameState: GAME_STATES.PAUSED
      }));
      showToast.info('Game paused by host');
    });
    socketService.on('game_resumed', ({ state: resumedState, timerSync: resumeTimerSync }) => {
      setState(prev => {
        const targetState = resumedState || prev.previousState || GAME_STATES.LEADERBOARD;
        return { ...prev, gameState: targetState, previousState: null };
      });
      // If server included timer data in resume payload, start timer immediately
      // to avoid gap between game_resumed and timer_started events
      if (resumeTimerSync && resumeTimerSync.remainingMs > 0) {
        try {
          const adjustedEndTime = calcAdjustedEndTime(resumeTimerSync.endTime, resumeTimerSync.serverTime, resumeTimerSync.remainingMs);
          timerRef.current.startTimer(Math.ceil(resumeTimerSync.remainingMs / 1000), adjustedEndTime, true);
        } catch { /* timer may be unavailable */ }
      }
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
    socketService.on('error', ({ error, message, code }) => {
      // Skip errors with known codes handled by their own ack callbacks
      if (code === 'ANSWER_ERROR' || code === 'POWER_UP_ERROR') return;
      const msg = error || message || '';
      // Fallback: suppress answer/power-up messages by pattern for backward compatibility
      if (/\b(answer|already answered|power.?up)\b/i.test(msg)) return;
      showToast.error(msg || 'An error occurred');
    });
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
  const answerPendingRef = useRef(false);
  const answerAcceptedRef = useRef(false);
  const submitAnswer = useCallback((answerIndex) => {
    if (room.isHost || !room.roomPin || state.hasAnswered || answerSubmittingRef.current) return Promise.reject(new Error('Cannot submit answer'));
    answerSubmittingRef.current = true;
    answerPendingRef.current = true;
    answerAcceptedRef.current = false;
    return socketService
      .emitWithAck('submit_answer', { pin: room.roomPin, answerIndex }, 10000)
      .catch((err) => {
        // If answer_received already arrived from the server, the answer was accepted — ignore the ack error
        if (answerAcceptedRef.current) return;
        throw err;
      })
      .finally(() => {
        answerSubmittingRef.current = false;
        answerPendingRef.current = false;
        answerAcceptedRef.current = false;
      });
  }, [room.isHost, room.roomPin, state.hasAnswered]);

  const powerUpPendingRef = useRef(false);
  // Track the power-up type currently being processed to avoid race with server events
  const pendingPowerUpTypeRef = useRef(null);
  const usePowerUp = useCallback((type) => {
    if (!room.roomPin || room.isHost || state.hasAnswered || powerUpPendingRef.current) return;
    if ((state.powerUps[type] || 0) <= 0) return;
    powerUpPendingRef.current = true;
    pendingPowerUpTypeRef.current = type;

    // Optimistic UI update
    setState(prev => ({
      ...prev,
      powerUps: { ...prev.powerUps, [type]: Math.max(0, (prev.powerUps[type] || 0) - 1) },
    }));

    socketService
      .emitWithAck('use_power_up', { pin: room.roomPin, powerUpType: type }, 5000)
      .then((response) => {
        pendingPowerUpTypeRef.current = null;
        if (response && !response.ok) {
          // Server rejected — rollback optimistic update
          setState(prev => ({
            ...prev,
            powerUps: { ...prev.powerUps, [type]: (prev.powerUps[type] || 0) + 1 },
          }));
          showToast.error(response.error || 'Power-up could not be used');
        }
      })
      .catch(() => {
        pendingPowerUpTypeRef.current = null;
        // Timeout or network error — rollback and notify user
        setState(prev => ({
          ...prev,
          powerUps: { ...prev.powerUps, [type]: (prev.powerUps[type] || 0) + 1 },
        }));
        showToast.error('Joker kullanılamadı, tekrar deneyin');
      })
      .finally(() => {
        powerUpPendingRef.current = false;
      });
  }, [room.roomPin, room.isHost, state.hasAnswered, state.powerUps]);

  const endAnswering = useCallback(() => room.hostEmit('end_answering'), [room]);
  const showLeaderboard = useCallback(() => room.hostEmit('show_leaderboard'), [room]);
  const nextQuestion = useCallback(() => room.hostEmit('next_question'), [room]);
  const pauseGame = useCallback(() => room.hostEmit('pause_game'), [room]);
  const resumeGame = useCallback(() => room.hostEmit('resume_game'), [room]);

  const requestTimerSync = useCallback(() => {
    if (!room.roomPin) return Promise.resolve(null);
    return socketService.emitWithAck('request_timer_sync', { pin: room.roomPin }, 5000);
  }, [room.roomPin]);

  const getResults = useCallback(() => {
    if (!room.roomPin) return Promise.reject(new Error('Not in a room'));
    return socketService
      .emitWithAck('get_results', { pin: room.roomPin }, 10000)
      .then((response) => {
        updateState({ leaderboard: response.leaderboard, podium: response.podium });
        return response;
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
