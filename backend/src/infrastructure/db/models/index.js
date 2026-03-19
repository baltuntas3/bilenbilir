const { User, userSchema } = require('./User');
const { Quiz, quizSchema, questionSchema } = require('./Quiz');
const { GameSession, gameSessionSchema } = require('./GameSession');
const { AuditLog, auditLogSchema } = require('./AuditLog');
const { QuizRating } = require('./QuizRating');

module.exports = {
  User,
  userSchema,
  Quiz,
  quizSchema,
  questionSchema,
  GameSession,
  gameSessionSchema,
  AuditLog,
  auditLogSchema,
  QuizRating
};
