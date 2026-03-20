const { DEFAULT_PAGE, DEFAULT_LIMIT, MAX_LIMIT, MAX_PAGES } = require('../config/constants');

/**
 * Sanitize pagination params with safe bounds
 * @param {Object} params - Raw pagination params
 * @returns {{ page: number, limit: number, skip: number }}
 */
function sanitizePagination({ page, limit } = {}) {
  const safePage = Math.max(1, Math.min(Number(page) || DEFAULT_PAGE, MAX_PAGES));
  const safeLimit = Math.max(1, Math.min(Number(limit) || DEFAULT_LIMIT, MAX_LIMIT));
  const skip = (safePage - 1) * safeLimit;
  return { page: safePage, limit: safeLimit, skip };
}

/**
 * Build pagination result object
 * @param {number} total - Total count
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 * @returns {Object} Pagination metadata
 */
function buildPaginationResult(total, page, limit) {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    hasMore: page * limit < total
  };
}

/**
 * Apply in-memory pagination to an array
 * @param {Array} items - Full array
 * @param {Object} params - { page, limit }
 * @returns {{ items: Array, pagination: Object }}
 */
function paginateArray(items, { page, limit } = {}) {
  const { page: safePage, limit: safeLimit, skip } = sanitizePagination({ page, limit });
  const total = items.length;
  const paginatedItems = items.slice(skip, skip + safeLimit);
  return {
    items: paginatedItems,
    pagination: buildPaginationResult(total, safePage, safeLimit)
  };
}

module.exports = { sanitizePagination, buildPaginationResult, paginateArray };
