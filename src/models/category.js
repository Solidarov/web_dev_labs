const { z } = require('zod');

const base = z.object({ name: z.string().min(1) });

exports.createCategory = base.meta({ example: { name: 'Meeting rooms' } });
exports.updateCategory = base.partial().meta({ example: { name: 'Conference rooms' } });
