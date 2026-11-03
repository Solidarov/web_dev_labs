require('dotenv/config');
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const { test, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/utils/prisma');

after(() => prisma.$disconnect());

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

test('POST /users creates a user', async () => {
  const res = await request(app)
    .post('/users')
    .send({ email: `u-${unique()}@test.com`, name: 'Test User' });
  assert.strictEqual(res.status, 201);
  assert.ok(res.body.id);
});

test('POST /bookings creates a booking', async () => {
  const user = await prisma.user.create({ data: { email: `b-${unique()}@test.com`, name: 'Booker' } });
  const resource = await prisma.resource.create({ data: { name: 'Room 1' } });
  const res = await request(app).post('/bookings').send({
    userId: user.id,
    resourceId: resource.id,
    startTime: '2030-01-01T10:00:00.000Z',
    endTime: '2030-01-01T11:00:00.000Z',
  });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.userId, user.id);
});

test('POST /bookings with missing fields returns 400', async () => {
  const res = await request(app).post('/bookings').send({});
  assert.strictEqual(res.status, 400);
});

test('POST /bookings with endTime before startTime returns 400', async () => {
  const res = await request(app).post('/bookings').send({
    userId: '00000000-0000-4000-8000-000000000000',
    resourceId: '00000000-0000-4000-8000-000000000000',
    startTime: '2030-01-01T11:00:00.000Z',
    endTime: '2030-01-01T10:00:00.000Z',
  });
  assert.strictEqual(res.status, 400);
});

test('user CRUD: read, update, delete, duplicate and missing', async () => {
  const email = `c-${unique()}@test.com`;
  const created = await request(app).post('/users').send({ email, name: 'Crud', bio: 'hi' });
  assert.strictEqual(created.status, 201);
  assert.strictEqual(created.body.profile.bio, 'hi');
  const { id } = created.body;

  assert.strictEqual((await request(app).get(`/users/${id}`)).status, 200);
  const updated = await request(app).patch(`/users/${id}`).send({ name: 'Renamed' });
  assert.strictEqual(updated.body.name, 'Renamed');
  assert.strictEqual((await request(app).post('/users').send({ email, name: 'Dup' })).status, 409);
  assert.strictEqual((await request(app).delete(`/users/${id}`)).status, 204);
  assert.strictEqual((await request(app).get(`/users/${id}`)).status, 404);
  assert.strictEqual((await request(app).get('/users/not-a-uuid')).status, 400);
  assert.strictEqual((await request(app).get('/nope')).status, 404);
});

test('resource with category: create and list', async () => {
  const category = await request(app).post('/categories').send({ name: 'Rooms' });
  const resource = await request(app)
    .post('/resources')
    .send({ name: 'Room 2', categories: { connect: [{ id: category.body.id }] } });
  assert.strictEqual(resource.status, 201);
  assert.strictEqual(resource.body.categories.length, 1);
});

test('GET /docs.json exposes the generated OpenAPI spec', async () => {
  const res = await request(app).get('/docs.json');
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.paths['/users'].post.requestBody);
  assert.ok(res.body.paths['/bookings/{id}'].patch);
  assert.strictEqual(res.body.paths['/bookings'].post.requestBody.content['application/json'].schema.properties.startTime.format, 'date-time');
});
