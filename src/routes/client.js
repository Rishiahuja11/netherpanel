const express = require('express');
const router = express.Router();
const { getDb } = require('../database');
const ServerService = require('../services/ServerService');
const ModService = require('../services/ModService');
const SettingsService = require('../services/SettingsService');
const { optionalAuth } = require('../middleware/auth');

router.use(optionalAuth);

router.get('/', (req, res) => {
  const db = getDb();
  const panelName = db.prepare("SELECT value FROM settings WHERE key = 'panel_name'").get()?.value || 'NetherPanel';
  res.json({
    name: panelName,
    version: '1.0.0',
    status: 'online'
  });
});

router.get('/config', (req, res) => {
  try {
    const db = getDb();
    res.json({
      panel_name: db.prepare("SELECT value FROM settings WHERE key = 'panel_name'").get()?.value || 'NetherPanel',
      cloudflare_enabled: SettingsService.isCloudflareEnabled(),
      domain: SettingsService.getDomain(),
      resource_ram_limit: SettingsService.getRamLimit(),
      resource_cpu_limit: SettingsService.getCpuLimit()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/servers', (req, res) => {
  try {
    const db = getDb();
    let servers;

    if (req.user) {
      servers = ServerService.getUserServers(req.user.id);
    } else {
      servers = db.prepare(`
        SELECT id, name, slug, version, server_type, port, subdomain, status, created_at 
        FROM servers 
        ORDER BY created_at DESC 
        LIMIT 50
      `).all().map(s => ServerService.enrichServer(s));
    }

    servers.forEach(server => {
      server.is_running = ServerService.isRunning(server.id);
    });

    res.json(servers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/servers/:id', (req, res) => {
  try {
    const db = getDb();
    const server = ServerService.enrichServer(db.prepare(`
      SELECT id, name, slug, version, server_type, port, subdomain, status, created_at 
      FROM servers WHERE id = ?
    `).get(parseInt(req.params.id)));

    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    server.is_running = ServerService.isRunning(server.id);
    res.json(server);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/mods/search', async (req, res) => {
  try {
    const { query, limit, index } = req.query;
    const result = await ModService.searchMods(query, parseInt(limit) || 20, index);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/mods/:id', async (req, res) => {
  try {
    const mod = await ModService.getModDetails(req.params.id);
    res.json(mod);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/mods/:id/versions', async (req, res) => {
  try {
    const { game_version, loader } = req.query;
    const versions = await ModService.getModVersions(req.params.id, game_version, loader);
    res.json(versions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/versions', async (req, res) => {
  try {
    const versions = await ServerService.getPaperVersions();
    res.json(versions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/health', (req, res) => {
  try {
    const db = getDb();
    const dbHealthy = db.prepare('SELECT 1').get() ? true : false;
    res.json({
      status: dbHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      database: dbHealthy ? 'connected' : 'disconnected'
    });
  } catch (err) {
    res.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: err.message
    });
  }
});

module.exports = router;
