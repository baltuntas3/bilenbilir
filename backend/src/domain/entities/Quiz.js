const { ValidationError, NotFoundError } = require('../../shared/errors');

const MAX_QUESTIONS = 50;
const MAX_TAGS = 5;
const MIN_TAG_LENGTH = 2;
const MAX_TAG_LENGTH = 30;
const TAG_PATTERN = /^[a-zA-ZÀ-ÿĞğÜüŞşİıÖöÇç0-9\s]+$/;

const VALID_CATEGORIES = [
  'Genel Kültür',
  'Bilim',
  'Tarih',
  'Coğrafya',
  'Spor',
  'Sanat',
  'Teknoloji',
  'Eğlence',
  'Müzik',
  'Film & TV',
  'Edebiyat',
  'Diğer'
];

class Quiz {
  static MAX_QUESTIONS = MAX_QUESTIONS;
  static MAX_TAGS = MAX_TAGS;
  static VALID_CATEGORIES = VALID_CATEGORIES;

  constructor({ id, title, description = '', createdBy, questions = [], isPublic = false, playCount = 0, createdAt = new Date(), category = 'Diğer', tags = [], slug = null, averageRating = 0, ratingCount = 0 }) {
    if (!id) {
      throw new ValidationError('Quiz id is required');
    }
    if (!title || !title.trim()) {
      throw new ValidationError('Quiz title is required');
    }
    if (!createdBy) {
      throw new ValidationError('Quiz createdBy is required');
    }

    this.id = id;
    this.title = title.trim();
    this.description = description || '';
    this.createdBy = createdBy;
    this.questions = Array.isArray(questions) ? questions : [];
    this.isPublic = Boolean(isPublic);
    this.playCount = Math.max(0, playCount || 0);
    this.createdAt = createdAt;
    this.category = VALID_CATEGORIES.includes(category) ? category : 'Diğer';
    this.tags = Array.isArray(tags) ? this._validateAndCleanTags(tags) : [];
    this.slug = slug || null;
    this.averageRating = Math.max(0, averageRating || 0);
    this.ratingCount = Math.max(0, ratingCount || 0);

    if (this.questions.length > MAX_QUESTIONS) {
      throw new ValidationError(`Quiz cannot have more than ${MAX_QUESTIONS} questions`);
    }

    // Validate questions array contents - no null/undefined elements
    for (let i = 0; i < this.questions.length; i++) {
      if (this.questions[i] == null) {
        throw new ValidationError(`Question at index ${i} is null or undefined`);
      }
    }
  }

  /**
   * Validate and clean tags array
   * @private
   */
  _validateAndCleanTags(tags) {
    const cleaned = tags
      .map(t => (typeof t === 'string' ? t.trim().toLowerCase() : ''))
      .filter(t => t.length >= MIN_TAG_LENGTH && t.length <= MAX_TAG_LENGTH && TAG_PATTERN.test(t));
    // Remove duplicates and limit to MAX_TAGS
    return [...new Set(cleaned)].slice(0, MAX_TAGS);
  }

  updateTitle(newTitle) {
    if (!newTitle || !newTitle.trim()) {
      throw new ValidationError('Quiz title is required');
    }
    this.title = newTitle.trim();
  }

  updateDescription(newDescription) {
    this.description = newDescription || '';
  }

  setPublic(isPublic) {
    this.isPublic = Boolean(isPublic);
  }

