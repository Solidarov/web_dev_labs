const { z } = require('zod');

const toSchema = (schema) => {
  const { $schema, ...json } = z.toJSONSchema(schema, {
    io: 'input',
    unrepresentable: 'any',
    override: ({ zodSchema, jsonSchema }) => {
      if (zodSchema._zod.def.type === 'date') Object.assign(jsonSchema, { type: 'string', format: 'date-time' });
    },
  });
  return json;
};

const body = (schema) => ({
  required: true,
  content: { 'application/json': { schema: toSchema(schema) } },
});

const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };

const errors = {
  400: { description: 'Validation failed, invalid id or related record does not exist' },
  404: { description: 'Not found' },
  409: { description: 'Already exists' },
  500: { description: 'Internal server error' },
};

const pick = (...codes) => Object.fromEntries(codes.map((c) => [c, errors[c]]));

module.exports = (resources) => {
  const paths = {};

  for (const [name, router] of Object.entries(resources)) {
    const { createSchema, updateSchema } = router.schemas;
    const tags = [name];

    paths[`/${name}`] = {
      post: {
        tags,
        summary: `Create ${name} item`,
        requestBody: body(createSchema),
        responses: { 201: { description: 'Created' }, ...pick(400, 409, 500) },
      },
      get: {
        tags,
        summary: `List ${name}`,
        responses: { 200: { description: 'OK' }, ...pick(500) },
      },
    };

    paths[`/${name}/{id}`] = {
      parameters: [idParam],
      get: {
        tags,
        summary: `Get ${name} item`,
        responses: { 200: { description: 'OK' }, ...pick(400, 404, 500) },
      },
      patch: {
        tags,
        summary: `Update ${name} item`,
        requestBody: body(updateSchema),
        responses: { 200: { description: 'OK' }, ...pick(400, 404, 409, 500) },
      },
      delete: {
        tags,
        summary: `Delete ${name} item`,
        responses: { 204: { description: 'Deleted' }, ...pick(400, 404, 500) },
      },
    };
  }

  return { openapi: '3.0.3', info: { title: 'Booking API', version: '1.0.0' }, paths };
};
