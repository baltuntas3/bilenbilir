const validator = require('validator');
const { Nickname } = require('../../domain/value-objects/Nickname');

// Maximum recursion depth for object sanitization
const MAX_SANITIZE_DEPTH = 10;

/**
 * Sanitize a string to prevent XSS attacks
 * @param {string} str - String to sanitize
 * @returns {string} - Sanitized string
 */
const sanitizeString = (str) => {
  if (typeof str !== 'string') return str;
  return validator.escape(str.trim());
};

/**
 * Sanitize an object recursively with depth limit to prevent stack overflow
 * @param {Object} obj - Object to sanitize
 * @param {string[]} skipFields - Fields to skip (e.g., password)
 * @param {number} depth - Current recursion depth (internal use)
 * @returns {Object} - Sanitized object
 */
const sanitizeObject = (obj, skipFields = ['password', 'currentPassword', 'newPassword'], depth = 0) => {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;

  // Reject deeply nested objects to prevent both stack overflow and XSS bypass
  if (depth >= MAX_SANITIZE_DEPTH) {
    console.warn('[sanitizeObject] Max depth reached, rejecting nested content');
    return {};
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, skipFields, depth + 1));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (skipFields.includes(key)) {
      sanitized[key] = value;
    } else if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value);
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
