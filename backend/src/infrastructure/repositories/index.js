const { RoomRepository, roomRepository } = require('./RoomRepository');
const { GameSessionRepository, gameSessionRepository } = require('./GameSessionRepository');
const { MongoQuizRepository, mongoQuizRepository } = require('./MongoQuizRepository');
const { MongoUserRepository, mongoUserRepository } = require('./MongoUserRepository');
const { AuditLogRepository, auditLogRepository } = require('./AuditLogRepository');
const { QuizRatingRepository, quizRatingRepository } = require('./QuizRatingRepository');

module.exports = {
  RoomRepository,
  roomRepository,
  GameSessionRepository,
  gameSessionRepository,
  MongoQuizRepository,
  mongoQuizRepository,
  MongoUserRepository,
  mongoUserRepository,
  AuditLogRepository,
  auditLogRepository,
  QuizRatingRepository,
  quizRatingRepository
};
