require('dotenv/config');
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.JWT_SECRET ??= 'test-secret';

const { test, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const express = require('express');
const app = require('../src/app');
const prisma = require('../src/utils/prisma');
const { authenticate, authorize, signAccessToken } = require('../src/utils/auth');

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
  const user = await prisma.user.create({
    data: { email: `b-${unique()}@test.com`, name: 'Booker' },
  });
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
  assert.strictEqual(
    res.body.paths['/bookings'].post.requestBody.content['application/json'].schema.properties
      .startTime.format,
    'date-time',
  );
});

const register = (overrides = {}) =>
  request(app)
    .post('/auth/register')
    .send({ email: `a-${unique()}@test.com`, name: 'Auth', password: 'password123', ...overrides });

test('POST /auth/register creates a user with tokens, ignores role, hides password', async () => {
  const res = await register({ role: 'admin' });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.user.role, 'user');
  assert.strictEqual(res.body.user.password, undefined);
  assert.ok(res.body.accessToken && res.body.refreshToken);

  const dup = await register({ email: res.body.user.email });
  assert.strictEqual(dup.status, 409);
  assert.strictEqual((await register({ password: 'short' })).status, 400);
  assert.strictEqual((await register({ email: 'not-an-email' })).status, 400);
});

test('POST /auth/login returns tokens or 401 on bad credentials', async () => {
  const { email } = (await register()).body.user;
  const ok = await request(app).post('/auth/login').send({ email, password: 'password123' });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.body.user.password, undefined);
  assert.ok(ok.body.accessToken && ok.body.refreshToken);

  const bad = await request(app).post('/auth/login').send({ email, password: 'wrongpass1' });
  assert.strictEqual(bad.status, 401);
  assert.deepStrictEqual(bad.body, { error: 'Invalid credentials' });
  const unknown = await request(app)
    .post('/auth/login')
    .send({ email: `none-${unique()}@test.com`, password: 'password123' });
  assert.strictEqual(unknown.status, 401);
});

test('GET /auth/me requires a valid bearer token', async () => {
  const { user, accessToken } = (await register()).body;
  const me = await request(app).get('/auth/me').set('Authorization', `Bearer ${accessToken}`);
  assert.strictEqual(me.status, 200);
  assert.strictEqual(me.body.id, user.id);
  assert.strictEqual(me.body.password, undefined);

  assert.strictEqual((await request(app).get('/auth/me')).status, 401);
  const garbage = await request(app).get('/auth/me').set('Authorization', 'Bearer garbage');
  assert.strictEqual(garbage.status, 401);
  assert.deepStrictEqual(garbage.body, { error: 'Unauthorized' });
});

test('POST /auth/refresh rotates tokens and rejects reuse', async () => {
  const { refreshToken } = (await register()).body;
  const first = await request(app).post('/auth/refresh').send({ refreshToken });
  assert.strictEqual(first.status, 200);
  assert.ok(first.body.accessToken);
  assert.notStrictEqual(first.body.refreshToken, refreshToken);

  const reused = await request(app).post('/auth/refresh').send({ refreshToken });
  assert.strictEqual(reused.status, 401);
  assert.deepStrictEqual(reused.body, { error: 'Invalid refresh token' });
  const next = await request(app)
    .post('/auth/refresh')
    .send({ refreshToken: first.body.refreshToken });
  assert.strictEqual(next.status, 200);
});

test('POST /auth/logout revokes the refresh token', async () => {
  const { refreshToken } = (await register()).body;
  assert.strictEqual((await request(app).post('/auth/logout').send({ refreshToken })).status, 204);
  assert.strictEqual((await request(app).post('/auth/refresh').send({ refreshToken })).status, 401);
  const unknown = await request(app).post('/auth/logout').send({ refreshToken: 'unknown' });
  assert.strictEqual(unknown.status, 204);
});

test('PATCH /auth/password checks current password and revokes refresh tokens', async () => {
  const { user, accessToken, refreshToken } = (await register()).body;
  const auth = `Bearer ${accessToken}`;
  const wrong = await request(app)
    .patch('/auth/password')
    .set('Authorization', auth)
    .send({ currentPassword: 'wrongpass1', newPassword: 'newpassword1' });
  assert.strictEqual(wrong.status, 401);

  const ok = await request(app)
    .patch('/auth/password')
    .set('Authorization', auth)
    .send({ currentPassword: 'password123', newPassword: 'newpassword1' });
  assert.strictEqual(ok.status, 200);
  assert.deepStrictEqual(ok.body, { message: 'Password changed' });

  const login = await request(app)
    .post('/auth/login')
    .send({ email: user.email, password: 'newpassword1' });
  assert.strictEqual(login.status, 200);
  assert.strictEqual((await request(app).post('/auth/refresh').send({ refreshToken })).status, 401);
});

test('authorize returns 403 when the role is not allowed', async () => {
  const mini = express();
  mini.get('/admin', authenticate, authorize('admin'), (req, res) => res.json({ ok: true }));
  const userToken = signAccessToken({ id: 'u1', role: 'user' });
  const adminToken = signAccessToken({ id: 'a1', role: 'admin' });
  const denied = await request(mini).get('/admin').set('Authorization', `Bearer ${userToken}`);
  assert.strictEqual(denied.status, 403);
  assert.deepStrictEqual(denied.body, { error: 'Forbidden' });
  const allowed = await request(mini).get('/admin').set('Authorization', `Bearer ${adminToken}`);
  assert.strictEqual(allowed.status, 200);
});

test('GET /docs.json documents auth routes with bearer security', async () => {
  const res = await request(app).get('/docs.json');
  assert.ok(res.body.components.securitySchemes.bearerAuth);
  assert.ok(res.body.paths['/auth/register'].post.requestBody);
  assert.ok(res.body.paths['/auth/me'].get.security);
});
