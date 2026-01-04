import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3000';

class SocketService {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
  }

  connect(token = null) {
    if (this.socket?.connected) {
      return this.socket;
    }

    const auth = token ? { token } : {};

    this.socket = io(SOCKET_URL, {
      auth,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      console.log('Socket connected:', this.socket.id);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error.message);
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.listeners.clear();
    }
  }

  emit(event, data, callback) {
    if (!this.socket?.connected) {
      console.error('Socket not connected');
      return;
    }
    if (callback) {
      this.socket.emit(event, data, callback);
    } else {
      this.socket.emit(event, data);
    }
  }

  on(event, callback) {
    if (!this.socket) {
      console.error('Socket not initialized');
      return;
    }
    this.socket.on(event, callback);

    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (!this.socket) return;

    if (callback) {
      this.socket.off(event, callback);
      const callbacks = this.listeners.get(event);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) callbacks.splice(index, 1);
      }
    } else {
      this.socket.off(event);
      this.listeners.delete(event);
    }
  }

  removeAllListeners() {
    if (this.socket) {
      this.listeners.forEach((_, event) => {
        this.socket.off(event);
      });
      this.listeners.clear();
    }
  }

  isConnected() {
    return this.socket?.connected || false;
  }

  getSocketId() {
    return this.socket?.id;
  }

  // Room Events
  createRoom(quizId, callback) {
    this.emit('create_room', { quizId }, callback);
  }

  joinRoom(pin, nickname, callback) {
    this.emit('join_room', { pin, nickname }, callback);
  }

  leaveRoom(pin, callback) {
    this.emit('leave_room', { pin }, callback);
  }

  closeRoom(pin, callback) {
    this.emit('close_room', { pin }, callback);
  }

  getPlayers(pin, callback) {
    this.emit('get_players', { pin }, callback);
  }

  kickPlayer(pin, playerId, callback) {
    this.emit('kick_player', { pin, playerId }, callback);
  }

  banPlayer(pin, playerId, callback) {
    this.emit('ban_player', { pin, playerId }, callback);
  }

  // Reconnection Events
  reconnectHost(pin, hostToken, callback) {
    this.emit('reconnect_host', { pin, hostToken }, callback);
  }

  reconnectPlayer(pin, playerToken, callback) {
    this.emit('reconnect_player', { pin, playerToken }, callback);
  }

  // Game Events
  startGame(pin, callback) {
    this.emit('start_game', { pin }, callback);
  }

  startAnswering(pin, callback) {
    this.emit('start_answering', { pin }, callback);
  }

  submitAnswer(pin, answerIndex, callback) {
    this.emit('submit_answer', { pin, answerIndex }, callback);
  }

  endAnswering(pin, callback) {
    this.emit('end_answering', { pin }, callback);
  }

  showLeaderboard(pin, callback) {
    this.emit('show_leaderboard', { pin }, callback);
  }

  nextQuestion(pin, callback) {
    this.emit('next_question', { pin }, callback);
  }

  getResults(pin, callback) {
    this.emit('get_results', { pin }, callback);
  }

  pauseGame(pin, callback) {
    this.emit('pause_game', { pin }, callback);
  }

  resumeGame(pin, callback) {
    this.emit('resume_game', { pin }, callback);
  }

  requestTimerSync(pin, callback) {
    this.emit('request_timer_sync', { pin }, callback);
  }
}

export const socketService = new SocketService();
