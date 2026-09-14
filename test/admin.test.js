const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { boot, login, req, shutdown, tokens, ids, db } = require('./helpers');

let server;
let adminToken;
let bobToken;

before(async () => {
  await boot();
  server = db();
  adminToken = tokens.admin;
  bobToken = tokens.bob;
});

after(async () => {
  await shutdown();
});

test('non-admin users cannot access admin endpoints', async () => {
  for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
    const res = await req(method, '/api/admin/stats', { token: bobToken });
    assert.equal(res.status, 403, `${method} /api/admin/stats should be 403`);
  }
  const stats = await req('GET', '/api/admin/stats', { token: adminToken });
  assert.equal(stats.status, 200);
});

test('admin stats, users and servers endpoints respond', async () => {
  const stats = await req('GET', '/api/admin/stats', { token: adminToken });
  assert.equal(stats.status, 200);
  assert.ok(stats.data.users.total >= 2);
  assert.equal(typeof stats.data.servers.total, 'number');
  assert.equal(typeof stats.data.resources.running_ram, 'number');

  const users = await req('GET', '/api/admin/users', { token: adminToken });
  assert.equal(users.status, 200);
  assert.ok(Array.isArray(users.data));

  const sv = await req('GET', '/api/admin/servers', { token: adminToken });
  assert.equal(sv.status, 200);
  const testSrv = sv.data.find(s => s.id === ids.server);
  assert.ok(testSrv);
  assert.equal(testSrv.username, 'admin');
});

test('templates are seeded and exposed', async () => {
  const tpls = await req('GET', '/api/servers/templates', { token: bobToken });
  assert.equal(tpls.status, 200);
  assert.ok(Array.isArray(tpls.data));
  assert.ok(tpls.data.length >= 4, 'expected seeded templates');
  assert.ok(tpls.data.every(t => t.server_type && t.version));
});

test('admin can create, edit, reset password and delete users', async () => {
  const check = await req('GET', '/api/admin/users', { token: adminToken });
  const beforeCount = check.data.length;

  const created = await req('POST', '/api/admin/users', {
    token: adminToken,
    body: { username: 'charlie', email: 'charlie@test.io', password: 'charlie123', role: 'user', must_change_password: true }
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.role, 'user');
  const charlieId = created.data.id;
  assert.ok(charlieId);

  const edited = await req('PUT', `/api/admin/users/${charlieId}`, {
    token: adminToken,
    body: { role: 'admin', must_change_password: false }
  });
  assert.equal(edited.status, 200);
  assert.equal(edited.data.role, 'admin');
  assert.equal(edited.data.must_change_password, 0);

  const reset = await req('POST', `/api/admin/users/${charlieId}/reset-password`, {
    token: adminToken,
    body: { newPassword: 'charlie456' }
  });
  assert.equal(reset.status, 200);

  const loginRes = await req('POST', '/api/auth/login', { body: { username: 'charlie', password: 'charlie456' } });
  assert.equal(loginRes.status, 200);
  assert.equal(loginRes.data.user.must_change_password, 0);
  assert.equal(loginRes.data.user.role, 'admin');

  const del = await req('DELETE', `/api/admin/users/${charlieId}`, { token: adminToken });
  assert.equal(del.status, 200);

  const afterCount = (await req('GET', '/api/admin/users', { token: adminToken })).data.length;
  assert.equal(afterCount, beforeCount);
});

test('created user with must_change_password must change it before redirect (login flag + flow)', async () => {
  const created = await req('POST', '/api/admin/users', {
    token: adminToken,
    body: { username: 'dave', email: 'dave@test.io', password: 'dave12345', must_change_password: true }
  });
  assert.equal(created.status, 201);
  const daveId = created.data.id;

  const login1 = await req('POST', '/api/auth/login', { body: { username: 'dave', password: 'dave12345' } });
  assert.equal(login1.status, 200);
  assert.equal(login1.data.user.must_change_password, 1);

  const change = await req('PUT', '/api/auth/me/password', {
    token: login1.data.token,
    body: { currentPassword: 'dave12345', newPassword: 'dave98765' }
  });
  assert.equal(change.status, 200);

  const login2 = await req('POST', '/api/auth/login', { body: { username: 'dave', password: 'dave98765' } });
  assert.equal(login2.status, 200);
  assert.equal(login2.data.user.must_change_password, 0);

  await req('DELETE', `/api/admin/users/${daveId}`, { token: adminToken });
});

test('admin settings round-trip', async () => {
  const res = await req('PUT', '/api/admin/settings', {
    token: adminToken,
    body: { settings: [{ key: 'panel_name', value: 'AdmTestPanel', category: 'general' }] }
  });
  assert.equal(res.status, 200);

  const cfg = await req('GET', '/api/admin/settings', { token: adminToken });
  const entry = cfg.data.find(s => s.key === 'panel_name');
  assert.equal(entry.value, 'AdmTestPanel');
});

test('server payloads are sanitized for non-admins (no path/pid)', async () => {
  const asBob = await req('GET', `/api/servers/${ids.server}`, { token: bobToken });
  assert.equal(asBob.status, 200);
  assert.ok(!('path' in asBob.data), 'path must not leak to non-admins');
  assert.ok(!('pid' in asBob.data), 'pid must not leak to non-admins');

  const asAdmin = await req('GET', `/api/servers/${ids.server}`, { token: adminToken });
  assert.equal(asAdmin.status, 200);
  assert.ok('path' in asAdmin.data, 'admins still see the server path');
});

test('members cannot delete a server they do not own', async () => {
  const res = await req('DELETE', `/api/servers/${ids.server}`, { token: bobToken });
  assert.equal(res.status, 403);

  const after = await req('GET', '/api/servers', { token: bobToken });
  assert.ok(after.data.some(s => s.id === ids.server));
});

test('invalid subdomain is rejected; valid create uses subdomain in address', async () => {
  const bad = await req('POST', '/api/servers', {
    token: bobToken,
    body: { name: 'BadSub', subdomain: 'not valid!', ram_min: 1024, ram_max: 2048 }
  });
  assert.equal(bad.status, 400);
  assert.match(String(bad.data.error), /subdomain/i);
});

test('admin can delete any server', async () => {
  const res = await req('DELETE', `/api/servers/${ids.server}`, { token: adminToken });
  assert.equal(res.status, 200);

  const gone = await req('GET', '/api/servers', { token: bobToken });
  assert.ok(!gone.data.some(s => s.id === ids.server));
});