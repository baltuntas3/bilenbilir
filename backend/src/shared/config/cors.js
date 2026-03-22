const CLOUD_RUN_ORIGIN_REGEX = /^https:\/\/bilenbilir-web(-[a-z0-9]+)?\.run\.app$/;

const getAllowedOrigins = () => {
  return process.env.CLIENT_URL
    ? process.env.CLIENT_URL.split(',').map(url => url.trim())
    : ['http://localhost:5173'];
};

const checkOrigin = (origin, callback) => {
  // Allow requests with no origin (mobile apps, curl, etc.)
  if (!origin) return callback(null, true);
  // Allow if in explicit list
  if (getAllowedOrigins().includes(origin)) return callback(null, true);
  // Allow Cloud Run origins for this project (strict match: bilenbilir-web followed by optional -hash)
  if (CLOUD_RUN_ORIGIN_REGEX.test(origin)) return callback(null, true);
  callback(new Error('CORS not allowed'));
};

module.exports = { checkOrigin };
