const prisma = require('./prisma');

module.exports = (model, include, scope = () => ({})) => ({
  create: async (req, res, next) => {
    try {
      res.status(201).json(await prisma[model].create({ data: req.body, include }));
    } catch (err) {
      next(err);
    }
  },
  list: async (req, res, next) => {
    try {
      res.json(await prisma[model].findMany({ where: scope(req), include }));
    } catch (err) {
      next(err);
    }
  },
  get: async (req, res, next) => {
    try {
      const item = await prisma[model].findFirst({
        where: { id: req.params.id, ...scope(req) },
        include,
      });
      if (!item) return res.status(404).json({ error: 'Not found' });
      res.json(item);
    } catch (err) {
      next(err);
    }
  },
  update: async (req, res, next) => {
    try {
      res.json(
        await prisma[model].update({
          where: { id: req.params.id, ...scope(req) },
          data: req.body,
          include,
        }),
      );
    } catch (err) {
      next(err);
    }
  },
  remove: async (req, res, next) => {
    try {
      await prisma[model].delete({ where: { id: req.params.id, ...scope(req) } });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
});
