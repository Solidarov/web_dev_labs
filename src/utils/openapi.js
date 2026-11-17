const { z } = require('zod');
const authSchemas = require('../models/auth');
const logController = require('../controllers/logController');

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

const json = (example) => ({ content: { 'application/json': { example } } });
const ok = (description, example) => ({ description, ...json(example) });

// Error response with the shared Error schema; several messages become named examples
const error = (description, ...messages) => {
  const values = messages.map((m) => (typeof m === 'string' ? { error: m } : m));
  return {
    description,
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/Error' },
        ...(values.length === 1
          ? { example: values[0] }
          : { examples: Object.fromEntries(values.map((v) => [v.error, { value: v }])) }),
      },
    },
  };
};

const validationFailed = {
  error: 'Validation failed',
  details: [
    {
      origin: 'string',
      code: 'too_small',
      minimum: 1,
      inclusive: true,
      path: ['name'],
      message: 'Too small: expected string to have >=1 characters',
    },
  ],
};
const bad = (description, ...messages) => ({ 400: error(description, ...messages) });
const badBody = bad(
  'Body failed Zod validation or is not valid JSON',
  validationFailed,
  'Invalid JSON',
);
const badId = bad('Path id is not a UUID', 'Invalid id');
const badQuery = bad('Unknown sort field/order or invalid filter value', 'Invalid query');

const errors = {
  400: error(
    'Validation failed, invalid JSON, invalid id or related record does not exist',
    validationFailed,
    'Invalid JSON',
    'Invalid id',
    'Related record does not exist',
  ),
  401: error('Missing, malformed or expired access token', 'Unauthorized'),
  403: error('Authenticated, but the role is not allowed', 'Forbidden'),
  404: error('Not found, or not visible to the current user', 'Not found'),
  409: error('A record with the same unique field (e.g. email) already exists', 'Already exists'),
  413: error('File is larger than MAX_FILE_SIZE', 'File too large'),
  429: error('Rate limit exceeded, see the RateLimit and Retry-After headers', 'Too many requests'),
  500: error('Unexpected server error', 'Internal Server Error'),
};

