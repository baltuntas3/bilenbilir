import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3000';

class SocketService {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
    this.connectionPromise = null;
    this.currentSocketId = null;
  }

  connect(token = null) {
    // If already connected with the same socket, return existing promise
    if (this.socket?.connected) {
      return Promise.resolve(this.socket);
    }

    // If connection is in progress, return existing promise
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    const auth = token ? { token } : {};

    // Store if we had a previous socket (need to re-attach listeners)
    const hadPreviousSocket = this.socket !== null;

    this.socket = io(SOCKET_URL, {
      auth,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    this.connectionPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 10000);

      this.socket.on('connect', () => {
        clearTimeout(timeout);
        console.log('Socket connected:', this.socket.id);
        this.currentSocketId = this.socket.id;

        // Re-attach stored listeners if this is a new socket
        if (hadPreviousSocket && this.listeners.size > 0) {
          console.log('Re-attaching listeners to new socket...');
          this.listeners.forEach((callbacks, event) => {
            callbacks.forEach(callback => {
              this.socket.on(event, callback);
            });
          });
        }

        resolve(this.socket);
      });

      this.socket.on('connect_error', (error) => {
        clearTimeout(timeout);
        console.error('Socket connection error:', error.message);
        reject(error);
      });
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      this.connectionPromise = null;
    });

    return this.connectionPromise;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.listeners.clear();
      this.connectionPromise = null;
    }
  }

  emit(event, data) {
    if (!this.socket?.connected) {
      console.error('Socket not connected, cannot emit:', event);
      return;
    }
    this.socket.emit(event, data);
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
}

export const socketService = new SocketService();
