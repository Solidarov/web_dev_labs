const crypto = require('node:crypto');
const argon2 = require('argon2');
const jwt = require('jsonwebtoken');
const prisma = require('./prisma');

const hashPassword = (password) => argon2.hash(password, { type: argon2.argon2id });
const verifyPassword = (hash, password) => argon2.verify(hash, password);

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const signAccessToken = (user) =>
  jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  });

// Random token for the client; only its hash is stored
const createToken = async (userId, type, ttlMs) => {
  const token = crypto.randomBytes(32).toString('hex');
  await prisma.authToken.create({
    data: { userId, type, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + ttlMs) },
  });
  return token;
};

const createRefreshToken = (userId) =>
  createToken(userId, 'refresh', (Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS) || 7) * 86400000);

const issueTokens = async (user) => ({
  accessToken: signAccessToken(user),
  refreshToken: await createRefreshToken(user.id),
});

const authenticate = (req, res, next) => {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  try {
    if (scheme !== 'Bearer' || !token) throw new Error('No token');
    const { sub, role } = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: sub, role };
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

const authorize =
  (...roles) =>
  (req, res, next) => {
    if (!roles.includes(req.user?.role)) return res.status(403).json({ error: 'Forbidden' });
    next();
  };

module.exports = {
  hashPassword,
  verifyPassword,
  hashToken,
  signAccessToken,
  createToken,
  createRefreshToken,
  issueTokens,
  authenticate,
  authorize,
};
