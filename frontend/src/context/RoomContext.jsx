import { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { socketService } from '../services/socketService';
import { useAuth } from './AuthContext';
import { showToast } from '../utils/toast';

const RoomContext = createContext(null);

// Session storage keys
const SESSION_KEYS = {
  PIN: 'game_pin',
  HOST_TOKEN: 'game_host_token',
  PLAYER_TOKEN: 'game_player_token',
  SPECTATOR_TOKEN: 'game_spectator_token',
  ROLE: 'game_role',
  NICKNAME: 'game_nickname',
};

const saveSession = (data) => {
  if (data.pin) sessionStorage.setItem(SESSION_KEYS.PIN, data.pin);
  if (data.hostToken) sessionStorage.setItem(SESSION_KEYS.HOST_TOKEN, data.hostToken);
  if (data.playerToken) sessionStorage.setItem(SESSION_KEYS.PLAYER_TOKEN, data.playerToken);
  if (data.spectatorToken) sessionStorage.setItem(SESSION_KEYS.SPECTATOR_TOKEN, data.spectatorToken);
  if (data.role) sessionStorage.setItem(SESSION_KEYS.ROLE, data.role);
  if (data.nickname) sessionStorage.setItem(SESSION_KEYS.NICKNAME, data.nickname);
};

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

const clearSession = () => {
  Object.values(SESSION_KEYS).forEach(key => sessionStorage.removeItem(key));
};

const initialRoomState = {
  roomPin: null,
  isHost: false,
  isSpectator: false,
  hostToken: null,
  playerToken: null,
  spectatorToken: null,
  playerId: null,
  spectatorId: null,
  nickname: null,
  players: [],
  spectators: [],
  bannedNicknames: [],
  quiz: null,
  isReconnecting: false,
  teams: [],
  teamMode: false,
  lightningRound: { enabled: false, questionCount: 3 },
};

export function RoomProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [roomState, setRoomState] = useState(initialRoomState);

  const updateRoomState = useCallback((updates) => {
    setRoomState((prev) => ({ ...prev, ...updates }));
  }, []);

  const emitWithResponse = useCallback((emitEvent, emitData, responseEvent, timeoutMs = 10000) => {
    return new Promise((resolve, reject) => {
      let settled = false;

      const cleanup = () => {
        socketService.off(responseEvent, onResponse);
        socketService.off('error', onError);
      };

      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(`${responseEvent} timed out`));
      }, timeoutMs);

      const onResponse = (response) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        cleanup();
        resolve(response);
      };

      const onError = ({ error }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        cleanup();
        reject(new Error(error));
      };

      socketService.on(responseEvent, onResponse);
      socketService.on('error', onError);
      socketService.emit(emitEvent, emitData);
    });
  }, []);

  const hostEmit = useCallback((event, extraData = {}) => {
    if (!roomState.isHost || !roomState.roomPin) {
      return Promise.reject(new Error('Not authorized'));
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      const onError = ({ error }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        socketService.off('error', onError);
        reject(new Error(error));
      };
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        socketService.off('error', onError);
        resolve(); // Resolve on timeout (no error means success)
      }, 5000);
      socketService.on('error', onError);
      socketService.emit(event, { pin: roomState.roomPin, ...extraData });
    });
  }, [roomState.isHost, roomState.roomPin]);

  const connectSocket = useCallback(async () => {
    await socketService.connect();
  }, []);

  const resetRoom = useCallback(() => {
    clearSession();
    setRoomState(initialRoomState);
    roomListenersSetupRef.current = false;
  }, []);

  // Room-level socket listeners (player/spectator/team/lightning/ban events)
  const roomListenersSetupRef = useRef(false);
  const lastRoomSocketIdRef = useRef(null);

  const roomEvents = [
    'player_joined', 'player_left', 'player_kicked', 'player_banned',
    'player_returned', 'spectator_joined', 'spectator_left', 'spectator_returned',
    'team_mode_updated', 'teams_updated', 'lightning_round_updated',
    'banned_nicknames', 'nickname_unbanned',
  ];

  const cleanupRoomListeners = useCallback(() => {
    roomEvents.forEach(event => socketService.off(event));
    roomListenersSetupRef.current = false;
    lastRoomSocketIdRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setupRoomListeners = useCallback(() => {
    const currentSocketId = socketService.getSocketId();
    if (roomListenersSetupRef.current && lastRoomSocketIdRef.current === currentSocketId) return;

    // Always cleanup before re-attaching to prevent listener accumulation
    cleanupRoomListeners();
    roomListenersSetupRef.current = true;
    lastRoomSocketIdRef.current = currentSocketId;

    // Player events
    socketService.on('player_joined', ({ player }) => {
      setRoomState(prev => ({
        ...prev,
        players: [...prev.players.filter(p => p.id !== player.id), player],
      }));
    });

    socketService.on('player_left', ({ playerId }) => {
      setRoomState(prev => ({
        ...prev,
        players: prev.players.filter(p => p.id !== playerId),
      }));
    });

    socketService.on('player_kicked', ({ nickname }) => {
      setRoomState(prev => ({
        ...prev,
        players: prev.players.filter(p => p.nickname !== nickname),
      }));
      showToast.success(`${nickname} was kicked`);
    });

    socketService.on('player_banned', ({ nickname }) => {
      setRoomState(prev => ({
        ...prev,
        players: prev.players.filter(p => p.nickname !== nickname),
      }));
      showToast.success(`${nickname} was banned`);
    });

    socketService.on('player_returned', ({ playerId, nickname }) => {
      setRoomState(prev => ({
        ...prev,
        players: prev.players.map(p =>
          p.id === playerId ? { ...p, disconnected: false } : p
        ),
      }));
      showToast.info(`${nickname} reconnected`);
    });

    // Spectator events
    socketService.on('spectator_joined', ({ spectator }) => {
      setRoomState(prev => ({
        ...prev,
        spectators: [...prev.spectators.filter(s => s.id !== spectator.id), spectator],
      }));
    });

    socketService.on('spectator_left', ({ spectatorId }) => {
      setRoomState(prev => ({
        ...prev,
        spectators: prev.spectators.filter(s => s.id !== spectatorId),
      }));
    });

    socketService.on('spectator_returned', ({ spectatorId, nickname }) => {
      setRoomState(prev => ({
        ...prev,
        spectators: prev.spectators.map(s =>
          s.id === spectatorId ? { ...s, disconnected: false } : s
        ),
      }));
      if (nickname) showToast.info(`${nickname} reconnected`);
    });

    // Team mode events
    socketService.on('team_mode_updated', ({ teamMode, teams }) => {
      setRoomState(prev => ({ ...prev, teamMode, teams }));
    });

    socketService.on('teams_updated', ({ teams }) => {
      setRoomState(prev => ({ ...prev, teams }));
    });

    // Lightning round events
    socketService.on('lightning_round_updated', ({ enabled, questionCount }) => {
      setRoomState(prev => ({ ...prev, lightningRound: { enabled, questionCount } }));
    });

    // Ban events
    socketService.on('banned_nicknames', ({ bannedNicknames }) => {
      setRoomState(prev => ({ ...prev, bannedNicknames }));
    });

    socketService.on('nickname_unbanned', ({ nickname }) => {
      setRoomState(prev => ({
        ...prev,
        bannedNicknames: prev.bannedNicknames.filter(n => n !== nickname),
      }));
      showToast.success(`${nickname} unbanned`);
    });
  }, [cleanupRoomListeners]);

  // Set up room listeners when roomPin is set, cleanup on unmount or pin change
  useEffect(() => {
    if (roomState.roomPin) {
      setupRoomListeners();
    }
    return () => cleanupRoomListeners();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomState.roomPin]);

  // Room management
  const createRoom = useCallback(async (quizId) => {
    if (!isAuthenticated) throw new Error('You must be logged in to host a game');
    await connectSocket();
    const response = await emitWithResponse('create_room', { quizId }, 'room_created');
    saveSession({ pin: response.pin, hostToken: response.hostToken, role: 'host' });
    updateRoomState({
      roomPin: response.pin, isHost: true, hostToken: response.hostToken,
      quiz: { title: response.quizTitle, questionCount: response.totalQuestions },
      players: [],
    });
    return response;
  }, [isAuthenticated, connectSocket, updateRoomState, emitWithResponse]);

  const joinRoom = useCallback(async (pin, nickname) => {
    await connectSocket();
    const response = await emitWithResponse('join_room', { pin, nickname }, 'room_joined');
    saveSession({ pin: response.pin, playerToken: response.playerToken, role: 'player', nickname: response.nickname || nickname });
    updateRoomState({
      roomPin: response.pin, isHost: false, playerId: response.playerId,
      playerToken: response.playerToken, nickname: response.nickname || nickname,
      players: [],
    });
    return response;
  }, [connectSocket, updateRoomState, emitWithResponse]);

  const joinAsSpectator = useCallback(async (pin, nickname) => {
    await connectSocket();
    const response = await emitWithResponse('join_as_spectator', { pin, nickname }, 'room_joined_spectator');
    saveSession({ pin: response.pin, spectatorToken: response.spectatorToken, role: 'spectator', nickname: response.nickname });
    updateRoomState({
      roomPin: response.pin, isHost: false, isSpectator: true,
      spectatorId: response.spectatorId, spectatorToken: response.spectatorToken,
      nickname: response.nickname,
    });
    return response;
  }, [connectSocket, updateRoomState, emitWithResponse]);

  const leaveRoom = useCallback(() => {
    if (roomState.roomPin) socketService.emit('leave_room', { pin: roomState.roomPin });
    resetRoom();
    socketService.disconnect();
  }, [roomState.roomPin, resetRoom]);

  const closeRoom = useCallback(() => {
    if (!roomState.isHost || !roomState.roomPin) return Promise.resolve();
    socketService.emit('close_room', { pin: roomState.roomPin });
    resetRoom();
    socketService.disconnect();
    return Promise.resolve();
  }, [roomState.isHost, roomState.roomPin, resetRoom]);

  const leaveSpectator = useCallback(() => {
    if (roomState.roomPin) socketService.emit('leave_spectator', { pin: roomState.roomPin });
    resetRoom();
    socketService.disconnect();
  }, [roomState.roomPin, resetRoom]);

  const getMyRoom = useCallback(async () => {
    if (!isAuthenticated) return null;
    await connectSocket();
    try { return await emitWithResponse('get_my_room', {}, 'my_room', 5000); }
    catch { return null; }
  }, [isAuthenticated, connectSocket, emitWithResponse]);

  const forceCloseExistingRoom = useCallback(async () => {
    if (!isAuthenticated) throw new Error('Not authenticated');
    await connectSocket();
    return emitWithResponse('force_close_room', {}, 'room_force_closed', 5000);
  }, [isAuthenticated, connectSocket, emitWithResponse]);

  // Reconnection
  const reconnectHost = useCallback(async (pin, hostToken) => {
    if (!isAuthenticated) throw new Error('Not authenticated');
    await connectSocket();
    const response = await emitWithResponse('reconnect_host', { pin, hostToken }, 'host_reconnected');
    updateRoomState({ roomPin: response.pin, isHost: true, hostToken });
    return response;
  }, [isAuthenticated, connectSocket, updateRoomState, emitWithResponse]);

  const reconnectPlayer = useCallback(async (pin, playerToken) => {
    await connectSocket();
    const response = await emitWithResponse('reconnect_player', { pin, playerToken }, 'player_reconnected');
    updateRoomState({
      roomPin: response.pin, isHost: false, playerId: response.playerId,
      playerToken: response.playerToken, nickname: response.nickname,
    });
    // Save rotated token to sessionStorage for page reload resilience
    if (response.playerToken) {
      saveSession({ pin: response.pin, playerToken: response.playerToken, role: 'player', nickname: response.nickname });
    }
    return response;
  }, [connectSocket, updateRoomState, emitWithResponse]);

  const reconnectSpectator = useCallback(async (pin, spectatorToken) => {
    await connectSocket();
    const response = await emitWithResponse('reconnect_spectator', { pin, spectatorToken }, 'spectator_reconnected');
    updateRoomState({
      roomPin: response.pin, isHost: false, isSpectator: true,
      spectatorId: response.spectatorId, spectatorToken: response.spectatorToken,
      nickname: response.nickname,
    });
    // Save rotated token to sessionStorage for page reload resilience
    if (response.spectatorToken) {
      saveSession({ pin: response.pin, spectatorToken: response.spectatorToken, role: 'spectator', nickname: response.nickname });
    }
    return response;
  }, [connectSocket, updateRoomState, emitWithResponse]);

  // Player/spectator management
  const kickPlayer = useCallback((playerId) => {
    const result = hostEmit('kick_player', { playerId });
    setRoomState(prev => ({ ...prev, players: prev.players.filter(p => p.id !== playerId) }));
    return result;
  }, [hostEmit]);

  const banPlayer = useCallback((playerId) => {
    const result = hostEmit('ban_player', { playerId });
    setRoomState(prev => ({ ...prev, players: prev.players.filter(p => p.id !== playerId) }));
    return result;
  }, [hostEmit]);

  const getPlayers = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!roomState.roomPin) { reject(new Error('Not in a room')); return; }
      let settled = false;
      const cleanup = () => { socketService.off('players_list', onPlayersList); };
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('get_players timed out'));
      }, 10000);
      const onPlayersList = (response) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        cleanup();
        updateRoomState({ players: response.players });
        resolve(response.players);
      };
      socketService.on('players_list', onPlayersList);
      socketService.emit('get_players', { pin: roomState.roomPin });
    });
  }, [roomState.roomPin, updateRoomState]);

  const getSpectators = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!roomState.roomPin) { reject(new Error('Not in a room')); return; }
      let settled = false;
      const cleanup = () => { socketService.off('spectators_list', onSpectatorsList); };
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('get_spectators timed out'));
      }, 10000);
      const onSpectatorsList = (response) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        cleanup();
        updateRoomState({ spectators: response.spectators });
        resolve(response.spectators);
      };
      socketService.on('spectators_list', onSpectatorsList);
      socketService.emit('get_spectators', { pin: roomState.roomPin });
    });
  }, [roomState.roomPin, updateRoomState]);

  // Ban management
  const unbanNickname = useCallback((nickname) => hostEmit('unban_nickname', { nickname }), [hostEmit]);
  const getBannedNicknames = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!roomState.roomPin) { reject(new Error('Not in a room')); return; }
      let settled = false;
      const cleanup = () => { socketService.off('banned_nicknames', onBannedNicknames); };
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('get_banned_nicknames timed out'));
      }, 10000);
      const onBannedNicknames = (response) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        cleanup();
        updateRoomState({ bannedNicknames: response.bannedNicknames });
        resolve(response.bannedNicknames);
      };
      socketService.on('banned_nicknames', onBannedNicknames);
      socketService.emit('get_banned_nicknames', { pin: roomState.roomPin });
    });
  }, [roomState.roomPin, updateRoomState]);

  // Team mode
  const enableTeamMode = useCallback(() => hostEmit('enable_team_mode'), [hostEmit]);
  const disableTeamMode = useCallback(() => hostEmit('disable_team_mode'), [hostEmit]);
  const addTeam = useCallback((name) => hostEmit('add_team', { name }), [hostEmit]);
  const removeTeam = useCallback((teamId) => hostEmit('remove_team', { teamId }), [hostEmit]);
  const assignTeam = useCallback((playerId, teamId) => hostEmit('assign_team', { playerId, teamId }), [hostEmit]);

  // Lightning round
  const setLightningRound = useCallback((enabled, questionCount) => hostEmit('set_lightning_round', { enabled, questionCount }), [hostEmit]);

  // Auto-reconnection
  const reconnectingRef = useRef(false);
  useEffect(() => {
    const attemptReconnection = async () => {
      if (reconnectingRef.current) return;
      const session = getSession();
      if (!session) return;
      reconnectingRef.current = true;
      updateRoomState({ isReconnecting: true });
      showToast.info('Reconnecting...');
      try {
        if (session.role === 'host' && session.hostToken && isAuthenticated) {
          await reconnectHost(session.pin, session.hostToken);
          updateRoomState({ isReconnecting: false });
          showToast.success('Reconnected as host!');
        } else if (session.role === 'player' && session.playerToken) {
          await reconnectPlayer(session.pin, session.playerToken);
          updateRoomState({ isReconnecting: false });
          showToast.success('Reconnected to game!');
        } else if (session.role === 'spectator' && session.spectatorToken) {
          await reconnectSpectator(session.pin, session.spectatorToken);
          updateRoomState({ isReconnecting: false });
          showToast.success('Reconnected as spectator!');
        }
      } catch (error) {
        showToast.error('Failed to reconnect: ' + error.message);
        clearSession();
        updateRoomState({ isReconnecting: false });
      } finally {
        reconnectingRef.current = false;
      }
    };

    socketService.setReconnectCallback(() => attemptReconnection());
    socketService.setDisconnectCallback((reason) => {
      if (roomState.roomPin && reason !== 'io client disconnect') {
        showToast.warning('Connection lost. Attempting to reconnect...');
      }
    });

    const session = getSession();
    if (session && !roomState.roomPin) attemptReconnection();
  }, [isAuthenticated, reconnectHost, reconnectPlayer, reconnectSpectator, updateRoomState, roomState.roomPin]);

  const value = useMemo(() => ({
    ...roomState,
    createRoom, joinRoom, joinAsSpectator,
    leaveRoom, closeRoom, leaveSpectator,
    getMyRoom, forceCloseExistingRoom,
    reconnectHost, reconnectPlayer, reconnectSpectator,
    kickPlayer, banPlayer, getPlayers, getSpectators,
    unbanNickname, getBannedNicknames,
    enableTeamMode, disableTeamMode, addTeam, removeTeam, assignTeam,
    setLightningRound,
    resetRoom, updateRoomState,
    hostEmit, emitWithResponse,
    connectSocket,
  }), [
    roomState,
    createRoom, joinRoom, joinAsSpectator,
    leaveRoom, closeRoom, leaveSpectator,
    getMyRoom, forceCloseExistingRoom,
    reconnectHost, reconnectPlayer, reconnectSpectator,
    kickPlayer, banPlayer, getPlayers, getSpectators,
    unbanNickname, getBannedNicknames,
    enableTeamMode, disableTeamMode, addTeam, removeTeam, assignTeam,
    setLightningRound,
    resetRoom, updateRoomState,
    hostEmit, emitWithResponse,
    connectSocket,
  ]);

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}

export function useRoom() {
  const context = useContext(RoomContext);
  if (!context) throw new Error('useRoom must be used within a RoomProvider');
  return context;
}

export { getSession, clearSession, saveSession };
