const prisma = require('../utils/prisma');
const crud = require('../utils/crud');

const controller = crud('user', { profile: true });

controller.create = async (req, res, next) => {
  try {
    const { bio, ...data } = req.body;
    if (bio !== undefined) data.profile = { create: { bio } };
    res.status(201).json(await prisma.user.create({ data, include: { profile: true } }));
  } catch (err) {
    next(err);
  }
};

module.exports = controller;
