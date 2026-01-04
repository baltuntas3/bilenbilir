const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  // Who performed the action
  actorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  actorEmail: {
    type: String,
    required: true
  },
  actorRole: {
    type: String,
    enum: ['user', 'admin'],
    required: true
  },

  // What action was performed
  action: {
    type: String,
    required: true,
    enum: [
      // User management
      'USER_ROLE_UPDATED',
      'USER_STATUS_UPDATED',
      'USER_DELETED',

      // Quiz management
      'QUIZ_DELETED_ADMIN',

      // Room management
      'ROOM_CLOSED_ADMIN',

      // Session management
      'SESSION_DELETED'
    ]
  },

  // Target of the action
  targetType: {
    type: String,
    required: true,
    enum: ['user', 'quiz', 'room', 'session']
  },
  targetId: {
    type: String,
    required: true
  },

  // Additional details about the action
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // IP address of the requester (optional)
  ipAddress: {
    type: String,
    default: null
  },

  // Timestamp
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

// Compound indexes for efficient querying
auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

module.exports = { AuditLog, auditLogSchema };
