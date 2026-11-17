require('dotenv/config');
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.JWT_SECRET ??= 'test-secret';
// Uploads go to a temp dir, and a tiny size limit makes the 413 case cheap to test
process.env.UPLOAD_DIR = require('node:path').join(
  require('node:os').tmpdir(),
  'booking-test-uploads',
);
process.env.MAX_FILE_SIZE = '1024';
// High limits so the suite never hits 429; the limiter itself is tested on a mini app
process.env.RATE_LIMIT = '10000';
process.env.AUTH_RATE_LIMIT = '10000';
process.env.CORS_ORIGIN ??= 'http://localhost:5173';
// Never send real email: an empty SMTP_HOST makes the mailer use nodemailer's jsonTransport
process.env.SMTP_HOST = '';

const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const express = require('express');
const app = require('../src/app');
const prisma = require('../src/utils/prisma');
const { authenticate, authorize, signAccessToken } = require('../src/utils/auth');
const { limiter } = require('../src/utils/rateLimit');
const eventBus = require('../src/utils/eventBus');
const { sendResetEmail } = require('../src/utils/mailer');

after(() => prisma.$disconnect());

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Creates a user directly in the DB and returns it with a ready Authorization header
const makeUser = async (role = 'user') => {
  const user = await prisma.user.create({
    data: { email: `${role}-${unique()}@test.com`, name: role, role },
  });
  return { user, auth: `Bearer ${signAccessToken(user)}` };
};
const makeAdmin = () => makeUser('admin');

test('POST /users creates a user', async () => {
  const { auth } = await makeAdmin();
  const res = await request(app)
    .post('/users')
    .set('Authorization', auth)
    .send({ email: `u-${unique()}@test.com`, name: 'Test User' });
  assert.strictEqual(res.status, 201);
  assert.ok(res.body.id);
});

test('POST /bookings creates a booking', async () => {
  const { user, auth } = await makeUser();
  const resource = await prisma.resource.create({ data: { name: 'Room 1' } });
  const res = await request(app).post('/bookings').set('Authorization', auth).send({
    userId: user.id,
    resourceId: resource.id,
    startTime: '2030-01-01T10:00:00.000Z',
    endTime: '2030-01-01T11:00:00.000Z',
  });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.userId, user.id);
});

test('POST /bookings with missing fields returns 400', async () => {
  const { auth } = await makeUser();
  const res = await request(app).post('/bookings').set('Authorization', auth).send({});
  assert.strictEqual(res.status, 400);
});

test('POST /bookings with endTime before startTime returns 400', async () => {
  const { auth } = await makeUser();
  const res = await request(app).post('/bookings').set('Authorization', auth).send({
    userId: '00000000-0000-4000-8000-000000000000',
    resourceId: '00000000-0000-4000-8000-000000000000',
    startTime: '2030-01-01T11:00:00.000Z',
    endTime: '2030-01-01T10:00:00.000Z',
  });
  assert.strictEqual(res.status, 400);
});

test('user CRUD: read, update, delete, duplicate and missing', async () => {
  const { auth } = await makeAdmin();
  const as = (req) => req.set('Authorization', auth);
  const email = `c-${unique()}@test.com`;
  const created = await as(request(app).post('/users')).send({ email, name: 'Crud', bio: 'hi' });
  assert.strictEqual(created.status, 201);
  assert.strictEqual(created.body.profile.bio, 'hi');
  const { id } = created.body;

  assert.strictEqual((await as(request(app).get(`/users/${id}`))).status, 200);
  const updated = await as(request(app).patch(`/users/${id}`)).send({ name: 'Renamed' });
  assert.strictEqual(updated.body.name, 'Renamed');
  const dup = await as(request(app).post('/users')).send({ email, name: 'Dup' });
  assert.strictEqual(dup.status, 409);
  assert.strictEqual((await as(request(app).delete(`/users/${id}`))).status, 204);
  assert.strictEqual((await as(request(app).get(`/users/${id}`))).status, 404);
  assert.strictEqual((await as(request(app).get('/users/not-a-uuid'))).status, 400);
  assert.strictEqual((await request(app).get('/nope')).status, 404);
});

