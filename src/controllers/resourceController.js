const { z } = require('zod');
const crud = require('../utils/crud');

module.exports = crud(
  'resource',
  { categories: true },
  {
    search: ['name', 'description'],
    sort: ['name'],
    filters: { categoryId: (id) => ({ categories: { some: { id: z.uuid().parse(id) } } }) },
  },
);
