const { createRoomHandler } = require('./roomHandler');
const { createGameHandler, endAnsweringLocks } = require('./gameHandler');

module.exports = {
  createRoomHandler,
  createGameHandler,
  endAnsweringLocks
};
