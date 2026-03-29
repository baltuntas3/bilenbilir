const { NotFoundError, ForbiddenError, ValidationError } = require('../../shared/errors');

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

  _getQuestionFromSnapshot(room, index) {
    const snapshot = room.getQuizSnapshot();
    if (!snapshot) throw new ValidationError('Game has not started - no quiz snapshot available');
    const question = snapshot.getQuestion(index);
    if (!question) throw new NotFoundError(`Question at index ${index} not found`);
    return question;
  }
}

module.exports = { SharedUseCases };