test('resource with category: create and list', async () => {
  const { auth } = await makeAdmin();
  const category = await request(app)
    .post('/categories')
    .set('Authorization', auth)
    .send({ name: 'Rooms' });
  const resource = await request(app)
    .post('/resources')
    .set('Authorization', auth)
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

test('resources: public read, admin-only write', async () => {
  const { auth: userAuth } = await makeUser();
  const { auth: adminAuth } = await makeAdmin();
  const body = { name: 'Guarded room' };
  const anon = await request(app).post('/resources').send(body);
  assert.strictEqual(anon.status, 401);
  const asUser = await request(app).post('/resources').set('Authorization', userAuth).send(body);
  assert.strictEqual(asUser.status, 403);
  // Guards run before validation: an invalid body without a token is still 401
  assert.strictEqual((await request(app).post('/resources').send({})).status, 401);
  const asAdmin = await request(app).post('/resources').set('Authorization', adminAuth).send(body);
  assert.strictEqual(asAdmin.status, 201);
  assert.strictEqual((await request(app).get('/resources')).status, 200);
  assert.strictEqual((await request(app).get(`/resources/${asAdmin.body.id}`)).status, 200);
});

test('users: admin only', async () => {
  const { auth: userAuth } = await makeUser();
  const { auth: adminAuth } = await makeAdmin();
  assert.strictEqual((await request(app).get('/users')).status, 401);
  assert.strictEqual((await request(app).get('/users').set('Authorization', userAuth)).status, 403);
  assert.strictEqual(
    (await request(app).get('/users').set('Authorization', adminAuth)).status,
    200,
  );
});

test('bookings: owner-scoped for users, full access for admins', async () => {
  const a = await makeUser();
  const b = await makeUser();
  const admin = await makeAdmin();
  const resource = await prisma.resource.create({ data: { name: 'Room 3' } });
  const book = (who, extra = {}) =>
    request(app)
      .post('/bookings')
      .set('Authorization', who.auth)
      .send({
        resourceId: resource.id,
        startTime: '2030-02-01T10:00:00.000Z',
        endTime: '2030-02-01T11:00:00.000Z',
        ...extra,
      });

  assert.strictEqual((await request(app).get('/bookings')).status, 401);

  // userId comes from the token, even if another one is sent
  const own = await book(a, { userId: b.user.id });
  assert.strictEqual(own.status, 201);
  assert.strictEqual(own.body.userId, a.user.id);
  const other = await book(b);
  const otherUrl = `/bookings/${other.body.id}`;

  // A cannot see or change B's booking: 404, not 403
  const asA = (req) => req.set('Authorization', a.auth);
  assert.strictEqual((await asA(request(app).get(otherUrl))).status, 404);
  const patch = await asA(request(app).patch(otherUrl)).send({ endTime: '2030-02-01T12:00:00Z' });
  assert.strictEqual(patch.status, 404);
  assert.strictEqual((await asA(request(app).delete(otherUrl))).status, 404);

  const list = await asA(request(app).get('/bookings'));
  assert.strictEqual(list.status, 200);
  assert.ok(list.body.data.length > 0);
  assert.ok(list.body.data.every((x) => x.userId === a.user.id));

  // A cannot reassign their own booking to B
  const moved = await asA(request(app).patch(`/bookings/${own.body.id}`)).send({
    userId: b.user.id,
  });
  assert.strictEqual(moved.status, 200);
  assert.strictEqual(moved.body.userId, a.user.id);

  // Admin sees everything and may book for another user
  const asAdmin = (req) => req.set('Authorization', admin.auth);
  assert.strictEqual((await asAdmin(request(app).get(otherUrl))).status, 200);
  const all = await asAdmin(request(app).get(`/bookings?userId=${b.user.id}`));
  assert.ok(all.body.data.some((x) => x.id === other.body.id));
  const forB = await book(admin, { userId: b.user.id });
  assert.strictEqual(forB.body.userId, b.user.id);
  assert.strictEqual((await book(admin)).body.userId, admin.user.id);
  assert.strictEqual((await asAdmin(request(app).delete(otherUrl))).status, 204);
});

test('GET /docs.json marks guarded crud routes with bearer security', async () => {
  const { paths } = (await request(app).get('/docs.json')).body;
  assert.ok(paths['/resources'].post.security);
  assert.ok(paths['/resources'].post.responses[403]);
  assert.strictEqual(paths['/resources'].get.security, undefined);
  assert.ok(paths['/users/{id}'].get.security);
});

test('list: pagination, search, sorting and limit clamp', async () => {
  const prefix = `cat-${unique()}`;
  for (const suffix of ['a', 'b', 'c'])
    await prisma.category.create({ data: { name: `${prefix}-${suffix}` } });
  const list = (qs) => request(app).get(`/categories?q=${prefix.toUpperCase()}&${qs}`);

  const page1 = await list('limit=2&page=1');
  assert.strictEqual(page1.status, 200);
  assert.strictEqual(page1.body.data.length, 2);
  assert.deepStrictEqual(page1.body.meta, { page: 1, limit: 2, total: 3, totalPages: 2 });
  const page2 = await list('limit=2&page=2');
  assert.strictEqual(page2.body.data.length, 1);

  const desc = await list('sort=name&order=desc');
  assert.deepStrictEqual(
    desc.body.data.map((x) => x.name),
    ['c', 'b', 'a'].map((x) => `${prefix}-${x}`),
  );
  assert.strictEqual((await list('limit=1000')).body.meta.limit, 100);
  assert.strictEqual((await list('page=abc')).body.meta.page, 1);

  const badSort = await request(app).get('/categories?sort=id; drop');
  assert.strictEqual(badSort.status, 400);
  assert.deepStrictEqual(badSort.body, { error: 'Invalid query' });
  assert.strictEqual((await request(app).get('/categories?order=up')).status, 400);
});

test('list filters: user role, resource categoryId', async () => {
  const admin = await makeAdmin();
  const users = (qs) =>
    request(app).get(`/users?q=${admin.user.email}&${qs}`).set('Authorization', admin.auth);
  assert.strictEqual((await users('role=admin')).body.meta.total, 1);
  assert.strictEqual((await users('role=user')).body.meta.total, 0);

  const category = await prisma.category.create({ data: { name: `cat-${unique()}` } });
  const inCategory = await prisma.resource.create({
    data: { name: 'Filtered', categories: { connect: [{ id: category.id }] } },
  });
  await prisma.resource.create({ data: { name: 'Filtered' } });
  const res = await request(app).get(`/resources?categoryId=${category.id}`);
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(
    res.body.data.map((x) => x.id),
    [inCategory.id],
  );
  assert.strictEqual((await request(app).get('/resources?categoryId=nope')).status, 400);
});

test('list filters: bookings by resource and time, scoped for non-admins', async () => {
  const a = await makeUser();
  const b = await makeUser();
  const admin = await makeAdmin();
  const resource = await prisma.resource.create({ data: { name: 'Room 4' } });
  const other = await prisma.resource.create({ data: { name: 'Room 5' } });
  const book = (resourceId, day) =>
    prisma.booking.create({
      data: {
        userId: a.user.id,
        resourceId,
        startTime: new Date(`2031-01-0${day}T10:00:00Z`),
        endTime: new Date(`2031-01-0${day}T11:00:00Z`),
      },
    });
  const first = await book(resource.id, 1);
  const second = await book(resource.id, 2);
  await book(other.id, 1);
  const get = (who, qs) => request(app).get(`/bookings?${qs}`).set('Authorization', who.auth);
  const ids = async (who, qs) => (await get(who, qs)).body.data.map((x) => x.id);

  const r = `resourceId=${resource.id}`;
  assert.deepStrictEqual(await ids(admin, r), [first.id, second.id]);
  assert.deepStrictEqual(await ids(admin, `${r}&order=desc`), [second.id, first.id]);
  assert.deepStrictEqual(await ids(admin, `${r}&from=2031-01-02T00:00:00Z`), [second.id]);
  assert.deepStrictEqual(await ids(a, `${r}&to=2031-01-01T12:00:00Z`), [first.id]);

  // The userId filter cannot widen a non-admin's scope
  assert.deepStrictEqual(await ids(b, `userId=${a.user.id}`), []);

  const bad = await get(admin, 'resourceId=not-a-uuid');
  assert.strictEqual(bad.status, 400);
  assert.deepStrictEqual(bad.body, { error: 'Invalid query' });
  assert.strictEqual((await get(admin, 'from=garbage')).status, 400);
});

test('GET /docs.json documents list query parameters', async () => {
  const { paths } = (await request(app).get('/docs.json')).body;
  const names = (path) => paths[path].get.parameters.map((p) => p.name);
  assert.deepStrictEqual(names('/bookings'), [
    'page',
    'limit',
    'sort',
    'order',
    'resourceId',
    'userId',
    'from',
    'to',
  ]);
  assert.ok(names('/categories').includes('q'));
  assert.deepStrictEqual(paths['/users'].get.parameters[2].schema.enum, [
    'createdAt',
    'name',
    'email',
  ]);
  assert.ok(paths['/users'].get.responses[400]);
});

test('booking attachments: upload, download, replace, delete, guards', async () => {
  const owner = await makeUser();
  const stranger = await makeUser();
  const resource = await prisma.resource.create({ data: { name: 'Room 6' } });
  const booking = await request(app)
    .post('/bookings')
    .set('Authorization', owner.auth)
    .send({
      resourceId: resource.id,
      startTime: '2032-01-01T10:00:00.000Z',
      endTime: '2032-01-01T11:00:00.000Z',
      attachments: [{ id: 'x', filename: '../../.env' }],
    });
  assert.strictEqual(booking.status, 201);
  // Client-supplied attachment metadata is ignored
  assert.strictEqual(booking.body.attachments, null);

  const url = `/bookings/${booking.body.id}/attachments`;
  const as = (who, req) => req.set('Authorization', who.auth);
  const png = (name = 'a.png') => ({ filename: name, contentType: 'image/png' });

  const uploaded = await as(owner, request(app).post(url))
    .attach('files', Buffer.from('first'), png('a.PNG'))
    .attach('files', Buffer.from('%PDF-1'), { filename: 'b.pdf', contentType: 'application/pdf' });
  assert.strictEqual(uploaded.status, 201);
  assert.strictEqual(uploaded.body.length, 2);
  const [first] = uploaded.body;
  assert.strictEqual(first.originalName, 'a.PNG');
  assert.match(first.filename, /^[0-9a-f-]{36}\.png$/);
  const fileUrl = `${url}/${first.id}`;

  const download = await as(owner, request(app).get(fileUrl)).buffer();
  assert.strictEqual(download.status, 200);
  assert.strictEqual(download.body.toString(), 'first');

  const replaced = await as(owner, request(app).patch(fileUrl)).attach(
    'file',
    Buffer.from('second'),
    png(),
  );
  assert.strictEqual(replaced.status, 200);
  assert.strictEqual(replaced.body.id, first.id);
  assert.ok(!fs.existsSync(path.join(process.env.UPLOAD_DIR, first.filename)));
  const again = await as(owner, request(app).get(fileUrl)).buffer();
  assert.strictEqual(again.body.toString(), 'second');

  // Errors: wrong type, too large, no files, foreign booking, no token, bad fileId
  const text = await as(owner, request(app).post(url)).attach('files', Buffer.from('hi'), {
    filename: 'a.txt',
    contentType: 'text/plain',
  });
  assert.strictEqual(text.status, 400);
  assert.deepStrictEqual(text.body, { error: 'Unsupported file type' });
  const big = await as(owner, request(app).post(url)).attach('files', Buffer.alloc(2048), png());
  assert.strictEqual(big.status, 413);
  assert.deepStrictEqual(big.body, { error: 'File too large' });
  assert.strictEqual((await as(owner, request(app).post(url))).status, 400);
  const foreign = await as(stranger, request(app).post(url)).attach(
    'files',
    Buffer.from('x'),
    png(),
  );
  assert.strictEqual(foreign.status, 404);
  assert.strictEqual((await as(stranger, request(app).get(fileUrl))).status, 404);
  assert.strictEqual((await request(app).get(fileUrl)).status, 401);
  assert.strictEqual((await as(owner, request(app).get(`${url}/nope`))).status, 400);

  assert.strictEqual((await as(owner, request(app).delete(fileUrl))).status, 204);
  assert.strictEqual((await as(owner, request(app).get(fileUrl))).status, 404);
  const left = await prisma.booking.findUnique({ where: { id: booking.body.id } });
  assert.strictEqual(left.attachments.length, 1);
});

test('GET /docs.json documents attachment routes', async () => {
  const { paths } = (await request(app).get('/docs.json')).body;
  const upload = paths['/bookings/{id}/attachments'].post;
  assert.ok(upload.security && upload.responses[413]);
  assert.ok(upload.requestBody.content['multipart/form-data']);
  assert.ok(paths['/bookings/{id}/attachments/{fileId}'].delete);
});

test('security headers: helmet and CORS for the allowed origin', async () => {
  const origin = process.env.CORS_ORIGIN;
  const res = await request(app).get('/resources').set('Origin', origin);
  assert.strictEqual(res.headers['x-content-type-options'], 'nosniff');
  assert.ok(res.headers['content-security-policy']);
  assert.strictEqual(res.headers['access-control-allow-origin'], origin);
});

test('rate limit: headers on auth routes, 429 with error body over the limit', async () => {
  const login = await request(app).post('/auth/login').send({});
  assert.ok(login.headers['ratelimit-policy']);
  assert.ok(login.headers['ratelimit']);

  const mini = express();
  mini.use(limiter(1));
  mini.get('/', (req, res) => res.json({ ok: true }));
  assert.strictEqual((await request(mini).get('/')).status, 200);
  const limited = await request(mini).get('/');
  assert.strictEqual(limited.status, 429);
  assert.deepStrictEqual(limited.body, { error: 'Too many requests' });
});

test('action log: write requests are logged, GET /logs is admin only', async () => {
  const { user, auth } = await makeUser();
  const admin = await makeAdmin();
  const resource = await prisma.resource.create({ data: { name: 'Room 7' } });
  const booking = await request(app).post('/bookings?x=1').set('Authorization', auth).send({
    resourceId: resource.id,
    startTime: '2033-01-01T10:00:00.000Z',
    endTime: '2033-01-01T11:00:00.000Z',
  });
  assert.strictEqual(booking.status, 201);

  const logs = (who, qs) => request(app).get(`/logs?${qs}`).set('Authorization', who.auth);
  // The log is written after the response, so poll briefly
  let entry;
  for (let i = 0; i < 20 && !entry; i++) {
    const res = await logs(admin, `userId=${user.id}&order=desc`);
    assert.strictEqual(res.status, 200);
    entry = res.body.data.find((x) => x.method === 'POST' && x.path === '/bookings');
    if (!entry) await new Promise((r) => setTimeout(r, 50));
  }
  assert.ok(entry);
  assert.strictEqual(entry.status, 201);
  assert.deepStrictEqual(Object.keys(entry).sort(), [
    'createdAt',
    'id',
    'method',
    'path',
    'status',
    'userId',
  ]);

  assert.strictEqual((await logs({ auth }, '')).status, 403);
  assert.strictEqual((await request(app).get('/logs')).status, 401);
  const bad = await logs(admin, 'userId=nope');
  assert.strictEqual(bad.status, 400);
  assert.deepStrictEqual(bad.body, { error: 'Invalid query' });
});

test('Swagger UI is served at /docs and /api-docs, /logs is documented', async () => {
  assert.strictEqual((await request(app).get('/docs/')).status, 200);
  const ui = await request(app).get('/api-docs/');
  assert.strictEqual(ui.status, 200);
  assert.match(ui.text, /swagger-ui/);
  const { paths } = (await request(app).get('/docs.json')).body;
  assert.ok(paths['/logs'].get.security && paths['/logs'].get.responses[403]);
});

// Sends forgot-password and returns the response plus the token emitted for that email (if any)
const forgot = async (email) => {
  let token;
  const listener = (e) => e.email === email && (token = e.token);
  eventBus.on('passwordResetRequested', listener);
  const res = await request(app).post('/auth/forgot-password').send({ email });
  eventBus.off('passwordResetRequested', listener);
  return { res, token };
};

test('POST /auth/forgot-password answers 202 for any email, emits only for known users', async () => {
  const message = { message: 'If the email exists, a reset link has been sent' };
  const unknown = await forgot(`nobody-${unique()}@test.com`);
  assert.strictEqual(unknown.res.status, 202);
  assert.deepStrictEqual(unknown.res.body, message);
  assert.strictEqual(unknown.token, undefined);

  const email = (await register()).body.user.email;
  const known = await forgot(email);
  assert.strictEqual(known.res.status, 202);
  assert.deepStrictEqual(known.res.body, message);
  assert.ok(known.token);

  assert.strictEqual((await forgot('not-an-email')).res.status, 400);
});

test('POST /auth/reset-password sets a new password once and revokes refresh tokens', async () => {
  const { user, refreshToken } = (await register()).body;
  const first = (await forgot(user.email)).token;
  const { token } = await forgot(user.email);
  const reset = (t, password = 'newpassword1') =>
    request(app).post('/auth/reset-password').send({ token: t, password });
  const invalid = { error: 'Invalid or expired token' };

  // A newer request invalidates the previous token
  const old = await reset(first);
  assert.strictEqual(old.status, 400);
  assert.deepStrictEqual(old.body, invalid);
  assert.strictEqual((await reset(token, 'short')).status, 400);

  const ok = await reset(token);
  assert.strictEqual(ok.status, 200);
  assert.deepStrictEqual(ok.body, { message: 'Password has been reset' });

  const login = (password) =>
    request(app).post('/auth/login').send({ email: user.email, password });
  assert.strictEqual((await login('newpassword1')).status, 200);
  assert.strictEqual((await login('password123')).status, 401);
  assert.strictEqual((await request(app).post('/auth/refresh').send({ refreshToken })).status, 401);

  assert.deepStrictEqual((await reset(token)).body, invalid);
  assert.strictEqual((await reset('garbage')).status, 400);
  // A refresh token is not accepted as a reset token
  const other = (await register()).body.refreshToken;
  assert.strictEqual((await reset(other)).status, 400);
});

test('mailer renders the reset email locally with the token and link', async () => {
  const info = await sendResetEmail({ email: 'x@test.com', token: 'tok123' });
  const mail = JSON.parse(info.message);
  assert.deepStrictEqual(
    mail.to.map((t) => t.address),
    ['x@test.com'],
  );
  assert.match(mail.text, /tok123/);
  assert.match(mail.html, /reset-password\?token=tok123/);
});

test('GET /docs.json documents the password reset routes', async () => {
  const { paths } = (await request(app).get('/docs.json')).body;
  assert.ok(paths['/auth/forgot-password'].post.responses[202]);
  assert.ok(paths['/auth/forgot-password'].post.responses[429]);
  assert.ok(paths['/auth/reset-password'].post.requestBody);
});
