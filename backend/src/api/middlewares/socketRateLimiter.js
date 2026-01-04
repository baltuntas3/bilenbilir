/**
 * WebSocket Rate Limiter
 * Prevents spam attacks on socket events
 */

class SocketRateLimiter {
  constructor() {
    // Map: socketId -> Map<eventName, { count, resetTime }>
    this.limits = new Map();

    // Default limits per event type
    this.eventLimits = {
      submit_answer: { maxRequests: 5, windowMs: 10000 },    // 5 per 10 seconds
      join_room: { maxRequests: 3, windowMs: 60000 },        // 3 per minute
      create_room: { maxRequests: 5, windowMs: 60000 },      // 5 per minute
      reconnect_player: { maxRequests: 5, windowMs: 60000 }, // 5 per minute
      reconnect_host: { maxRequests: 5, windowMs: 60000 },   // 5 per minute
      // Host game control operations
      start_game: { maxRequests: 3, windowMs: 60000 },       // 3 per minute
      start_answering: { maxRequests: 10, windowMs: 60000 }, // 10 per minute (one per question)
      end_answering: { maxRequests: 10, windowMs: 60000 },   // 10 per minute
      show_leaderboard: { maxRequests: 10, windowMs: 60000 },// 10 per minute
      next_question: { maxRequests: 10, windowMs: 60000 },   // 10 per minute
      default: { maxRequests: 30, windowMs: 60000 }          // 30 per minute for others
    };

    // Cleanup interval (every 5 minutes)
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Get limit config for event
   * @private
   */
  _getLimitConfig(eventName) {
    return this.eventLimits[eventName] || this.eventLimits.default;
  }

  /**
   * Check if request is allowed
   * @param {string} socketId - Socket ID
   * @param {string} eventName - Event name
   * @returns {{ allowed: boolean, retryAfter?: number }}
   */
  checkLimit(socketId, eventName) {
    const config = this._getLimitConfig(eventName);
    const now = Date.now();

    // Get or create socket's limit map
    if (!this.limits.has(socketId)) {
      this.limits.set(socketId, new Map());
    }
    const socketLimits = this.limits.get(socketId);

    // Get or create event limit data
    let eventData = socketLimits.get(eventName);

    if (!eventData || now > eventData.resetTime) {
      // First request or window expired - reset
      eventData = {
        count: 1,
        resetTime: now + config.windowMs
      };
      socketLimits.set(eventName, eventData);
      return { allowed: true };
    }

    // Within window
    if (eventData.count >= config.maxRequests) {
      // Rate limit exceeded
      const retryAfter = Math.ceil((eventData.resetTime - now) / 1000);
      return { allowed: false, retryAfter };
    }

    // Increment count
    eventData.count++;
    return { allowed: true };
  }

  /**
   * Remove socket from tracking (on disconnect)
   * @param {string} socketId - Socket ID
   */
  removeSocket(socketId) {
    this.limits.delete(socketId);
  }

  /**
   * Cleanup expired entries
   * @private
   */
  cleanup() {
    const now = Date.now();

    for (const [socketId, socketLimits] of this.limits.entries()) {
      for (const [eventName, eventData] of socketLimits.entries()) {
        if (now > eventData.resetTime) {
          socketLimits.delete(eventName);
        }
      }

      // Remove socket if no events tracked
      if (socketLimits.size === 0) {
        this.limits.delete(socketId);
      }
    }
  }

  /**
   * Stop cleanup interval (for graceful shutdown)
   */
  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Singleton instance
const socketRateLimiter = new SocketRateLimiter();

module.exports = { SocketRateLimiter, socketRateLimiter };
