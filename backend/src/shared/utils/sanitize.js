const validator = require('validator');
const { Nickname } = require('../../domain/value-objects/Nickname');

// Maximum recursion depth for object sanitization
const MAX_SANITIZE_DEPTH = 10;

// Keys that can be used for prototype pollution attacks
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Sanitize an object recursively: trim strings, block prototype pollution, enforce depth limit.
 * @param {Object} obj - Object to sanitize
 * @param {string[]} skipFields - Fields to skip (e.g., password)
 * @param {number} depth - Current recursion depth (internal use)
 * @returns {Object} - Sanitized object
 */
const sanitizeObject = (obj, skipFields = ['password', 'currentPassword', 'newPassword'], depth = 0) => {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;

  if (depth >= MAX_SANITIZE_DEPTH) {
    console.warn('[sanitizeObject] Max depth reached, rejecting nested content');
    return {};
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, skipFields, depth + 1));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (DANGEROUS_KEYS.has(key)) continue;
    if (skipFields.includes(key)) {
      sanitized[key] = value;
    } else if (typeof value === 'string') {
      sanitized[key] = value.trim();
    } else if (typeof value === 'object') {
      sanitized[key] = sanitizeObject(value, skipFields, depth + 1);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
};

/**
 * Validate and sanitize email
 * @param {string} email - Email to validate
 * @returns {string|null} - Sanitized email or null if invalid
 */
const sanitizeEmail = (email) => {
  if (typeof email !== 'string') return null;
  const normalized = validator.normalizeEmail(email.trim().toLowerCase());
  if (!normalized || !validator.isEmail(normalized)) return null;
  return normalized;
};

/**
 * Validate nickname using the Nickname value object's rules (single source of truth).
 * @param {string} nickname - Nickname to validate
 * @returns {string|null} - Validated nickname or null if invalid
 */
const sanitizeNickname = (nickname) => {
  if (typeof nickname !== 'string') return null;
  const trimmed = nickname.trim();

  if (trimmed.length < Nickname.MIN_LENGTH || trimmed.length > Nickname.MAX_LENGTH) {
    return null;
  }

  if (!Nickname.ALLOWED_PATTERN.test(trimmed)) {
    return null;
  }

  return trimmed;
};

module.exports = {
  sanitizeObject,
  sanitizeEmail,
  sanitizeNickname
};
