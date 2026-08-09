const express = require('express');
const router = express.Router();
const ServerService = require('../services/ServerService');
const BackupService = require('../services/BackupService');
const ScheduleService = require('../services/ScheduleService');
const ModService = require('../services/ModService');
const CrashService = require('../services/CrashService');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

router.get('/', (req, res) => {
  try {
    const servers = ServerService.getUserServers(req.user.id);
    res.json(servers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/types', (req, res) => {
  res.json(ServerService.SERVER_TYPES || {
    java: {
      paper: { name: 'Paper', desc: 'High performance, plugin support' },
      spigot: { name: 'Spigot', desc: 'Modified server with plugin API' },
      purpur: { name: 'Purpur', desc: 'Enhanced Paper with extra features' },
      fabric: { name: 'Fabric', desc: 'Lightweight mod loader' },
      forge: { name: 'Forge', desc: 'Classic modding platform' },
      vanilla: { name: 'Vanilla', desc: 'Official Minecraft server' }
    },
    bedrock: {
      pocketmine: { name: 'PocketMine-MP', desc: 'PHP-based Bedrock server software' },
      nukkit: { name: 'Nukkit', desc: 'Java-based Bedrock server software' },
      bedrock: { name: 'Bedrock Server', desc: 'Official Bedrock Dedicated Server' }
    }
  });
});

router.get('/versions', async (req, res) => {
  try {
    const versions = await ServerService.getPaperVersions();
    res.json(versions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const server = ServerService.getServer(parseInt(req.params.id));
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    server.is_running = ServerService.isRunning(server.id);
    res.json(server);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, version, server_type, game_type, port, ram_min, ram_max, subdomain } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Server name is required' });
    }

    const server = await ServerService.createServer(req.user.id, {
      name,
      version,
      serverType: server_type,
      gameType: game_type || 'java',
      port,
      ramMin: ram_min,
      ramMax: ram_max,
      subdomain
    });

    res.status(201).json(server);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const server = ServerService.getServer(parseInt(req.params.id));
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updated = ServerService.updateServer(server.id, req.body);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const server = ServerService.getServer(parseInt(req.params.id));
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    ServerService.deleteServer(server.id, req.user.id);
    res.json({ message: 'Server deleted' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/start', async (req, res) => {
  try {
    const server = ServerService.getServer(parseInt(req.params.id));
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updated = await ServerService.startServer(server.id, req.user.id);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/stop', async (req, res) => {
  try {
    const server = ServerService.getServer(parseInt(req.params.id));
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updated = await ServerService.stopServer(server.id, req.user.id);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/restart', async (req, res) => {
  try {
    const server = ServerService.getServer(parseInt(req.params.id));
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updated = await ServerService.restartServer(server.id, req.user.id);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/kill', (req, res) => {
  try {
    const server = ServerService.getServer(parseInt(req.params.id));
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updated = ServerService.killServer(server.id, req.user.id);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/:id/console', (req, res) => {
  try {
    const server = ServerService.getServer(parseInt(req.params.id));
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const consoleOutput = ServerService.getConsole(server.id);
    res.json(consoleOutput);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/command', (req, res) => {
  try {
    const server = ServerService.getServer(parseInt(req.params.id));
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { command } = req.body;
    if (!command) {
      return res.status(400).json({ error: 'Command is required' });
    }

    ServerService.sendCommand(server.id, command, req.user.id);
    res.json({ message: 'Command sent' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/:id/files', (req, res) => {
  try {
    const server = ServerService.getServer(parseInt(req.params.id));
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const subPath = req.query.path || '';
    const files = ServerService.getFiles(server.id, subPath);
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/files/read', (req, res) => {
  try {
    const server = ServerService.getServer(parseInt(req.params.id));
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const filePath = req.query.path;
    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }

    const content = ServerService.readFile(server.id, filePath);
    res.json({ path: filePath, content });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id/files/write', (req, res) => {
  try {
    const server = ServerService.getServer(parseInt(req.params.id));
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { path: filePath, content } = req.body;
    if (!filePath || content === undefined) {
      return res.status(400).json({ error: 'Path and content are required' });
    }

    ServerService.writeFile(server.id, filePath, content);
    res.json({ message: 'File saved' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id/files', (req, res) => {
  try {
    const server = ServerService.getServer(parseInt(req.params.id));
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const filePath = req.body.path || req.query.path;
    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }

    ServerService.deleteFile(server.id, filePath);
    res.json({ message: 'File deleted' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id/files/rename', (req, res) => {
  try {
    const server = ServerService.getServer(parseInt(req.params.id));
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { oldPath, newPath } = req.body;
    if (!oldPath || !newPath) {
      return res.status(400).json({ error: 'Old path and new path are required' });
    }

    ServerService.renameFile(server.id, oldPath, newPath);
    res.json({ message: 'File renamed' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/files/mkdir', (req, res) => {
  try {
    const server = ServerService.getServer(parseInt(req.params.id));
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { path: dirPath } = req.body;
    if (!dirPath) {
      return res.status(400).json({ error: 'Directory path is required' });
    }

    ServerService.mkdir(server.id, dirPath);
    res.json({ message: 'Directory created' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/:id/backups', (req, res) => {
  try {
    const server = ServerService.getServer(parseInt(req.params.id));
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const backups = BackupService.listBackups(server.id);
    res.json(backups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/backups', async (req, res) => {
  try {
    const server = ServerService.getServer(parseInt(req.params.id));
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { name } = req.body;
    const backup = await BackupService.createBackup(server.id, name, req.user.id);
    res.status(201).json(backup);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id/backups/:backupId', (req, res) => {
  try {
    const server = ServerService.getServer(parseInt(req.params.id));
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    BackupService.deleteBackup(parseInt(req.params.backupId), req.user.id);
    res.json({ message: 'Backup deleted' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/backups/:backupId/restore', async (req, res) => {
  try {
    const server = ServerService.getServer(parseInt(req.params.id));
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const backup = await BackupService.restoreBackup(parseInt(req.params.backupId), req.user.id);
    res.json({ message: 'Backup restored', backup });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/:id/schedules', (req, res) => {
  try {
    const server = ServerService.getServer(parseInt(req.params.id));
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const schedules = ScheduleService.getSchedules(server.id);
    res.json(schedules);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/schedules', (req, res) => {
  try {
    const server = ServerService.getServer(parseInt(req.params.id));
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { name, cron_expression, action, command } = req.body;

    if (!name || !cron_expression || !action) {
      return res.status(400).json({ error: 'Name, cron expression, and action are required' });
    }

    const schedule = ScheduleService.createSchedule({
      server_id: server.id,
      name,
      cron_expression,
      action,
      command,
      user_id: req.user.id
    });

    res.status(201).json(schedule);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id/schedules/:scheduleId', (req, res) => {
  try {
    const server = ServerService.getServer(parseInt(req.params.id));
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const schedule = ScheduleService.updateSchedule(parseInt(req.params.scheduleId), req.body);
    res.json(schedule);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id/schedules/:scheduleId', (req, res) => {
  try {
    const server = ServerService.getServer(parseInt(req.params.id));
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    ScheduleService.deleteSchedule(parseInt(req.params.scheduleId), req.user.id);
    res.json({ message: 'Schedule deleted' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/schedules/:scheduleId/run', async (req, res) => {
  try {
    const server = ServerService.getServer(parseInt(req.params.id));
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await ScheduleService.runScheduleNow(parseInt(req.params.scheduleId), req.user.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/:id/mods', (req, res) => {
  try {
    const server = ServerService.getServer(parseInt(req.params.id));
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const mods = ModService.listMods(server.id);
    res.json(mods);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/mods/install', async (req, res) => {
  try {
    const server = ServerService.getServer(parseInt(req.params.id));
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { mod_id, version_id } = req.body;
    if (!mod_id) {
      return res.status(400).json({ error: 'Mod ID is required' });
    }

    const mod = await ModService.installMod(server.id, mod_id, version_id, req.user.id);
    res.status(201).json(mod);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id/mods/:modId', async (req, res) => {
  try {
    const server = ServerService.getServer(parseInt(req.params.id));
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    await ModService.removeMod(parseInt(req.params.modId), req.user.id);
    res.json({ message: 'Mod removed' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id/mods/:modId/toggle', (req, res) => {
  try {
    const server = ServerService.getServer(parseInt(req.params.id));
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { enabled } = req.body;
    const mod = ModService.toggleMod(parseInt(req.params.modId), enabled, req.user.id);
    res.json(mod);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/:id/crashes', (req, res) => {
  try {
    const server = ServerService.getServer(parseInt(req.params.id));
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const crashes = CrashService.getCrashes(server.id);
    res.json(crashes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/crashes/:crashId', (req, res) => {
  try {
    const server = ServerService.getServer(parseInt(req.params.id));
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const analysis = CrashService.analyzeCrash(parseInt(req.params.crashId));
    res.json(analysis);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
