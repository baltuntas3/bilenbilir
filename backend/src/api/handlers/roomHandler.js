/**
 * Room WebSocket Handler
 * Handles room creation, joining, and leaving
 */
const createRoomHandler = (io, socket, roomUseCases, timerService = null) => {
  // Host creates a room
  socket.on('create_room', async (data) => {
    try {
      const { quizId } = data || {};

      const result = await roomUseCases.createRoom({
        hostId: socket.id,
        quizId
      });

      socket.join(result.room.pin);

      socket.emit('room_created', {
        pin: result.room.pin,
        hostToken: result.hostToken,
        quizTitle: result.quiz.title,
        totalQuestions: result.quiz.getTotalQuestions()
      });
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  // Player joins a room
  socket.on('join_room', async (data) => {
    try {
      const { pin, nickname } = data || {};

      const result = await roomUseCases.joinRoom({
        pin,
        nickname,
        socketId: socket.id
      });

      socket.join(pin);

      socket.emit('room_joined', {
        pin,
        playerId: result.player.id,
        playerToken: result.playerToken,
        nickname: result.player.nickname
      });

      io.to(pin).emit('player_joined', {
        player: {
          id: result.player.id,
          nickname: result.player.nickname
        },
        playerCount: result.room.getPlayerCount()
      });
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  // Player or host leaves room
  socket.on('leave_room', async (data) => {
    try {
      const { pin } = data || {};

      const { room } = await roomUseCases.getRoom({ pin });

      // If host is leaving, close the room
      if (room.isHost(socket.id)) {
        await roomUseCases.closeRoom({
          pin,
          requesterId: socket.id
        });

        io.to(pin).emit('room_closed', { reason: 'host_left' });
        io.in(pin).socketsLeave(pin);
        return;
      }

      // Player leaving
      const result = await roomUseCases.leaveRoom({
        pin,
        socketId: socket.id
      });

      socket.leave(pin);

      io.to(pin).emit('player_left', {
        socketId: socket.id,
        playerCount: result.room.getPlayerCount()
      });
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  // Get players list
  socket.on('get_players', async (data) => {
    try {
      const { pin } = data || {};

      const result = await roomUseCases.getPlayers({ pin });

      socket.emit('players_list', {
        players: result.players.map(p => ({
          id: p.id,
          nickname: p.nickname
        }))
      });
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  // Host closes room
  socket.on('close_room', async (data) => {
    try {
      const { pin } = data || {};

      await roomUseCases.closeRoom({
        pin,
        requesterId: socket.id
      });

      io.to(pin).emit('room_closed');
      io.in(pin).socketsLeave(pin);
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  // Host reconnects to room
  socket.on('reconnect_host', async (data) => {
    try {
      const { pin, hostToken } = data || {};

      const result = await roomUseCases.reconnectHost({
        pin,
        hostToken,
        newSocketId: socket.id
      });

      socket.join(pin);

      socket.emit('host_reconnected', {
        pin: result.room.pin,
        state: result.room.state,
        playerCount: result.room.getPlayerCount(),
        currentQuestionIndex: result.room.currentQuestionIndex
      });

      socket.to(pin).emit('host_returned');
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  // Player reconnects to room
  socket.on('reconnect_player', async (data) => {
    try {
      const { pin, playerToken } = data || {};

      const result = await roomUseCases.reconnectPlayer({
        pin,
        playerToken,
        newSocketId: socket.id
      });

      socket.join(pin);

      // Get timer sync data if in answering phase
      const timerSync = timerService ? timerService.getTimerSync(pin) : null;

      socket.emit('player_reconnected', {
        pin: result.room.pin,
        playerId: result.player.id,
        nickname: result.player.nickname,
        score: result.player.score,
        state: result.room.state,
        currentQuestionIndex: result.room.currentQuestionIndex,
        timerSync // null if not in answering phase or no timer
      });

      socket.to(pin).emit('player_returned', {
        playerId: result.player.id,
        nickname: result.player.nickname
      });
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });
};

module.exports = { createRoomHandler };
