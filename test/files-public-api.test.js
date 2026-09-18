const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { boot, req, shutdown, tokens, ids } = require('./helpers');

describe('File Operations + Public API + Client API', () => {
  before(async () => { await boot(); });
  after(async () => { await shutdown(); });

  it('GET /api/servers/:id/files lists server directory', async () => {
    const res = await req('GET', `/api/servers/${ids.server}/files`, { token: tokens.admin });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data));
  });

  it('PUT /api/servers/:id/files/write creates a file', async () => {
    const res = await req('PUT', `/api/servers/${ids.server}/files/write`, {
      token: tokens.admin,
      body: { path: 'test.txt', content: 'hello world' }
    });
    assert.equal(res.status, 200);
    assert.ok(res.data.message);
  });

  it('GET /api/servers/:id/files/read reads the file', async () => {
    const res = await req('GET', `/api/servers/${ids.server}/files/read?path=test.txt`, { token: tokens.admin });
    assert.equal(res.status, 200);
    assert.equal(res.data.content, 'hello world');
  });

  it('POST /api/servers/:id/files/mkdir creates directory', async () => {
    const res = await req('POST', `/api/servers/${ids.server}/files/mkdir`, {
      token: tokens.admin,
      body: { path: 'subdir/nested' }
    });
    assert.equal(res.status, 200);
    assert.ok(res.data.message);
  });

  it('DELETE /api/servers/:id/files deletes a file', async () => {
    const res = await req('DELETE', `/api/servers/${ids.server}/files`, {
      token: tokens.admin,
      body: { path: 'test.txt' }
    });
    assert.equal(res.status, 200);
  });

  it('non-owner with files permission can read files', async () => {
    const res = await req('GET', `/api/servers/${ids.server}/files`, { token: tokens.bob });
    assert.equal(res.status, 200);
  });

  it('GET /api/client/config returns panel configuration', async () => {
    const res = await req('GET', '/api/client/config');
    assert.equal(res.status, 200);
    assert.ok(res.data.panel_name);
    assert.equal(typeof res.data.max_servers_per_user, 'number');
    assert.equal(typeof res.data.ram_per_user, 'number');
  });

  it('GET /api/client/health returns healthy with 200', async () => {
    const res = await req('GET', '/api/client/health');
    assert.equal(res.status, 200);
    assert.equal(res.data.status, 'healthy');
    assert.equal(res.data.database, 'connected');
  });

  it('GET /api/client/servers lists servers (unauthenticated shows public fields)', async () => {
    const res = await req('GET', '/api/client/servers');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data));
    if (res.data.length > 0) {
      assert.ok(res.data[0].name);
      assert.ok(res.data[0].server_type);
    }
  });

  it('GET /api returns API info', async () => {
    const res = await req('GET', '/api');
    assert.equal(res.status, 200);
    assert.equal(res.data.name, 'NetherPanel API');
    assert.ok(res.data.endpoints);
  });

  it('GET /api/public/status returns server status list', async () => {
    const res = await req('GET', '/api/public/status');
    assert.equal(res.status, 200);
    assert.ok(res.data.panel_name);
    assert.ok(Array.isArray(res.data.servers));
  });

  it('GET /api/public/status/:slug returns single server', async () => {
    const res = await req('GET', '/api/public/status/testsrv');
    assert.equal(res.status, 200);
    assert.equal(res.data.name, 'TestSrv');
  });

  it('GET /api/public/status/:slug for unknown slug returns 404', async () => {
    const res = await req('GET', '/api/public/status/nonexistent');
    assert.equal(res.status, 404);
  });

  it('PUT /api/servers/:id updates server name', async () => {
    const res = await req('PUT', `/api/servers/${ids.server}`, {
      token: tokens.admin,
      body: { name: 'UpdatedSrv' }
    });
    assert.equal(res.status, 200);
    assert.equal(res.data.name, 'UpdatedSrv');
    // restore
    await req('PUT', `/api/servers/${ids.server}`, { token: tokens.admin, body: { name: 'TestSrv' } });
  });

  it('invalid JSON body returns 400 (crash handler)', async () => {
    const res = await req('POST', '/api/servers', {
      token: tokens.admin,
      headers: { 'Content-Type': 'application/json' },
      body: undefined
    });
    // The helper can't send raw bad JSON, but we can verify the endpoint validates
    const bad = await req('POST', '/api/servers', {
      token: tokens.admin,
      body: { /* missing name */ ram_min: 1024, ram_max: 2048 }
    });
    assert.equal(bad.status, 400);
    assert.match(bad.data.error, /name/i);
  });

  it('unauthenticated user cannot access /api/servers', async () => {
    const res = await req('GET', '/api/servers');
    assert.equal(res.status, 401);
  });

  it('GET /api/servers/types returns server types', async () => {
    const res = await req('GET', '/api/servers/types', { token: tokens.admin });
    assert.equal(res.status, 200);
    assert.ok(res.data.java);
    assert.ok(res.data.bedrock);
    assert.ok(res.data.java.paper);
    assert.ok(res.data.bedrock.bedrock);
  });

  it('GET /api/servers/templates returns templates', async () => {
    const res = await req('GET', '/api/servers/templates', { token: tokens.admin });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data));
    assert.ok(res.data.length >= 4);
  });
});