  /**
   * Generate a URL-friendly slug from a title
   * Lowercase, replace spaces with hyphens, remove special chars, append random suffix
   * @param {string} title - Quiz title
   * @returns {string} URL-friendly slug
   */
  static generateSlug(title) {
    if (!title || typeof title !== 'string') {
      throw new ValidationError('Title is required to generate slug');
    }

    // Turkish character map for transliteration
    const trMap = {
      'ç': 'c', 'Ç': 'c', 'ğ': 'g', 'Ğ': 'g',
      'ı': 'i', 'İ': 'i', 'ö': 'o', 'Ö': 'o',
      'ş': 's', 'Ş': 's', 'ü': 'u', 'Ü': 'u'
    };

    let slug = title.toLowerCase();
    // Replace Turkish characters
    slug = slug.replace(/[çÇğĞıİöÖşŞüÜ]/g, (match) => trMap[match] || match);
    // Replace spaces and non-alphanumeric with hyphens
    slug = slug.replace(/[^a-z0-9]+/g, '-');
    // Remove leading/trailing hyphens
    slug = slug.replace(/^-+|-+$/g, '');
    // Truncate to reasonable length
    slug = slug.substring(0, 60);
    // Remove trailing hyphen after truncation
    slug = slug.replace(/-+$/, '');
    // Append 4 random chars for uniqueness
    const randomSuffix = Math.random().toString(36).substring(2, 6);
    return `${slug}-${randomSuffix}`;
  }

  updateCategory(category) {
    if (!VALID_CATEGORIES.includes(category)) {
      throw new ValidationError(`Invalid category: ${category}. Must be one of: ${VALID_CATEGORIES.join(', ')}`);
    }
    this.category = category;
  }

  addTag(tag) {
    if (typeof tag !== 'string') {
      throw new ValidationError('Tag must be a string');
    }
    const cleaned = tag.trim().toLowerCase();
    if (cleaned.length < MIN_TAG_LENGTH || cleaned.length > MAX_TAG_LENGTH) {
      throw new ValidationError(`Tag must be between ${MIN_TAG_LENGTH} and ${MAX_TAG_LENGTH} characters`);
    }
    if (!TAG_PATTERN.test(cleaned)) {
      throw new ValidationError('Tag can only contain letters, numbers, and spaces');
    }
    if (this.tags.length >= MAX_TAGS) {
      throw new ValidationError(`Quiz cannot have more than ${MAX_TAGS} tags`);
    }
    if (!this.tags.includes(cleaned)) {
      this.tags.push(cleaned);
    }
  }

  removeTag(tag) {
    const cleaned = typeof tag === 'string' ? tag.trim().toLowerCase() : '';
    this.tags = this.tags.filter(t => t !== cleaned);
  }

  setTags(tags) {
    if (!Array.isArray(tags)) {
      throw new ValidationError('Tags must be an array');
    }
    this.tags = this._validateAndCleanTags(tags);
  }

  addQuestion(question) {
    if (this.questions.length >= MAX_QUESTIONS) {
      throw new ValidationError(`Quiz cannot have more than ${MAX_QUESTIONS} questions`);
    }
    this.questions.push(question);
  }

  removeQuestion(questionId) {
    this.questions = this.questions.filter(q => q.id !== questionId);
  }

  /**
   * Get question by index (returns null if not found)
   * @param {number} index - Question index
   * @returns {Question|null}
   */
  getQuestion(index) {
    if (typeof index !== 'number' || index < 0 || index >= this.questions.length) {
      return null;
    }
    return this.questions[index];
  }

  /**
   * Get question by index or throw error if not found
   * Use this when question must exist (e.g., during game)
   * @param {number} index - Question index
   * @returns {Question}
   * @throws {Error} If question not found
   */
  getQuestionOrThrow(index) {
    const question = this.getQuestion(index);
    if (!question) {
      throw new NotFoundError(`Question at index ${index} not found`);
    }
    return question;
  }

  getTotalQuestions() {
    return this.questions.length;
  }

  reorderQuestions(newOrder) {
    // Validate newOrder is an array
    if (!Array.isArray(newOrder)) {
      throw new ValidationError('newOrder must be an array');
    }
    // Validate newOrder length matches questions
    if (newOrder.length !== this.questions.length) {
      throw new ValidationError(`newOrder length (${newOrder.length}) must match questions length (${this.questions.length})`);
    }

    // Check for duplicate IDs in newOrder
    const uniqueIds = new Set(newOrder);
    if (uniqueIds.size !== newOrder.length) {
      const duplicates = newOrder.filter((id, idx) => newOrder.indexOf(id) !== idx);
      throw new ValidationError(`Duplicate question IDs in order: ${[...new Set(duplicates)].join(', ')}`);
    }

    const questionMap = new Map(this.questions.map(q => [q.id, q]));
    const reordered = newOrder.map(id => questionMap.get(id));

    // Check for missing or invalid question IDs
    const missingIds = newOrder.filter((id, idx) => !reordered[idx]);
    if (missingIds.length > 0) {
      throw new ValidationError(`Invalid question IDs in order: ${missingIds.join(', ')}`);
    }

    this.questions = reordered;
  }

