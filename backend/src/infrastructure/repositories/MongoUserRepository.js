const { User: UserModel } = require('../db/models');
const { User } = require('../../domain/entities');

/**
 * MongoDB User Repository
 * Abstracts database operations for User entity
 * Converts between Mongoose documents and Domain entities
 */
class MongoUserRepository {
  /**
   * Convert Mongoose document to Domain entity
   * @private
   * @param {Object} doc - Mongoose document
   * @param {boolean} includePassword - Include password in domain entity
   * @returns {User|null}
   */
  _toDomain(doc, includePassword = false) {
    if (!doc) return null;

    return new User({
      id: doc._id.toString(),
      email: doc.email,
      username: doc.username,
      password: includePassword ? doc.password : null,
      role: doc.role,
      isActive: doc.isActive,
      passwordResetToken: doc.passwordResetToken,
      passwordResetExpires: doc.passwordResetExpires,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt
    });
  }

  /**
   * Find user by ID
   * @param {string} id - User ID
   * @param {object} options - Query options
   * @param {boolean} options.includePassword - Include password field (default: false)
   * @returns {Promise<User|null>} Domain entity
   */
  async findById(id, { includePassword = false } = {}) {
    try {
      const query = UserModel.findById(id);
      if (!includePassword) {
        query.select('-password');
      }
      const doc = await query;
      return this._toDomain(doc, includePassword);
    } catch (error) {
      // Log database errors for debugging, but don't expose to caller
      console.error(`[MongoUserRepository.findById] Error finding user ${id}:`, error.message);
      return null;
    }
  }

  /**
   * Find user by email
   * @param {string} email - User email (will be lowercased)
   * @param {object} options - Query options
   * @param {boolean} options.includePassword - Include password field (default: false)
   * @returns {Promise<User|null>} Domain entity
   */
  async findByEmail(email, { includePassword = false } = {}) {
    const query = UserModel.findOne({ email: email.toLowerCase() });
    if (!includePassword) {
      query.select('-password');
    }
    const doc = await query;
    return this._toDomain(doc, includePassword);
  }

  /**
   * Find user by username
   * @param {string} username - Username
   * @param {object} options - Query options
   * @param {boolean} options.includePassword - Include password field (default: false)
   * @returns {Promise<User|null>} Domain entity
   */
  async findByUsername(username, { includePassword = false } = {}) {
    const query = UserModel.findOne({ username });
    if (!includePassword) {
      query.select('-password');
    }
    const doc = await query;
    return this._toDomain(doc, includePassword);
  }

  /**
   * Find user by email or username
   * @param {string} email - User email
   * @param {string} username - Username
   * @param {object} options - Query options
   * @param {boolean} options.includePassword - Include password field (default: false)
   * @returns {Promise<User|null>} Domain entity
   */
  async findByEmailOrUsername(email, username, { includePassword = false } = {}) {
    // Validate at least one parameter is provided
    if (!email && !username) {
      return null;
    }
    const query = UserModel.findOne({
      $or: [{ email: email?.toLowerCase() }, { username }]
    });
    if (!includePassword) {
      query.select('-password');
    }
    const doc = await query;
    return this._toDomain(doc, includePassword);
  }

  /**
   * Find user by username excluding a specific user ID
   * @param {string} username - Username to check
   * @param {string} excludeId - User ID to exclude from search
   * @returns {Promise<User|null>} Domain entity
   */
  async findByUsernameExcluding(username, excludeId) {
    const doc = await UserModel.findOne({ username, _id: { $ne: excludeId } }).select('-password');
    return this._toDomain(doc, false);
  }

  /**
   * Find user by password reset token
   * @param {string} hashedToken - Hashed reset token
   * @returns {Promise<User|null>} Domain entity (includes password for reset flow)
   */
  async findByResetToken(hashedToken) {
    const doc = await UserModel.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });
    // Include password since this is used for password reset flow
    return this._toDomain(doc, true);
  }

  /**
   * Create a new user
   * @param {object} userData - User data
   * @returns {Promise<User>} Domain entity (without password)
   */
  async create(userData) {
    const user = new UserModel({
      email: userData.email.toLowerCase(),
      password: userData.password,
      username: userData.username
    });
    const doc = await user.save();
    return this._toDomain(doc, false);
  }

  /**
   * Update user by ID
   * @param {string} id - User ID
   * @param {object} updates - Fields to update
   * @param {object} options - Update options
   * @param {boolean} options.includePassword - Include password in returned user
   * @returns {Promise<User|null>} Domain entity
   */
  async updateById(id, updates, { includePassword = false } = {}) {
    const query = UserModel.findByIdAndUpdate(id, updates, { new: true });
    if (!includePassword) {
      query.select('-password');
    }
    const doc = await query;
    return this._toDomain(doc, includePassword);
  }

  /**
   * Save user document instance (for complex updates like password reset)
   * Returns the raw Mongoose document - use for operations that need
   * direct document access (e.g., password hashing middleware)
   * @param {Object} userDoc - Mongoose User document instance
   * @returns {Promise<User>} Domain entity (without password)
   */
  async save(userDoc) {
    const doc = await userDoc.save();
    return this._toDomain(doc, false);
  }

  /**
   * Get raw Mongoose document by ID (for operations needing document methods)
   * Use sparingly - prefer domain entity methods when possible
   * @param {string} id - User ID
   * @returns {Promise<Object|null>} Mongoose document
   */
  async findDocumentById(id) {
    try {
      return await UserModel.findById(id);
    } catch (error) {
      console.error(`[MongoUserRepository.findDocumentById] Error finding user document ${id}:`, error.message);
      return null;
    }
  }

  /**
   * Check if email exists
   * @param {string} email - Email to check
   * @returns {Promise<boolean>}
   */
  async emailExists(email) {
    const count = await UserModel.countDocuments({ email: email.toLowerCase() });
    return count > 0;
  }

  /**
   * Check if username exists
   * @param {string} username - Username to check
   * @returns {Promise<boolean>}
   */
  async usernameExists(username) {
    const count = await UserModel.countDocuments({ username });
    return count > 0;
  }
}

const mongoUserRepository = new MongoUserRepository();

module.exports = { MongoUserRepository, mongoUserRepository };
