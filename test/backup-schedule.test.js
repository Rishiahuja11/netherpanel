const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { boot, req, shutdown, tokens, ids } = require('./helpers');

describe('Backups + Schedules', () => {
  before(async () => { await boot(); });
  after(async () => { await shutdown(); });

  it('GET /api/servers/:id/backups returns empty list initially', async () => {
    const res = await req('GET', `/api/servers/${ids.server}/backups`, { token: tokens.admin });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data));
    assert.equal(res.data.length, 0);
  });

  it('POST /api/servers/:id/backups creates a backup', async () => {
    const res = await req('POST', `/api/servers/${ids.server}/backups`, {
      token: tokens.admin,
      body: { name: 'test-backup' }
    });
    assert.equal(res.status, 201);
    assert.ok(res.data.id);
    assert.equal(res.data.name, 'test-backup');
  });

  it('GET /api/servers/:id/backups now returns the backup', async () => {
    const res = await req('GET', `/api/servers/${ids.server}/backups`, { token: tokens.admin });
    assert.equal(res.status, 200);
    assert.equal(res.data.length, 1);
    assert.equal(res.data[0].name, 'test-backup');
  });

  it('non-owner cannot delete backup without backups permission', async () => {
    const res = await req('DELETE', `/api/servers/${ids.server}/backups/1`, { token: tokens.bob });
    assert.equal(res.status, 403);
  });

  it('POST /api/servers/:id/schedules creates a schedule', async () => {
    const res = await req('POST', `/api/servers/${ids.server}/schedules`, {
      token: tokens.admin,
      body: { name: 'daily-restart', cron_expression: '0 4 * * *', action: 'restart' }
    });
    assert.equal(res.status, 201);
    assert.ok(res.data.id);
    assert.equal(res.data.name, 'daily-restart');
    assert.equal(res.data.action, 'restart');
  });

  it('POST /api/servers/:id/schedules validates cron', async () => {
    const res = await req('POST', `/api/servers/${ids.server}/schedules`, {
      token: tokens.admin,
      body: { name: 'bad-cron', cron_expression: 'invalid', action: 'restart' }
    });
    assert.equal(res.status, 400);
    assert.match(res.data.error, /cron/i);
  });

  it('POST /api/servers/:id/schedules validates action', async () => {
    const res = await req('POST', `/api/servers/${ids.server}/schedules`, {
      token: tokens.admin,
      body: { name: 'bad-action', cron_expression: '0 * * * *', action: 'explode' }
    });
    assert.equal(res.status, 400);
    assert.match(res.data.error, /action/i);
  });

  it('GET /api/servers/:id/schedules returns schedules', async () => {
    const res = await req('GET', `/api/servers/${ids.server}/schedules`, { token: tokens.admin });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data));
    assert.ok(res.data.length >= 1);
  });

  it('PUT /api/servers/:id/schedules/:sid updates a schedule', async () => {
    const list = await req('GET', `/api/servers/${ids.server}/schedules`, { token: tokens.admin });
    const sid = list.data[0].id;
    const res = await req('PUT', `/api/servers/${ids.server}/schedules/${sid}`, {
      token: tokens.admin,
      body: { name: 'renamed-schedule' }
    });
    assert.equal(res.status, 200);
    assert.equal(res.data.name, 'renamed-schedule');
  });

  it('DELETE /api/servers/:id/schedules/:sid deletes a schedule', async () => {
    const list = await req('GET', `/api/servers/${ids.server}/schedules`, { token: tokens.admin });
    const sid = list.data[0].id;
    const res = await req('DELETE', `/api/servers/${ids.server}/schedules/${sid}`, { token: tokens.admin });
    assert.equal(res.status, 200);
    assert.match(res.data.message, /deleted/i);
  });
});
