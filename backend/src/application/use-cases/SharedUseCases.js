const { NotFoundError, ForbiddenError } = require('../../shared/errors');

class SharedUseCases {
  constructor(roomRepository, quizRepository) {
    this.roomRepository = roomRepository;
    this.quizRepository = quizRepository;
  }

  async _getRoomOrThrow(pin) {
    const room = await this.roomRepository.findByPin(pin);
    if (!room) {
      throw new NotFoundError('Room not found');
    }
    return room;
  }

  async _getQuizOrThrow(quizId) {
    const quiz = await this.quizRepository.findById(quizId);
    if (!quiz) {
      throw new NotFoundError('Quiz not found');
    }
    return quiz;
  }

  _throwIfNotHost(room, requesterId) {
    if (!room.isHost(requesterId)) {
      throw new ForbiddenError('Only host can perform this action');
    }
  }

  async isInState(pin, state) {
    const room = await this.roomRepository.findByPin(pin);
    return room ? room.state === state : false;
  }
}

module.exports = { SharedUseCases };
