const prisma = require('../utils/prisma');
const { hashPassword, verifyPassword, hashToken, issueTokens } = require('../utils/auth');

const invalidCredentials = (res) => res.status(401).json({ error: 'Invalid credentials' });

exports.register = async (req, res, next) => {
  try {
    const { password, ...data } = req.body;
    const user = await prisma.user.create({
      data: { ...data, password: await hashPassword(password) },
    });
    res.status(201).json({ user, ...(await issueTokens(user)) });
  } catch (err) {
    next(err);
  }
};

exports.login = async (req, res, next) => {
  try {
    const found = await prisma.user.findUnique({
      where: { email: req.body.email },
      omit: { password: false },
    });
    if (!found?.password || !(await verifyPassword(found.password, req.body.password)))
      return invalidCredentials(res);
    const { password: _password, ...user } = found;
    res.json({ user, ...(await issueTokens(user)) });
  } catch (err) {
    next(err);
  }
};

exports.refresh = async (req, res, next) => {
  try {
    const token = await prisma.authToken.findUnique({
      where: { tokenHash: hashToken(req.body.refreshToken) },
      include: { user: true },
    });
    if (!token || token.type !== 'refresh' || token.usedAt || token.expiresAt < new Date())
      return res.status(401).json({ error: 'Invalid refresh token' });
    // Conditional update so two concurrent refreshes cannot both rotate the same token
    const { count } = await prisma.authToken.updateMany({
      where: { id: token.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (!count) return res.status(401).json({ error: 'Invalid refresh token' });
    res.json(await issueTokens(token.user));
  } catch (err) {
    next(err);
  }
};

exports.logout = async (req, res, next) => {
  try {
    await prisma.authToken.updateMany({
      where: { tokenHash: hashToken(req.body.refreshToken), type: 'refresh', usedAt: null },
      data: { usedAt: new Date() },
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

exports.me = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { profile: true },
    });
    if (!user) return res.status(404).json({ error: 'Not found' });
    res.json(user);
  } catch (err) {
    next(err);
  }
};

exports.changePassword = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      omit: { password: false },
    });
    if (!user) return res.status(404).json({ error: 'Not found' });
    if (!user.password || !(await verifyPassword(user.password, req.body.currentPassword)))
      return invalidCredentials(res);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { password: await hashPassword(req.body.newPassword) },
      }),
      prisma.authToken.updateMany({
        where: { userId: user.id, type: 'refresh', usedAt: null },
        data: { usedAt: new Date() },
      }),
    ]);
    res.json({ message: 'Password changed' });
  } catch (err) {
    next(err);
  }
};