  /**
   * Returns a new Quiz clone with `count` randomly selected questions.
   * If count >= total questions, returns all questions shuffled.
   * Uses Fisher-Yates shuffle algorithm.
   * @param {number} count - Number of questions to select
   * @returns {Quiz} A new frozen Quiz with randomly selected questions
   */
  getRandomSubset(count) {
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 1) {
      throw new ValidationError('Question count must be a positive integer');
    }

    // Fisher-Yates shuffle on a copy
    const shuffled = [...this.questions];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // Take only `count` questions (or all if count >= total)
    const selected = count >= shuffled.length ? shuffled : shuffled.slice(0, count);

    // Clone and freeze each question
    const clonedQuestions = selected.map(q => q.clone());
    const frozenQuestions = Object.freeze(clonedQuestions);

    const clonedCreatedAt = this.createdAt instanceof Date
      ? new Date(this.createdAt.getTime())
      : this.createdAt;

    const subsetQuiz = new Quiz({
      id: this.id,
      title: this.title,
      description: this.description,
      createdBy: this.createdBy,
      questions: frozenQuestions,
      isPublic: this.isPublic,
      playCount: this.playCount,
      createdAt: clonedCreatedAt,
      category: this.category,
      tags: [...this.tags],
      slug: this.slug,
      averageRating: this.averageRating,
      ratingCount: this.ratingCount
    });

    return Object.freeze(subsetQuiz);
  }

  /**
   * Create a deep clone of this quiz (immutable snapshot for game sessions)
   * This prevents mid-game modifications from affecting ongoing games
   *
   * Deep freeze implementation:
   * - Each Question is frozen by Question.clone()
   * - Each Question's options array is frozen by Question.clone()
   * - The questions array is frozen here
   * - Date objects are cloned to prevent shared reference mutation
   * - The Quiz object itself is frozen
   *
   * Note: Object.freeze is shallow, but we freeze at each level explicitly
   */
  clone() {
    // Clone and freeze all questions (Question.clone() returns frozen questions)
    const clonedQuestions = this.questions.map(q => q.clone());
    const frozenQuestions = Object.freeze(clonedQuestions);

    // Verify questions array is frozen
    if (!Object.isFrozen(frozenQuestions)) {
      throw new ValidationError('Failed to freeze questions array for quiz snapshot');
    }

    // Verify each question is frozen
    for (let i = 0; i < frozenQuestions.length; i++) {
      if (!Object.isFrozen(frozenQuestions[i])) {
        throw new ValidationError(`Failed to freeze question at index ${i} for quiz snapshot`);
      }
    }

    // Clone Date to prevent shared reference mutation
    const clonedCreatedAt = this.createdAt instanceof Date
      ? new Date(this.createdAt.getTime())
      : this.createdAt;

    const clonedQuiz = new Quiz({
      id: this.id,
      title: this.title,
      description: this.description,
      createdBy: this.createdBy,
      questions: frozenQuestions,
      isPublic: this.isPublic,
      playCount: this.playCount,
      createdAt: clonedCreatedAt,
      category: this.category,
      tags: [...this.tags],
      slug: this.slug,
      averageRating: this.averageRating,
      ratingCount: this.ratingCount
    });

    // Freeze the quiz object to prevent modifications
    const frozenQuiz = Object.freeze(clonedQuiz);

    // Verify quiz is frozen
    if (!Object.isFrozen(frozenQuiz)) {
      throw new ValidationError('Failed to freeze quiz for snapshot');
    }

    return frozenQuiz;
  }
}

module.exports = { Quiz };
