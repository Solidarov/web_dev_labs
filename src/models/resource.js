const { z } = require('zod');

const connect = z.object({ connect: z.array(z.object({ id: z.uuid() })) }).optional();

const base = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  categories: connect,
});

exports.createResource = base;
exports.updateResource = base.partial();
