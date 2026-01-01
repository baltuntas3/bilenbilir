/**
 * Domain Records
 *
 * Records are immutable snapshots of completed domain processes.
 * Unlike Entities, they don't have a lifecycle - once created, they never change.
 * They are used for historical data, analytics, and reporting.
 *
 * Key characteristics:
 * - Immutable (frozen after construction)
 * - No mutation methods
 * - Only getters and calculations
 * - Persisted for historical purposes
 */

const { GameSession, GameSessionStatus, PlayerResult, AnswerRecord } = require('./GameSession');

module.exports = {
  GameSession,
  GameSessionStatus,
  PlayerResult,
  AnswerRecord
};
