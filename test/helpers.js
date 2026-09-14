const os = require('os');
const path = require('path');
const fs = require('fs');

const tmpDir = path.join(os.tmpdir(), 'netherpanel-tests');
fs.mkdirSync(tmpDir, { recursive: true });

let base, httpServer, io, db;
const tokens = {};
const ids = {};

async function boot() {
  const testId = `${Date.now()}_${process.pid}_${Math.random().toString(36).slice(2, 6)}`;
  const testDir = path.join(tmpDir, testId);
  fs.mkdirSync(testDir, { recursive: true });

  process.env.NETHERPANEL_DB = path.join(testDir, 'netherpanel.db');
  process.env.NETHERPANEL_DATA_DIR = testDir;

  // Clear module cache for fresh singleton per file
  const freshModules = Object.keys(require.cache).filter(k =>
    k.includes('src/') || k.includes('database') || k.includes('SettingsService')
  );
  freshModules.forEach(k => delete require.cache[k]);

  const { createApp } = require('../src/app');
  const app = await createApp();
  httpServer = app.httpServer;
  io = app.io;
  db = app.db;

  await new Promise(resolve => httpServer.listen(0, resolve));
  base = `http://127.0.0.1:${httpServer.address().port}`;

  const bcrypt = require('bcryptjs');
  const adminHash = bcrypt.hashSync('admin123', 4);
  const bobHash = bcrypt.hashSync('bob12345', 4);

  const adminResult = db.prepare(
    "INSERT INTO users (username, email, password, role) VALUES ('admin', 'admin@test.io', ?, 'admin')"
  ).run(adminHash);
  ids.admin = adminResult.lastInsertRowid;

  const bobResult = db.prepare(
    "INSERT INTO users (username, email, password, role) VALUES ('bob', 'bob@test.io', ?, 'user')"
  ).run(bobHash);
  ids.bob = bobResult.lastInsertRowid;

  const serverResult = db.prepare(
    `INSERT INTO servers (user_id, name, slug, version, server_type, game_type, port, ram_min, ram_max, path, status)
     VALUES (?, 'TestSrv', 'testsrv', '1.21.4', 'paper', 'java', 25566, 1024, 2048, ?, 'stopped')`
  ).run(ids.admin, path.join(testDir, 'servers', '1'));
  ids.server = serverResult.lastInsertRowid;

  db.prepare(
    "INSERT OR IGNORE INTO server_users (server_id, user_id, role, permissions) VALUES (?, ?, 'owner', 'all')"
  ).run(ids.server, ids.admin);

  db.prepare(
    "INSERT INTO server_users (server_id, user_id, role, permissions) VALUES (?, ?, 'member', 'view,console,files,power')"
  ).run(ids.server, ids.bob);

  await login('admin', 'admin123');
  await login('bob', 'bob12345');
}

async function login(username, password) {
  const res = await req('POST', '/api/auth/login', { body: { username, password } });
  tokens[username] = res.data.token;
}

async function req(method, url, { token, body, headers } = {}) {
  const headersObj = {};
  if (token) headersObj['Authorization'] = `Bearer ${token}`;
  if (body) headersObj['Content-Type'] = 'application/json';
  Object.assign(headersObj, headers || {});

  const response = await fetch(`${base}${url}`, {
    method,
    headers: headersObj,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  const ct = response.headers.get('content-type') || '';
  if (ct.includes('json')) {
    try { data = await response.json(); } catch {}
  }

  return { status: response.status, data, headers: response.headers };
}

async function shutdown() {
  if (io) try { io.close(); } catch {}
  if (httpServer) try { httpServer.close(); } catch {}
}

module.exports = { boot, login, req, shutdown, tokens, ids, base: () => base, db: () => db };