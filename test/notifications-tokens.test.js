const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { boot, req, shutdown, tokens, ids } = require('./helpers');

describe('Notifications + API Tokens + Crashes', () => {
  before(async () => { await boot(); });
  after(async () => { await shutdown(); });

  it('GET /api/me/notifications returns empty initially', async () => {
    const res = await req('GET', '/api/me/notifications', { token: tokens.admin });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data.items));
    assert.equal(typeof res.data.unread, 'number');
  });

  it('POST /api/me/notifications/read marks all as read', async () => {
    const res = await req('POST', '/api/me/notifications/read', { token: tokens.admin });
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
  });

  it('GET /api/me/tokens returns empty initially', async () => {
    const res = await req('GET', '/api/me/tokens', { token: tokens.admin });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data));
    assert.equal(res.data.length, 0);
  });

  it('POST /api/me/tokens creates a token', async () => {
    const res = await req('POST', '/api/me/tokens', {
      token: tokens.admin,
      body: { name: 'test-token', scopes: ['control', 'files'] }
    });
    assert.equal(res.status, 201);
    assert.ok(res.data.token);
    assert.equal(res.data.name, 'test-token');
    assert.ok(res.data.scopes.includes('control'));
    assert.ok(res.data.scopes.includes('files'));
  });

  it('POST /api/me/tokens without name returns 400', async () => {
    const res = await req('POST', '/api/me/tokens', {
      token: tokens.admin,
      body: { scopes: ['all'] }
    });
    assert.equal(res.status, 400);
  });

  it('DELETE /api/me/tokens/:id deletes a token', async () => {
    const list = await req('GET', '/api/me/tokens', { token: tokens.admin });
    assert.ok(list.data.length > 0);
    const tokenId = list.data[0].id;
    const res = await req('DELETE', `/api/me/tokens/${tokenId}`, { token: tokens.admin });
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
  });

  it('DELETE /api/me/tokens/:id for non-existent token returns 404', async () => {
    const res = await req('DELETE', '/api/me/tokens/99999', { token: tokens.admin });
    assert.equal(res.status, 404);
  });

  it('GET /api/admin/crashes returns crash list', async () => {
    const res = await req('GET', '/api/admin/crashes', { token: tokens.admin });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data));
  });

  it('GET /api/servers/:id/crashes returns server crashes', async () => {
    const res = await req('GET', `/api/servers/${ids.server}/crashes`, { token: tokens.admin });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data));
  });

  it('GET /api/admin/logs returns activity logs', async () => {
    const res = await req('GET', '/api/admin/logs', { token: tokens.admin });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data));
    assert.ok(res.data.length > 0);
  });

  it('GET /api/admin/logs respects limit param', async () => {
    const res = await req('GET', '/api/admin/logs?limit=2', { token: tokens.admin });
    assert.equal(res.status, 200);
    assert.ok(res.data.length <= 2);
  });

  it('security headers present on API responses', async () => {
    const res = await req('GET', '/api/client/config');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.match(res.headers.get('referrer-policy'), /strict-origin/);
  });
});
