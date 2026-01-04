const { RoomRepository, roomRepository } = require('./RoomRepository');
const { GameSessionRepository, gameSessionRepository } = require('./GameSessionRepository');
const { MongoQuizRepository, mongoQuizRepository } = require('./MongoQuizRepository');
const { MongoUserRepository, mongoUserRepository } = require('./MongoUserRepository');
const { AuditLogRepository, auditLogRepository } = require('./AuditLogRepository');

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
  auditLogRepository
};
