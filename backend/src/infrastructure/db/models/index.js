const { User, userSchema } = require('./User');
const { Quiz, quizSchema, questionSchema } = require('./Quiz');
const { GameSession, gameSessionSchema } = require('./GameSession');

module.exports = {
  User,
  userSchema,
  Quiz,
  quizSchema,
  questionSchema,
  GameSession,
  gameSessionSchema
};
