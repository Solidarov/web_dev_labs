const { z } = require('zod');

const base = z.object({ name: z.string().min(1) });

exports.createCategory = base;
exports.updateCategory = base.partial();
