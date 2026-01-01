const crypto = require('crypto');

const generateId = () => {
  return crypto.randomUUID();
};

module.exports = { generateId };
