class LockManager {
  constructor(timeoutMs = 10000) {
    this.locks = new Map();
    this.timeoutMs = timeoutMs;
  }

  acquire(key) {
    const now = Date.now();
    const existingLock = this.locks.get(key);

    if (existingLock && (now - existingLock) < this.timeoutMs) {
      return false;
    }

    this.locks.set(key, now);
    return true;
  }

  release(key) {
    this.locks.delete(key);
  }

  async withLock(key, errorMessage, fn) {
    if (!this.acquire(key)) {
      throw new (require('../errors').ConflictError)(errorMessage);
    }
    try {
      return await fn();
    } finally {
      this.release(key);
    }
  }

  cleanupExpired() {
    const now = Date.now();
    let removedCount = 0;

    for (const [key, timestamp] of this.locks.entries()) {
      if ((now - timestamp) >= this.timeoutMs) {
        this.locks.delete(key);
        removedCount++;
      }
    }

    return removedCount;
  }

  clearByPrefix(prefix) {
    for (const key of this.locks.keys()) {
      if (key.startsWith(prefix)) {
        this.locks.delete(key);
      }
    }
  }
}

module.exports = { LockManager };
