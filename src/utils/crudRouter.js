const { Router } = require('express');
const { z } = require('zod');
const validate = require('./validate');

module.exports = (controller, createSchema, updateSchema) => {
  const router = Router();

  router.param('id', (req, res, next, id) => {
    if (!z.uuid().safeParse(id).success) return res.status(400).json({ error: 'Invalid id' });
    next();
  });

  router.post('/', validate(createSchema), controller.create);
  router.get('/', controller.list);
  router.get('/:id', controller.get);
  router.patch('/:id', validate(updateSchema), controller.update);
  router.delete('/:id', controller.remove);

  router.schemas = { createSchema, updateSchema };

  return router;
};
