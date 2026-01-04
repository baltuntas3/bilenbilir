const { Room, RoomState } = require('./Room');
const { Player } = require('./Player');
const { Quiz } = require('./Quiz');
const { Question, QuestionType } = require('./Question');
const { User } = require('./User');
const { Spectator } = require('./Spectator');
const { BaseParticipant } = require('./BaseParticipant');

// Re-export Records for backward compatibility
// Prefer importing directly from 'domain/records' for new code
const { GameSession, GameSessionStatus, PlayerResult, AnswerRecord } = require('../records');

module.exports = {
  // Entities
  Room,
  RoomState,
  Player,
  Quiz,
  Question,
  QuestionType,
  User,
  Spectator,
  BaseParticipant,
  // Records (re-exported for backward compatibility)
  GameSession,
  GameSessionStatus,
  PlayerResult,
  AnswerRecord
};
