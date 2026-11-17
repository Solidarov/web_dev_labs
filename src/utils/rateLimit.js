const { rateLimit } = require('express-rate-limit');

// Factory so tests (and later routes) can build a limiter with any limit
const limiter = (limit) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many requests' },
  });

module.exports = {
  limiter,
  globalLimiter: limiter(Number(process.env.RATE_LIMIT) || 100),
  authLimiter: limiter(Number(process.env.AUTH_RATE_LIMIT) || 10),
};
