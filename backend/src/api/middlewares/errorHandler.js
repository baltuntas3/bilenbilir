/**
 * Global Error Handler Middleware
 * Catches all errors and returns appropriate responses
 */

const { AppError } = require('../../shared/errors');

/**
 * Express error handler middleware
 * Must have 4 parameters to be recognized as error handler
 */
const errorHandler = (err, req, res, next) => {
  // Already sent response
  if (res.headersSent) {
    return next(err);
  }

  // Operational errors (known/expected)
  if (err instanceof AppError && err.isOperational) {
    return res.status(err.statusCode).json({
      error: err.message
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Invalid token'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Token expired'
    });
  }

  // Mongoose validation errors
  if (err.name === 'ValidationError' && err.errors) {
    const messages = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({
      error: messages.join(', ')
    });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(409).json({
      error: `${field} already exists`
    });
  }

  // Unknown/programming errors - log and sanitize
  console.error('Internal server error:', err);

  return res.status(500).json({
    error: 'An unexpected error occurred'
  });
};

/**
 * Socket.io error handler
 * For use in WebSocket handlers
 * Uses same { error: ... } format as REST API for consistency
 */
const handleSocketError = (socket, error) => {
  if (error instanceof AppError && error.isOperational) {
    socket.emit('error', { error: error.message });
    return;
  }

  // JWT errors
  if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
    socket.emit('error', { error: 'Authentication error' });
    return;
  }

  // Unknown errors
  console.error('Socket error:', error);
  socket.emit('error', { error: 'An unexpected error occurred' });
};

module.exports = { errorHandler, handleSocketError };
