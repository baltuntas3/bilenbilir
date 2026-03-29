const { Answer, MAX_ANSWER_SCORE } = require('./Answer');
const { PIN } = require('./PIN');
const { Score } = require('./Score');
const { Nickname } = require('./Nickname');
const { PowerUpType, POWER_UP_LABELS, DEFAULT_POWER_UPS, powerUpRegistry } = require('./PowerUp');

module.exports = {
  Answer,
  MAX_ANSWER_SCORE,
  PIN,
  Score,
  Nickname,
  PowerUpType,
  POWER_UP_LABELS,
  DEFAULT_POWER_UPS,
  powerUpRegistry
};
