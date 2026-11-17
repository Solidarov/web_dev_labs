const { z } = require('zod');

const connect = z.object({ connect: z.array(z.object({ id: z.uuid() })) }).optional();

const base = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  categories: connect,
});

exports.createResource = base.meta({
  example: {
    name: 'Room 101',
    description: 'Meeting room for 8 people with a projector',
    categories: { connect: [{ id: 'b2e8d6f4-1c3a-4f5e-8d7b-9a0c1e2f3d4b' }] },
  },
});
exports.updateResource = base.partial().meta({ example: { description: 'Projector replaced' } });
