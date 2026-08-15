const express = require('express');
const path = require('path');
const { getDb } = require('../database');
const ServerService = require('../services/ServerService');
const ServerQueryService = require('../services/ServerQueryService');
const SystemInfoService = require('../services/SystemInfoService');
const SettingsService = require('../services/SettingsService');

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');

function publicProjection(server) {
  if (!server) return null;
  return {
    id: server.id,
    name: server.name,
    slug: server.slug,
    server_type: server.server_type,
    game_type: server.game_type,
    version: server.version,
    status: server.status,
    port: server.port,
    address: server.address,
    motd: server.motd,
    online_players: server.online_players,
    max_players: server.max_players,
    query_latency: server.query_latency,
    ram_max: server.ram_max,
    ram_used: server.ram_used,
    ram_percent: server.ram_percent,
    created_at: server.created_at
  };
}

async function buildResult(server) {
  const enriched = ServerService.enrichServer(server);
  const query = await ServerQueryService.query(enriched);
  const resources = enriched.status === 'running'
    ? await SystemInfoService.getServerResources(enriched.id).catch(() => null)
    : null;
  const ramBytes = resources && resources.memory ? resources.memory : null;
  const ramMaxBytes = (server.ram_max || 1024) * 1024 * 1024;
  return publicProjection({
    ...enriched,
    motd: query && query.motd,
    online_players: query ? query.playersOnline : 0,
    max_players: query ? query.playersMax : 0,
    query_latency: query && query.latency,
    ram_used: ramBytes,
    ram_percent: ramBytes ? Math.round((ramBytes / ramMaxBytes) * 100) : null
  });
}

const apiRouter = express.Router();

apiRouter.get('/status', async (req, res) => {
  try {
    const db = getDb();
    const servers = db.prepare('SELECT * FROM servers ORDER BY created_at ASC').all();
    const results = await Promise.all(servers.map(buildResult));
    res.json({
      panel_name: SettingsService.get('panel_name', 'NetherPanel'),
      updated_at: new Date().toISOString(),
      servers: results
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/status/:slug', async (req, res) => {
  try {
    const db = getDb();
    const server = db.prepare('SELECT * FROM servers WHERE slug = ?').get(req.params.slug);
    if (!server) return res.status(404).json({ error: 'Server not found' });
    res.json(await buildResult(server));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const pageRouter = express.Router();

pageRouter.get('/status', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'status.html'));
});

pageRouter.get('/s/:slug', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'share.html'));
});

module.exports = { apiRouter, pageRouter };
