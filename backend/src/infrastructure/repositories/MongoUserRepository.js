const { User } = require('../db/models');

/**
 * MongoDB User Repository
 * Abstracts database operations for User entity
 */
class MongoUserRepository {
  /**
   * Find user by ID
   * @param {string} id - User ID
   * @param {object} options - Query options
   * @param {boolean} options.includePassword - Include password field (default: false)
   */
  async findById(id, { includePassword = false } = {}) {
    try {
      const query = User.findById(id);
      if (!includePassword) {
        query.select('-password');
      }
      return await query;
    } catch {
      return null;
    }
  }

  /**
   * Find user by email
   * @param {string} email - User email (will be lowercased)
   */
  async findByEmail(email) {
    return await User.findOne({ email: email.toLowerCase() });
  }

  /**
   * Find user by username
   * @param {string} username - Username
   */
  async findByUsername(username) {
    return await User.findOne({ username });
  }

  /**
   * Find user by email or username
   * @param {string} email - User email
   * @param {string} username - Username
   */
  async findByEmailOrUsername(email, username) {
    return await User.findOne({
      $or: [{ email: email.toLowerCase() }, { username }]
    });
  }

  /**
   * Find user by username excluding a specific user ID
   * @param {string} username - Username to check
   * @param {string} excludeId - User ID to exclude from search
   */
  async findByUsernameExcluding(username, excludeId) {
    return await User.findOne({ username, _id: { $ne: excludeId } });
  }

  /**
   * Find user by password reset token
   * @param {string} hashedToken - Hashed reset token
   */
  async findByResetToken(hashedToken) {
    return await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });
  }

  /**
   * Create a new user
   * @param {object} userData - User data
   */
  async create(userData) {
    const user = new User({
      email: userData.email.toLowerCase(),
      password: userData.password,
      username: userData.username
    });
    return await user.save();
  }

  /**
   * Update user by ID
   * @param {string} id - User ID
   * @param {object} updates - Fields to update
   * @param {object} options - Update options
   * @param {boolean} options.includePassword - Include password in returned user
   */
  async updateById(id, updates, { includePassword = false } = {}) {
    const query = User.findByIdAndUpdate(id, updates, { new: true });
    if (!includePassword) {
      query.select('-password');
    }
    return await query;
  }

  /**
   * Save user instance (for complex updates)
   * @param {User} user - User document instance
   */
  async save(user) {
    return await user.save();
  }

  /**
   * Check if email exists
   * @param {string} email - Email to check
   */
  async emailExists(email) {
    const count = await User.countDocuments({ email: email.toLowerCase() });
    return count > 0;
  }

  /**
   * Check if username exists
   * @param {string} username - Username to check
   */
  async usernameExists(username) {
    const count = await User.countDocuments({ username });
    return count > 0;
  }
}

const mongoUserRepository = new MongoUserRepository();

module.exports = { MongoUserRepository, mongoUserRepository };
