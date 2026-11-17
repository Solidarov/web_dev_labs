const { z } = require('zod');
const prisma = require('./prisma');

// filters: { queryParam: (value) => whereFragment }; a filter may throw a ZodError for bad input
module.exports = (
  model,
  include,
  { scope = () => ({}), search = [], sort = ['id'], filters = {} } = {},
) => ({
  listOptions: { search, sort, filters: Object.keys(filters) },
  create: async (req, res, next) => {
    try {
      res.status(201).json(await prisma[model].create({ data: req.body, include }));
    } catch (err) {
      next(err);
    }
  },
  list: async (req, res, next) => {
    try {
      const { query } = req;
      const page = Math.max(1, parseInt(query.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 10));
      const field = z.enum(sort).default(sort[0]).parse(query.sort);
      const order = z.enum(['asc', 'desc']).default('asc').parse(query.order);
      const q = z.string().optional().parse(query.q);
      const where = {
        AND: [
          scope(req),
          q && search.length
            ? { OR: search.map((f) => ({ [f]: { contains: q, mode: 'insensitive' } })) }
            : {},
          ...Object.entries(filters)
            .filter(([key]) => query[key] !== undefined)
            .map(([key, filter]) => filter(query[key])),
        ],
      };
      const [data, total] = await prisma.$transaction([
        prisma[model].findMany({
          where,
          include,
          orderBy: [{ [field]: order }, { id: order }],
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma[model].count({ where }),
      ]);
      res.json({ data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid query' });
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
