const { z } = require('zod');

const base = z.object({
  email: z.email(),
  name: z.string().min(1),
  role: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

exports.createUser = base.extend({ bio: z.string().optional() });
exports.updateUser = base.partial();
