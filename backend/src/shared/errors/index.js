/**
 * Custom Application Errors
 * Centralized error handling with proper HTTP status codes
 *
 * isOperational: true = expected errors (user input, business logic)
 * isOperational: false = programming errors, bugs, unexpected failures
 */

class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 500 Internal Server Error - Unexpected/programming errors
 * isOperational = false by default (unexpected error)
 */
class InternalError extends AppError {
  constructor(message = 'Internal server error', isOperational = false) {
    super(message, 500, isOperational);
  }
}

/**
 * 503 Service Unavailable - Database/external service errors
 */
class DatabaseError extends AppError {
  constructor(message = 'Database error') {
    super(message, 503, true);
  }
}

/**
 * 400 Bad Request - Validation errors, invalid input
 */
class ValidationError extends AppError {
  constructor(message) {
    super(message, 400);
  }
}

/**
 * 401 Unauthorized - Authentication required
 */
class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401);
  }
}

/**
 * 403 Forbidden - Not authorized to access resource
 */
class ForbiddenError extends AppError {
  constructor(message = 'Not authorized') {
    super(message, 403);
  }
}

/**
 * 404 Not Found - Resource not found
 */
class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404);
  }
}

/**
 * 409 Conflict - Resource already exists or state conflict
 */
class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409);
  }
}

/**
 * 429 Too Many Requests - Rate limiting
 */
class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429);
  }
}

module.exports = {
  AppError,
  InternalError,
  DatabaseError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  RateLimitError
};
