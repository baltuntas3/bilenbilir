const { ValidationError } = require('../errors');
const { MIN_PASSWORD_LENGTH, MIN_USERNAME_LENGTH, MAX_USERNAME_LENGTH } = require('../config/constants');

function validatePassword(password, fieldName = 'Password') {
  if (!password || typeof password !== 'string') {
    throw new ValidationError(`${fieldName} is required`);
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(`${fieldName} must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
}

function validateUsername(username) {
  if (!username || typeof username !== 'string') {
    throw new ValidationError('Username is required');
  }
  if (username.length < MIN_USERNAME_LENGTH || username.length > MAX_USERNAME_LENGTH) {
    throw new ValidationError(`Username must be between ${MIN_USERNAME_LENGTH} and ${MAX_USERNAME_LENGTH} characters`);
  }
}

function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    throw new ValidationError('Email is required');
  }
  const trimmed = email.trim();
  if (trimmed.length === 0) {
    throw new ValidationError('Email is required');
  }
  // Basic email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    throw new ValidationError('Invalid email format');
  }
}

function validateRequired(fields) {
  for (const [name, value] of Object.entries(fields)) {
    if (!value) {
      throw new ValidationError(`${name} is required`);
    }
  }
}

module.exports = { validatePassword, validateUsername, validateEmail, validateRequired };
