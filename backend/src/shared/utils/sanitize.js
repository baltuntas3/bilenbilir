const validator = require('validator');

// Nickname validation constants (must match Nickname value object)
const NICKNAME_MIN_LENGTH = 2;
const NICKNAME_MAX_LENGTH = 15;
const NICKNAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

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
 * Sanitize an object recursively
 * @param {Object} obj - Object to sanitize
 * @param {string[]} skipFields - Fields to skip (e.g., password)
 * @returns {Object} - Sanitized object
 */
const sanitizeObject = (obj, skipFields = ['password', 'currentPassword', 'newPassword']) => {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, skipFields));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (skipFields.includes(key)) {
      sanitized[key] = value;
    } else if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value);
    } else if (typeof value === 'object') {
      sanitized[key] = sanitizeObject(value, skipFields);
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
 * Validate nickname (alphanumeric, underscore, hyphen)
 * Uses same validation rules as Nickname value object
 * @param {string} nickname - Nickname to validate
 * @returns {string|null} - Sanitized nickname or null if invalid
 */
const sanitizeNickname = (nickname) => {
  if (typeof nickname !== 'string') return null;
  const trimmed = nickname.trim();

  // Validate length
  if (trimmed.length < NICKNAME_MIN_LENGTH || trimmed.length > NICKNAME_MAX_LENGTH) {
    return null;
  }

  // Validate pattern
  if (!NICKNAME_PATTERN.test(trimmed)) {
    return null;
  }

  return validator.escape(trimmed);
};

module.exports = {
  sanitizeString,
  sanitizeObject,
  sanitizeEmail,
  sanitizeNickname
};
