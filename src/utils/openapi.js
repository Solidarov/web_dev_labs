const { z } = require('zod');
const authSchemas = require('../models/auth');

const toSchema = (schema) => {
  const { $schema, ...json } = z.toJSONSchema(schema, {
    io: 'input',
    unrepresentable: 'any',
    override: ({ zodSchema, jsonSchema }) => {
      if (zodSchema._zod.def.type === 'date')
        Object.assign(jsonSchema, { type: 'string', format: 'date-time' });
    },
  });
  return json;
};

const body = (schema) => ({
  required: true,
  content: { 'application/json': { schema: toSchema(schema) } },
});

const idParam = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
};

const errors = {
  400: { description: 'Validation failed, invalid id or related record does not exist' },
  401: { description: 'Unauthorized or invalid credentials' },
  403: { description: 'Forbidden' },
  404: { description: 'Not found' },
  409: { description: 'Already exists' },
  500: { description: 'Internal server error' },
};

const queryParam = (name, schema, description) => ({ name, in: 'query', schema, description });

const listParams = ({ search, sort, filters }) => [
  queryParam('page', { type: 'integer', minimum: 1, default: 1 }),
  queryParam('limit', { type: 'integer', minimum: 1, maximum: 100, default: 10 }),
  queryParam('sort', { type: 'string', enum: sort, default: sort[0] }),
  queryParam('order', { type: 'string', enum: ['asc', 'desc'], default: 'asc' }),
  ...(search.length
    ? [queryParam('q', { type: 'string' }, `Case-insensitive search in ${search.join(', ')}`)]
    : []),
  ...filters.map((name) => queryParam(name, { type: 'string' }, 'Filter')),
];

const listResponse = {
  description: 'OK, returns { data, meta }',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          data: { type: 'array', items: { type: 'object' } },
          meta: {
            type: 'object',
            properties: {
              page: { type: 'integer' },
              limit: { type: 'integer' },
              total: { type: 'integer' },
              totalPages: { type: 'integer' },
            },
          },
        },
      },
    },
  },
};

const pick = (...codes) => Object.fromEntries(codes.map((c) => [c, errors[c]]));

module.exports = (resources) => {
  const paths = {};

  for (const [name, router] of Object.entries(resources)) {
    const { createSchema, updateSchema } = router.schemas;
    const tags = [name];
    const secure = (guarded, op) =>
      guarded
        ? {
            ...op,
            security: [{ bearerAuth: [] }],
            responses: { ...op.responses, ...pick(401, 403) },
          }
        : op;

    paths[`/${name}`] = {
      post: secure(router.guards.write, {
        tags,
        summary: `Create ${name} item`,
        requestBody: body(createSchema),
        responses: { 201: { description: 'Created' }, ...pick(400, 409, 500) },
      }),
      get: secure(router.guards.read, {
        tags,
        summary: `List ${name}`,
        parameters: listParams(router.listOptions),
        responses: { 200: listResponse, 400: { description: 'Invalid query' }, ...pick(500) },
      }),
    };

    paths[`/${name}/{id}`] = {
      parameters: [idParam],
      get: secure(router.guards.read, {
        tags,
        summary: `Get ${name} item`,
        responses: { 200: { description: 'OK' }, ...pick(400, 404, 500) },
      }),
      patch: secure(router.guards.write, {
        tags,
        summary: `Update ${name} item`,
        requestBody: body(updateSchema),
        responses: { 200: { description: 'OK' }, ...pick(400, 404, 409, 500) },
      }),
      delete: secure(router.guards.write, {
        tags,
        summary: `Delete ${name} item`,
        responses: { 204: { description: 'Deleted' }, ...pick(400, 404, 500) },
      }),
    };
  }

  const auth = (summary, schema, codes, secured) => ({
    tags: ['auth'],
    summary,
    ...(secured && { security: [{ bearerAuth: [] }] }),
    ...(schema && { requestBody: body(schema) }),
    responses: { ...codes, ...pick(...(schema ? [400] : []), 500) },
  });

  paths['/auth/register'] = {
    post: auth('Register a new user', authSchemas.register, {
      201: { description: 'Created, returns user and tokens' },
      ...pick(409),
    }),
  };
  paths['/auth/login'] = {
    post: auth('Log in', authSchemas.login, {
      200: { description: 'OK, returns user and tokens' },
      ...pick(401),
    }),
  };
  paths['/auth/refresh'] = {
    post: auth('Rotate refresh token', authSchemas.refresh, {
      200: { description: 'OK, returns new tokens' },
      ...pick(401),
    }),
  };
  paths['/auth/logout'] = {
    post: auth('Revoke refresh token', authSchemas.refresh, { 204: { description: 'Logged out' } }),
  };
  paths['/auth/me'] = {
    get: auth('Get current user', null, { 200: { description: 'OK' }, ...pick(401, 404) }, true),
  };
  paths['/auth/password'] = {
    patch: auth(
      'Change password',
      authSchemas.changePassword,
      { 200: { description: 'Password changed' }, ...pick(401, 404) },
      true,
    ),
  };

  return {
    openapi: '3.0.3',
    info: { title: 'Booking API', version: '1.0.0' },
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    },
    paths,
  };
};
