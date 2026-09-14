const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { boot, req, shutdown, tokens, ids, db } = require('./helpers');

describe('Sub-user Access Control', () => {
  before(async () => { await boot(); });
  after(async () => { await shutdown(); });

  it('bob sees TestSrv in list with role member', async () => {
    const res = await req('GET', '/api/servers', { token: tokens.bob });
    assert.equal(res.status, 200);
    const srv = res.data.find(s => s.id === ids.server);
    assert.ok(srv, 'TestSrv should be visible to bob');
    assert.equal(srv.access_role, 'member');
  });

  it('bob can GET /:id detail', async () => {
    const res = await req('GET', `/api/servers/${ids.server}`, { token: tokens.bob });
    assert.equal(res.status, 200);
    assert.equal(res.data.access_role, 'member');
    assert.deepEqual(res.data.access_permissions, ['view', 'console', 'files', 'power']);
  });

  it('bob has files access after grant', async () => {
    const res = await req('GET', `/api/servers/${ids.server}/files`, { token: tokens.bob });
    assert.equal(res.status, 200);
  });

  it('bob gets 403 for access management (no "access" perm)', async () => {
    const res = await req('GET', `/api/servers/${ids.server}/access`, { token: tokens.bob });
    assert.equal(res.status, 403);
  });

  it('admin can view access list', async () => {
    const res = await req('GET', `/api/servers/${ids.server}/access`, { token: tokens.admin });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data));
    const bobEntry = res.data.find(e => e.id === ids.bob);
    assert.ok(bobEntry, 'bob should be in access list');
    assert.equal(bobEntry.role, 'member');
  });

  it('admin can grant access permission to bob', async () => {
    const res = await req('POST', `/api/servers/${ids.server}/access`, {
      token: tokens.admin,
      body: { userId: ids.bob, role: 'member', permissions: ['view', 'console', 'files', 'power', 'access'] },
    });
    assert.equal(res.status, 201);
    assert.ok(res.data.entry.permissions.includes('access'));
  });

  it('bob can now view access list', async () => {
    const res = await req('GET', `/api/servers/${ids.server}/access`, { token: tokens.bob });
    assert.equal(res.status, 200);
  });

  it('bob can grant access to a new user', async () => {
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('pass12345', 4);
    const ins = db().prepare(
      "INSERT INTO users (username, email, password, role) VALUES ('charlie', 'charlie@test.io', ?, 'user')"
    ).run(hash);
    const charlieId = ins.lastInsertRowid;

    const res = await req('POST', `/api/servers/${ids.server}/access`, {
      token: tokens.bob,
      body: { userId: charlieId, role: 'member', permissions: ['view'] },
    });
    assert.equal(res.status, 201);
    assert.equal(res.data.entry.role, 'member');
  });

  it('bob can update access permissions', async () => {
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('pass12345', 4);
    const ins = db().prepare(
      "INSERT INTO users (username, email, password, role) VALUES ('dave', 'dave@test.io', ?, 'user')"
    ).run(hash);
    const daveId = ins.lastInsertRowid;

    await req('POST', `/api/servers/${ids.server}/access`, {
      token: tokens.admin,
      body: { userId: daveId, role: 'member', permissions: ['view'] },
    });

    const res = await req('PUT', `/api/servers/${ids.server}/access/${daveId}`, {
      token: tokens.bob,
      body: { role: 'admin', permissions: ['view', 'files', 'access'] },
    });
    assert.equal(res.status, 200);
    assert.equal(res.data.entry.role, 'admin');
    assert.ok(res.data.entry.permissions.includes('access'));
  });

  it('bob can revoke access', async () => {
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('pass12345', 4);
    const ins = db().prepare(
      "INSERT INTO users (username, email, password, role) VALUES ('eve', 'eve@test.io', ?, 'user')"
    ).run(hash);
    const eveId = ins.lastInsertRowid;

    await req('POST', `/api/servers/${ids.server}/access`, {
      token: tokens.admin,
      body: { userId: eveId, role: 'member', permissions: ['view'] },
    });

    const res = await req('DELETE', `/api/servers/${ids.server}/access/${eveId}`, {
      token: tokens.bob,
    });
    assert.equal(res.status, 200);

    const check = await req('GET', `/api/servers/${ids.server}/access`, { token: tokens.admin });
    assert.ok(!check.data.find(e => e.id === eveId), 'eve should be removed');
  });

  it('unauthorized user cannot see server', async () => {
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('pass12345', 4);
    db().prepare(
      "INSERT INTO users (username, email, password, role) VALUES ('frank', 'frank@test.io', ?, 'user')"
    ).run(hash);
    const frankLogin = await req('POST', '/api/auth/login', { body: { username: 'frank', password: 'pass12345' } });
    const frankToken = frankLogin.data.token;

    const res = await req('GET', `/api/servers/${ids.server}`, { token: frankToken });
    assert.equal(res.status, 403);
  });
});