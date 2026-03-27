const { createRoomHandler } = require('./roomHandler');
const { createGameHandler, endAnsweringLocks, nextQuestionLocks } = require('./gameHandler');

module.exports = {
  createRoomHandler,
  createGameHandler,
  endAnsweringLocks,
  nextQuestionLocks
};
