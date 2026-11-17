const { z } = require('zod');

const base = z.object({
  email: z.email(),
  name: z.string().min(1),
  role: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

exports.createUser = base.extend({ bio: z.string().optional() }).meta({
  example: {
    email: 'anna@example.com',
    name: 'Anna Koval',
    role: 'user',
    metadata: { department: 'IT' },
    bio: 'Backend developer',
  },
});
exports.updateUser = base.partial().meta({ example: { name: 'Anna Shevchenko', role: 'admin' } });
