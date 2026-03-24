class LockManager {
  constructor(timeoutMs = 10000) {
    this.locks = new Map();
    this.timeoutMs = timeoutMs;
  }

  acquire(key) {
    const existing = this.locks.get(key);

    if (existing && existing.active) {
      // Safety net: if the lock has been held longer than timeout,
      // it's likely a leaked lock (crashed operation). Force-release it.
      if (Date.now() - existing.acquiredAt >= this.timeoutMs) {
        this.locks.delete(key);
      } else {
        return false;
      }
    }

    this.locks.set(key, { active: true, acquiredAt: Date.now() });
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

    for (const [key, lock] of this.locks.entries()) {
      if ((now - lock.acquiredAt) >= this.timeoutMs) {
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
