const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { boot, req, shutdown, tokens, ids, db } = require('./helpers');

describe('Security + Resource Limits', () => {
  before(async () => { await boot(); });
  after(async () => { await shutdown(); });

  it('serves security headers on responses', async () => {
    const res = await req('GET', `/api/servers/${ids.server}`, { token: tokens.admin });
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.match(res.headers.get('referrer-policy'), /strict-origin/);
  });

  it('exposes quota settings via client config', async () => {
    const res = await req('GET', '/api/client/config', { token: tokens.admin });
    assert.equal(res.status, 200);
    assert.ok('ram_per_user' in res.data);
    assert.ok('max_servers_per_user' in res.data);
    assert.ok('resource_ram_limit' in res.data);
  });

  it('admin can round-trip quota settings', async () => {
    const body = {
      settings: [
        { key: 'ram_per_user', value: '5120', category: 'quota' },
        { key: 'max_servers_per_user', value: '2', category: 'quota' },
      ],
    };
    const res = await req('PUT', '/api/admin/settings', { token: tokens.admin, body });
    assert.equal(res.status, 200);

    const cfg = await req('GET', '/api/client/config', { token: tokens.admin });
    assert.equal(cfg.data.ram_per_user, 5120);
    assert.equal(cfg.data.max_servers_per_user, 2);
  });

  it('non-admin cannot update settings', async () => {
    const res = await req('PUT', '/api/admin/settings', {
      token: tokens.bob,
      body: { settings: [{ key: 'resource_ram_limit', value: '1', category: 'resource' }] },
    });
    assert.equal(res.status, 403);
  });

  it('validateResourceLimits rejects per-user over-quota', () => {
    const ServerService = require('../src/services/ServerService');
    const SettingsService = require('../src/services/SettingsService');
    const cap = Math.max(512, ServerService.systemRamMb() - 512);
    const quota = Math.floor(cap * 0.5);
    const overQuota = quota + 512;

    SettingsService.set('ram_per_user', String(quota), 'quota');
    SettingsService.invalidate();

    // within quota → ok
    ServerService.validateResourceLimits(512, 1024, ids.bob, db());
    // max > quota (but stays under device cap) → throws quota error
    assert.throws(() => ServerService.validateResourceLimits(512, overQuota, ids.bob, db()), /per-user quota/);
  });

  it('validateResourceLimits rejects combined servers exceeding quota', () => {
    const ServerService = require('../src/services/ServerService');
    const SettingsService = require('../src/services/SettingsService');
    SettingsService.set('ram_per_user', '2048', 'quota');
    SettingsService.invalidate();

    // give bob a server already using the whole quota
    db().prepare(
      "INSERT INTO servers (user_id, name, slug, version, server_type, game_type, port, ram_min, ram_max, path, status) VALUES (?, 'BobSrv', 'bobsrv', '1.21.4', 'paper', 'java', 25580, 1024, 2048, ?, 'stopped')"
    ).run(ids.bob, 'data/servers/bob');

    // any new server exceeds bob's remaining quota
    assert.throws(() => ServerService.validateResourceLimits(512, 512, ids.bob, db()), /exceeding your RAM quota/);
  });

  it('validateResourceLimits rejects ram < min or over device cap', () => {
    const ServerService = require('../src/services/ServerService');
    assert.throws(() => ServerService.validateResourceLimits(128, 512, ids.bob, db()), /at least 256/);
    assert.throws(() => ServerService.validateResourceLimits(1024, 10_000_000, ids.bob, db()), /exceeds the device/);
  });

  it('assertRamBudget rejects start over budget', () => {
    const ServerService = require('../src/services/ServerService');
    const SettingsService = require('../src/services/SettingsService');
    SettingsService.set('resource_ram_limit', '2048', 'resource');
    SettingsService.invalidate();

    db().prepare("UPDATE servers SET ram_max = 2048, status = 'running', pid = 999999 WHERE id = ?").run(ids.server);
    assert.throws(() => ServerService.assertRamBudget(2048), /RAM budget/);
  });

  it('createServer enforces max servers per user before download', async () => {
    const ServerService = require('../src/services/ServerService');
    const SettingsService = require('../src/services/SettingsService');
    SettingsService.set('max_servers_per_user', '1', 'quota');
    SettingsService.invalidate();

    // bob (or admin) already owns a server (TestSrv) → next create must fail
    await assert.rejects(
      () => ServerService.createServer(ids.admin, {
        name: 'QuotaTest',
        version: '1.21.4',
        serverType: 'paper',
        gameType: 'java',
        ramMin: 1024,
        ramMax: 2048,
      }),
      /Maximum server limit/
    );
  });
});