const ids = {
  user: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  resource: '3f6c2a9e-8b1d-4e7a-9c25-1d4b7e0f6a83',
  category: 'b2e8d6f4-1c3a-4f5e-8d7b-9a0c1e2f3d4b',
  booking: 'c7d8e9f0-a1b2-4c3d-9e4f-5a6b7c8d9e0f',
  file: 'd4e5f6a7-b8c9-4d0e-8f1a-2b3c4d5e6f7a',
};
const user = {
  id: ids.user,
  email: 'anna@example.com',
  name: 'Anna Koval',
  role: 'user',
  metadata: { department: 'IT' },
  createdAt: '2026-11-01T09:00:00.000Z',
};
const profile = {
  id: 'e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b',
  bio: 'Backend developer',
  userId: ids.user,
};
const category = { id: ids.category, name: 'Meeting rooms' };
const attachmentExample = {
  id: ids.file,
  originalName: 'invoice.pdf',
  mimetype: 'application/pdf',
  size: 48213,
  filename: '0f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a.pdf',
  uploadedAt: '2026-11-10T12:00:00.000Z',
};
// One example item per crud resource, used for item and list responses
const examples = {
  users: { ...user, profile },
  bookings: {
    id: ids.booking,
    userId: ids.user,
    resourceId: ids.resource,
    startTime: '2030-01-15T10:00:00.000Z',
    endTime: '2030-01-15T11:30:00.000Z',
    attachments: [attachmentExample],
  },
  resources: {
    id: ids.resource,
    name: 'Room 101',
    description: 'Meeting room for 8 people with a projector',
    categories: [category],
  },
  categories: category,
};
const tokens = {
  accessToken:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhMWIyYzNkNC1lNWY2LTRhN2ItOGM5ZC0wZTFmMmEzYjRjNWQiLCJyb2xlIjoidXNlciIsImlhdCI6MTc5NDQ4MDAwMCwiZXhwIjoxNzk0NDgwOTAwfQ.Zm9vYmFyc2lnbmF0dXJl',
  refreshToken: '9f2c4e7a1b3d5f60718293a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4',
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

const listResponse = (item) => ({
  description: 'OK, returns { data, meta }',
  content: {
    'application/json': {
      example: { data: [item], meta: { page: 1, limit: 10, total: 1, totalPages: 1 } },
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
});

const pick = (...codes) => Object.fromEntries(codes.map((c) => [c, errors[c]]));

module.exports = (resources) => {
  const paths = {};

  for (const [name, router] of Object.entries(resources)) {
    const { createSchema, updateSchema } = router.schemas;
    const tags = [name];
    const item = examples[name];
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
        responses: {
          201: ok('Created', item),
          ...bad(
            'Body failed Zod validation, is not valid JSON, or references a missing record',
            validationFailed,
            'Invalid JSON',
            'Related record does not exist',
          ),
          ...pick(409, 500),
        },
      }),
      get: secure(router.guards.read, {
        tags,
        summary: `List ${name}`,
        parameters: listParams(router.listOptions),
        responses: { 200: listResponse(item), ...badQuery, ...pick(500) },
      }),
    };

    paths[`/${name}/{id}`] = {
      parameters: [idParam],
      get: secure(router.guards.read, {
        tags,
        summary: `Get ${name} item`,
        responses: { 200: ok('OK', item), ...badId, ...pick(404, 500) },
      }),
      patch: secure(router.guards.write, {
        tags,
        summary: `Update ${name} item`,
        requestBody: body(updateSchema),
        responses: { 200: ok('OK', item), ...pick(400, 404, 409, 500) },
      }),
      delete: secure(router.guards.write, {
        tags,
        summary: `Delete ${name} item`,
        responses: { 204: { description: 'Deleted' }, ...badId, ...pick(404, 500) },
      }),
    };
  }

  const auth = (summary, schema, codes, secured) => ({
    tags: ['auth'],
    summary,
    ...(secured && { security: [{ bearerAuth: [] }] }),
    ...(schema && { requestBody: body(schema) }),
    responses: { ...(schema && badBody), ...codes, ...pick(500) },
  });
  const message = (description, text) => ok(description, { message: text });

  paths['/auth/register'] = {
    post: auth('Register a new user', authSchemas.register, {
      201: ok('Created, returns user and tokens', { user, ...tokens }),
      ...pick(409, 429),
    }),
  };
  paths['/auth/login'] = {
    post: auth('Log in', authSchemas.login, {
      200: ok('OK, returns user and tokens', { user, ...tokens }),
      401: error('Unknown email or wrong password', 'Invalid credentials'),
      ...pick(429),
    }),
  };
  paths['/auth/refresh'] = {
    post: auth('Rotate refresh token', authSchemas.refresh, {
      200: ok('OK, returns a new token pair; the old refresh token is now used', tokens),
      401: error('Refresh token unknown, expired or already used', 'Invalid refresh token'),
    }),
  };
  paths['/auth/logout'] = {
    post: auth('Revoke refresh token', authSchemas.refresh, { 204: { description: 'Logged out' } }),
  };
  paths['/auth/forgot-password'] = {
    post: auth('Request a password reset email', authSchemas.forgotPassword, {
      202: message(
        'Accepted, same response whether or not the email exists',
        'If the email exists, a reset link has been sent',
      ),
      ...pick(429),
    }),
  };
  paths['/auth/reset-password'] = {
    post: auth('Reset password with an emailed token', authSchemas.resetPassword, {
      200: message('Password reset, all refresh tokens revoked', 'Password has been reset'),
      ...bad(
        'Body failed validation, or the token is unknown, expired or used',
        validationFailed,
        'Invalid JSON',
        'Invalid or expired token',
      ),
      ...pick(429),
    }),
  };
  paths['/auth/me'] = {
    get: auth(
      'Get current user',
      null,
      { 200: ok('OK, returns the user with profile', { ...user, profile }), ...pick(401, 404) },
      true,
    ),
  };
  paths['/auth/password'] = {
    patch: auth(
      'Change password',
      authSchemas.changePassword,
      {
        200: message('Password changed, all refresh tokens revoked', 'Password changed'),
        401: error(
          'Missing/invalid access token, or wrong current password',
          'Unauthorized',
          'Invalid credentials',
        ),
        ...pick(404),
      },
      true,
    ),
  };

  const binary = { type: 'string', format: 'binary' };
  const multipart = (properties) => ({
    required: true,
    content: { 'multipart/form-data': { schema: { type: 'object', properties } } },
  });
  const attachment = (summary, codes, requestBody) => ({
    tags: ['bookings'],
    summary,
    security: [{ bearerAuth: [] }],
    ...(requestBody && { requestBody }),
    responses: { ...badId, ...codes, ...pick(401, 404, 500) },
  });
  const badUpload = (missing) =>
    bad(
      'Invalid id, missing file, file type not allowed, or too many files/unexpected field',
      'Invalid id',
      missing,
      'Unsupported file type',
      'Too many files',
      'Unexpected field',
    );

  paths['/bookings/{id}/attachments'] = {
    parameters: [idParam],
    post: attachment(
      'Upload attachments (jpeg, png, webp, pdf; up to 5 files)',
      {
        201: ok('Created, returns the full attachments array', [attachmentExample]),
        ...badUpload('No files uploaded'),
        ...pick(413),
      },
      multipart({ files: { type: 'array', items: binary } }),
    ),
  };
  paths['/bookings/{id}/attachments/{fileId}'] = {
    parameters: [idParam, { ...idParam, name: 'fileId' }],
    get: attachment('Download attachment', {
      200: {
        description: 'File content',
        content: { 'application/octet-stream': { schema: binary } },
      },
    }),
    patch: attachment(
      'Replace attachment file',
      {
        200: ok('OK, returns the updated attachment', attachmentExample),
        ...badUpload('No file uploaded'),
        ...pick(413),
      },
      multipart({ file: binary }),
    ),
    delete: attachment('Delete attachment', { 204: { description: 'Deleted' } }),
  };

  paths['/logs'] = {
    get: {
      tags: ['logs'],
      summary: 'List user actions (admin only, write requests)',
      security: [{ bearerAuth: [] }],
      parameters: listParams(logController.listOptions),
      responses: {
        200: listResponse({
          id: 'f0e1d2c3-b4a5-4968-8776-5a4b3c2d1e0f',
          userId: ids.user,
          method: 'POST',
          path: '/bookings',
          status: 201,
          createdAt: '2026-11-10T12:00:00.000Z',
        }),
        ...badQuery,
        ...pick(401, 403, 500),
      },
    },
  };

  // The global rate limit and unexpected errors apply to every route
  for (const ops of Object.values(paths))
    for (const op of Object.values(ops))
      if (op.responses) op.responses = { ...op.responses, ...pick(429, 500) };

  return {
    openapi: '3.0.3',
    info: { title: 'Booking API', version: '1.0.0' },
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      schemas: {
        Error: {
          type: 'object',
          required: ['error'],
          properties: {
            error: { type: 'string', description: 'Human-readable error message' },
            details: {
              type: 'array',
              items: { type: 'object' },
              description: 'Zod issues, only for "Validation failed"',
            },
          },
        },
      },
    },
    paths,
  };
};
