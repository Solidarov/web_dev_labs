const { Router } = require('express');
const { z } = require('zod');
const validate = require('./validate');

module.exports = (controller, createSchema, updateSchema, { read = [], write = [] } = {}) => {
  const router = Router();

  router.param('id', (req, res, next, id) => {
    if (!z.uuid().safeParse(id).success) return res.status(400).json({ error: 'Invalid id' });
    next();
  });

  router.post('/', ...write, validate(createSchema), controller.create);
  router.get('/', ...read, controller.list);
  router.get('/:id', ...read, controller.get);
  router.patch('/:id', ...write, validate(updateSchema), controller.update);
  router.delete('/:id', ...write, controller.remove);

  router.schemas = { createSchema, updateSchema };
  router.guards = { read: read.length > 0, write: write.length > 0 };

  return router;
};
