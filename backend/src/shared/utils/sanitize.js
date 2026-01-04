const validator = require('validator');

// Nickname validation constants (must match Nickname value object)
const NICKNAME_MIN_LENGTH = 2;
const NICKNAME_MAX_LENGTH = 15;
const NICKNAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

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

  // Prevent stack overflow from deeply nested or circular objects
  if (depth >= MAX_SANITIZE_DEPTH) {
    console.warn('[sanitizeObject] Max depth reached, returning object as-is');
    return obj;
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
 * Validate nickname (alphanumeric, underscore, hyphen)
 * Uses same validation rules as Nickname value object
 * @param {string} nickname - Nickname to validate
 * @returns {string|null} - Validated nickname or null if invalid
 */
const sanitizeNickname = (nickname) => {
  if (typeof nickname !== 'string') return null;
  const trimmed = nickname.trim();

  // Validate length
  if (trimmed.length < NICKNAME_MIN_LENGTH || trimmed.length > NICKNAME_MAX_LENGTH) {
    return null;
  }

  // Validate pattern - only allows safe characters (a-z, A-Z, 0-9, _, -)
  // No escaping needed since pattern guarantees safe characters
  if (!NICKNAME_PATTERN.test(trimmed)) {
    return null;
  }

  return trimmed;
};

module.exports = {
  sanitizeObject,
  sanitizeEmail,
  sanitizeNickname
};
