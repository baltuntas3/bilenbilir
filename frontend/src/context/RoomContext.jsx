import { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { socketService } from '../services/socketService';
import { useAuth } from './AuthContext';
import { showToast } from '../utils/toast';

const RoomContext = createContext(null);

// Game session storage keys (localStorage for persistence across tab close)
const SESSION_KEYS = {
  PIN: 'game_pin',
  HOST_TOKEN: 'game_host_token',
  PLAYER_TOKEN: 'game_player_token',
  SPECTATOR_TOKEN: 'game_spectator_token',
  ROLE: 'game_role',
  NICKNAME: 'game_nickname',
  TIMESTAMP: 'game_session_timestamp',
};

// Maximum session age: 4 hours
const SESSION_MAX_AGE_MS = 4 * 60 * 60 * 1000;

// Migrate old sessionStorage data to localStorage (one-time)
(() => {
  const pin = sessionStorage.getItem(SESSION_KEYS.PIN);
  if (pin && !localStorage.getItem(SESSION_KEYS.PIN)) {
    Object.values(SESSION_KEYS).forEach(key => {
      const val = sessionStorage.getItem(key);
      if (val) localStorage.setItem(key, val);
    });
  }
  Object.values(SESSION_KEYS).forEach(key => sessionStorage.removeItem(key));
})();

const saveSession = (data) => {
  if (data.pin) localStorage.setItem(SESSION_KEYS.PIN, data.pin);
  if (data.hostToken) localStorage.setItem(SESSION_KEYS.HOST_TOKEN, data.hostToken);
  if (data.playerToken) localStorage.setItem(SESSION_KEYS.PLAYER_TOKEN, data.playerToken);
  if (data.spectatorToken) localStorage.setItem(SESSION_KEYS.SPECTATOR_TOKEN, data.spectatorToken);
  if (data.role) localStorage.setItem(SESSION_KEYS.ROLE, data.role);
  if (data.nickname) localStorage.setItem(SESSION_KEYS.NICKNAME, data.nickname);
  localStorage.setItem(SESSION_KEYS.TIMESTAMP, Date.now().toString());
};

const getSession = () => {
  const pin = localStorage.getItem(SESSION_KEYS.PIN);
  const hostToken = localStorage.getItem(SESSION_KEYS.HOST_TOKEN);
  const playerToken = localStorage.getItem(SESSION_KEYS.PLAYER_TOKEN);
  const spectatorToken = localStorage.getItem(SESSION_KEYS.SPECTATOR_TOKEN);
  const role = localStorage.getItem(SESSION_KEYS.ROLE);
  const nickname = localStorage.getItem(SESSION_KEYS.NICKNAME);
  const timestamp = localStorage.getItem(SESSION_KEYS.TIMESTAMP);
  if (!pin || !role) return null;

  // Check session expiry
  if (timestamp) {
    const age = Date.now() - parseInt(timestamp, 10);
    if (age > SESSION_MAX_AGE_MS) {
      console.warn('[RoomContext] Session expired (age: ' + Math.round(age / 60000) + ' min). Clearing stale session.');
      clearSession();
      return null;
    }
  }

  return { pin, hostToken, playerToken, spectatorToken, role, nickname };
};

const clearSession = () => {
  Object.values(SESSION_KEYS).forEach(key => localStorage.removeItem(key));
};

// Static list of room-level socket events — declared outside component to avoid
// re-creation on every render and stale closure issues in cleanupRoomListeners.
const ROOM_EVENTS = [
  'player_joined', 'player_left', 'player_removed', 'player_kicked', 'player_banned',
  'player_returned', 'spectator_joined', 'spectator_left', 'spectator_returned',
  'team_mode_updated', 'teams_updated', 'lightning_round_updated',
  'banned_nicknames', 'nickname_unbanned',
];

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
    return socketService.emitWithAck(emitEvent, emitData, timeoutMs);
  }, []);

  const hostEmit = useCallback((event, extraData = {}) => {
    if (!roomState.isHost || !roomState.roomPin) {
      return Promise.reject(new Error('Not authorized'));
    }
    return socketService.emitWithAck(event, { pin: roomState.roomPin, ...extraData }, 10000);
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

  const cleanupRoomListeners = useCallback(() => {
    ROOM_EVENTS.forEach(event => socketService.off(event));
    roomListenersSetupRef.current = false;
    lastRoomSocketIdRef.current = null;
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

    socketService.on('player_left', ({ playerId, disconnected }) => {
      setRoomState(prev => {
        if (disconnected) {
          return {
            ...prev,
            players: prev.players.map(p =>
              p.id === playerId ? { ...p, disconnected: true } : p
            ),
          };
        }
        return {
          ...prev,
          players: prev.players.filter(p => p.id !== playerId),
        };
      });
    });

    // Cleanup service removes stale disconnected players after grace period
    socketService.on('player_removed', ({ playerId, nickname }) => {
      setRoomState(prev => ({
        ...prev,
        players: prev.players.filter(p => p.id !== playerId),
      }));
      if (nickname) showToast.info(`${nickname} removed (reconnection timeout)`);
    });

    socketService.on('player_kicked', ({ playerId, nickname }) => {
      setRoomState(prev => ({
        ...prev,
        players: prev.players.filter(p => p.id !== playerId),
      }));
      showToast.success(`${nickname} was kicked`);
    });

    socketService.on('player_banned', ({ playerId, nickname }) => {
      setRoomState(prev => ({
        ...prev,
        players: prev.players.filter(p => p.id !== playerId),
      }));
      showToast.success(`${nickname} was banned`);
    });

    socketService.on('player_returned', ({ playerId, nickname }) => {
      setRoomState(prev => {
        const exists = prev.players.some(p => p.id === playerId);
        if (exists) {
          return {
            ...prev,
            players: prev.players.map(p =>
              p.id === playerId ? { ...p, disconnected: false } : p
            ),
          };
        }
        // Player not in list (timing edge case) — add them
        return {
          ...prev,
          players: [...prev.players, { id: playerId, nickname, disconnected: false }],
        };
      });
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
      setRoomState(prev => {
        const exists = prev.spectators.some(s => s.id === spectatorId);
        if (exists) {
          return {
            ...prev,
            spectators: prev.spectators.map(s =>
              s.id === spectatorId ? { ...s, disconnected: false } : s
            ),
          };
        }
        // Spectator was removed from list after disconnect — re-add
        return {
          ...prev,
          spectators: [...prev.spectators, { id: spectatorId, nickname, disconnected: false }],
        };
      });
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

  const closeRoom = useCallback(async () => {
    if (!roomState.isHost || !roomState.roomPin) return;
    try {
      await emitWithResponse('close_room', { pin: roomState.roomPin }, 'room_closed', 5000);
    } catch {
      // Best-effort: even if server didn't confirm, clean up locally
    } finally {
      resetRoom();
      socketService.disconnect();
    }
  }, [roomState.isHost, roomState.roomPin, resetRoom, emitWithResponse]);

  const leaveSpectator = useCallback(() => {
    if (roomState.roomPin) socketService.emit('leave_spectator', { pin: roomState.roomPin });
    resetRoom();
    socketService.disconnect();
  }, [roomState.roomPin, resetRoom]);

  const getMyRoom = useCallback(async () => {
    if (!isAuthenticated) return null;
    await connectSocket();
    try {
      const result = await emitWithResponse('get_my_room', {}, 'my_room', 5000);
      return result?.pin ? result : null;
    }
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
    const rotatedToken = response.hostToken || hostToken;
    if (!response.hostToken) {
      console.warn('[RoomContext] Server did not return a new hostToken on reconnect; using previous token as fallback.');
    }
    updateRoomState({ roomPin: response.pin, isHost: true, hostToken: rotatedToken });
    saveSession({ pin: response.pin, hostToken: rotatedToken, role: 'host' });
    return response;
  }, [isAuthenticated, connectSocket, updateRoomState, emitWithResponse]);

  const reconnectPlayer = useCallback(async (pin, playerToken) => {
    await connectSocket();
    const response = await emitWithResponse('reconnect_player', { pin, playerToken }, 'player_reconnected');
    const rotatedToken = response.playerToken || playerToken;
    if (!response.playerToken) {
      console.warn('[RoomContext] Server did not return a new playerToken on reconnect; using previous token as fallback.');
    }
    updateRoomState({
      roomPin: response.pin, isHost: false, playerId: response.playerId,
      playerToken: rotatedToken, nickname: response.nickname,
    });
    saveSession({ pin: response.pin, playerToken: rotatedToken, role: 'player', nickname: response.nickname });
    return response;
  }, [connectSocket, updateRoomState, emitWithResponse]);

  const reconnectSpectator = useCallback(async (pin, spectatorToken) => {
    await connectSocket();
    const response = await emitWithResponse('reconnect_spectator', { pin, spectatorToken }, 'spectator_reconnected');
    const rotatedToken = response.spectatorToken || spectatorToken;
    if (!response.spectatorToken) {
      console.warn('[RoomContext] Server did not return a new spectatorToken on reconnect; using previous token as fallback.');
    }
    updateRoomState({
      roomPin: response.pin, isHost: false, isSpectator: true,
      spectatorId: response.spectatorId, spectatorToken: rotatedToken,
      nickname: response.nickname,
    });
    saveSession({ pin: response.pin, spectatorToken: rotatedToken, role: 'spectator', nickname: response.nickname });
    return response;
  }, [connectSocket, updateRoomState, emitWithResponse]);

  // Player/spectator management
  const kickPlayer = useCallback((playerId) => {
    return hostEmit('kick_player', { playerId });
  }, [hostEmit]);

  const banPlayer = useCallback((playerId) => {
    return hostEmit('ban_player', { playerId });
  }, [hostEmit]);

  const getPlayers = useCallback(() => {
    if (!roomState.roomPin) return Promise.reject(new Error('Not in a room'));
    return emitWithResponse('get_players', { pin: roomState.roomPin }, 'players_list', 10000)
      .then((response) => {
        updateRoomState({ players: response.players });
        return response.players;
      });
  }, [roomState.roomPin, updateRoomState, emitWithResponse]);

  const getSpectators = useCallback(() => {
    if (!roomState.roomPin) return Promise.reject(new Error('Not in a room'));
    return emitWithResponse('get_spectators', { pin: roomState.roomPin }, 'spectators_list', 10000)
      .then((response) => {
        updateRoomState({ spectators: response.spectators });
        return response.spectators;
      });
  }, [roomState.roomPin, updateRoomState, emitWithResponse]);

  // Ban management
  const unbanNickname = useCallback((nickname) => hostEmit('unban_nickname', { nickname }), [hostEmit]);
  const getBannedNicknames = useCallback(() => {
    if (!roomState.roomPin) return Promise.reject(new Error('Not in a room'));
    return emitWithResponse('get_banned_nicknames', { pin: roomState.roomPin }, 'banned_nicknames', 10000)
      .then((response) => {
        updateRoomState({ bannedNicknames: response.bannedNicknames });
        return response.bannedNicknames;
      });
  }, [roomState.roomPin, updateRoomState, emitWithResponse]);

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
  const roomPinRef = useRef(roomState.roomPin);
  roomPinRef.current = roomState.roomPin;

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
        } else {
          // No matching reconnection path (e.g. host session but not authenticated)
          clearSession();
          updateRoomState({ isReconnecting: false });
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
      // Use ref to avoid stale closure — roomPin changes shouldn't re-run this effect
      if (roomPinRef.current && reason !== 'io client disconnect') {
        showToast.warning('Connection lost. Attempting to reconnect...');
      }
    });

    const session = getSession();
    if (session && !roomPinRef.current) attemptReconnection();

    return () => {
      socketService.setReconnectCallback(null);
      socketService.setDisconnectCallback(null);
    };
  }, [isAuthenticated, reconnectHost, reconnectPlayer, reconnectSpectator, updateRoomState]);

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
