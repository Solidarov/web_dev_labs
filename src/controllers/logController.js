const { z } = require('zod');
const crud = require('../utils/crud');

module.exports = crud('actionLog', undefined, {
  sort: ['createdAt'],
  filters: {
    userId: (id) => ({ userId: z.uuid().parse(id) }),
    method: (method) => ({ method: z.enum(['POST', 'PATCH', 'PUT', 'DELETE']).parse(method) }),
    status: (status) => ({ status: z.coerce.number().int().parse(status) }),
  },
});
