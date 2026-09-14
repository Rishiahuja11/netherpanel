const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { boot, req, shutdown } = require('./helpers');

describe('Auth', () => {
  before(async () => { await boot(); });
  after(async () => { await shutdown(); });

  it('login admin', async () => {
    const res = await req('POST', '/api/auth/login', { body: { username: 'admin', password: 'admin123' } });
    assert.equal(res.status, 200);
    assert.ok(res.data.token);
    assert.equal(res.data.user.username, 'admin');
    assert.equal(res.data.user.role, 'admin');
  });

  it('login bad password → 401', async () => {
    const res = await req('POST', '/api/auth/login', { body: { username: 'admin', password: 'wrong' } });
    assert.equal(res.status, 401);
  });

  it('login missing fields → 400', async () => {
    const res = await req('POST', '/api/auth/login', { body: { username: '' } });
    assert.equal(res.status, 400);
  });

  it('register valid user', async () => {
    const res = await req('POST', '/api/auth/register', {
      body: { username: 'newuser', email: 'new@test.io', password: 'goodpass123' },
    });
    assert.equal(res.status, 201);
    assert.ok(res.data.user);
  });

  it('register short password → 400', async () => {
    const res = await req('POST', '/api/auth/register', {
      body: { username: 'shortpw', email: 'sp@test.io', password: '123' },
    });
    assert.equal(res.status, 400);
    assert.match(res.data.error, /8 characters/);
  });

  it('register bad username chars → 400', async () => {
    const res = await req('POST', '/api/auth/register', {
      body: { username: 'bad user!', email: 'bad@test.io', password: 'goodpass123' },
    });
    assert.equal(res.status, 400);
    assert.match(res.data.error, /letters, numbers/);
  });

  it('register short username → 400', async () => {
    const res = await req('POST', '/api/auth/register', {
      body: { username: 'ab', email: 's@test.io', password: 'goodpass123' },
    });
    assert.equal(res.status, 400);
  });

  it('register invalid email → 400', async () => {
    const res = await req('POST', '/api/auth/register', {
      body: { username: 'validemail', email: 'not-an-email', password: 'goodpass123' },
    });
    assert.equal(res.status, 400);
  });

  it('PUT /api/auth/me/password validates length', async () => {
    const adminToken = (await req('POST', '/api/auth/login', { body: { username: 'admin', password: 'admin123' } })).data.token;
    const res = await req('PUT', '/api/auth/me/password', {
      token: adminToken,
      body: { currentPassword: 'admin123', newPassword: 'short' },
    });
    assert.equal(res.status, 400);
    assert.match(res.data.error, /8 characters/);
  });

  it('rate limit after 15 rapid logins', async () => {
    for (let i = 0; i < 15; i++) {
      await req('POST', '/api/auth/login', { body: { username: 'admin', password: 'wrong' } });
    }
    const res = await req('POST', '/api/auth/login', { body: { username: 'admin', password: 'wrong' } });
    assert.equal(res.status, 429);
    assert.match(res.data.error, /Too many/i);
  });
});