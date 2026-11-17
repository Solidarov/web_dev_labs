const { z } = require('zod');
const prisma = require('../utils/prisma');
const crud = require('../utils/crud');

const controller = crud(
  'user',
  { profile: true },
  {
    search: ['name', 'email'],
    sort: ['createdAt', 'name', 'email'],
    filters: { role: (role) => ({ role: z.string().parse(role) }) },
  },
);

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
