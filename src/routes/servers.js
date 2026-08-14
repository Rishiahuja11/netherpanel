const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ServerService = require('../services/ServerService');
const BackupService = require('../services/BackupService');
const ScheduleService = require('../services/ScheduleService');
const ModService = require('../services/ModService');
const CrashService = require('../services/CrashService');
const PlayerService = require('../services/PlayerService');
const SystemInfoService = require('../services/SystemInfoService');
const { authenticateToken } = require('../middleware/auth');
const { getDb } = require('../database');

const upload = multer({ dest: path.join(__dirname, '../../data/tmp/uploads') });

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
      folia: { name: 'Folia', desc: 'Multithreaded regions for Paper' },
      spigot: { name: 'Spigot', desc: 'Modified server with plugin API' },
      purpur: { name: 'Purpur', desc: 'Enhanced Paper with extra features' },
      fabric: { name: 'Fabric', desc: 'Lightweight mod loader' },
      forge: { name: 'Forge', desc: 'Classic modding platform' },
      neoforge: { name: 'NeoForge', desc: 'Modern Forge fork, active dev' },
      quilt: { name: 'Quilt', desc: 'Fabric fork with extra features' },
      vanilla: { name: 'Vanilla', desc: 'Official Minecraft server' }
    },
    bedrock: {
      bedrock: { name: 'Bedrock Server', desc: 'Official Bedrock Dedicated Server' },
      pocketmine: { name: 'PocketMine-MP', desc: 'PHP-based Bedrock server software' },
      nukkit: { name: 'Nukkit', desc: 'Java-based Bedrock server software' },
      powernukkit: { name: 'PowerNukkit', desc: 'Enhanced Nukkit fork with extra features' }
    }
  });
});

router.get('/versions', async (req, res) => {
  try {
    const software = req.query.software || 'paper';
    let versions = [];
    switch (software.toLowerCase()) {
      case 'paper':
        versions = await ServerService.getPaperVersions();
        break;
      case 'folia':
        versions = await ServerService.getFoliaVersions();
        break;
      case 'purpur':
        versions = await ServerService.getPurpurVersions();
        break;
      case 'fabric':
        versions = await ServerService.getFabricVersions();
        break;
      case 'forge':
        versions = await ServerService.getForgeVersions();
        break;
      case 'neoforge':
        versions = await ServerService.getNeoForgeVersions();
        break;
      case 'quilt':
        versions = await ServerService.getQuiltVersions();
        break;
      case 'spigot':
        versions = await ServerService.getSpigotVersions();
        break;
      case 'vanilla':
        versions = await ServerService.getVanillaVersions();
        break;
      case 'bedrock':
        versions = await ServerService.getBedrockVersions();
        break;
      case 'pocketmine':
        versions = await ServerService.getPocketMineVersions();
        break;
      case 'nukkit':
        versions = await ServerService.getNukkitVersions();
        break;
      case 'powernukkit':
        versions = await ServerService.getPowerNukkitVersions();
        break;
      default:
        versions = await ServerService.getPaperVersions();
    }
    res.json(versions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/system/info', async (req, res) => {
  try {
    const info = await SystemInfoService.getSystemInfo();
    res.json(info);
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

router.get('/:id/properties', (req, res) => {
  try {
    const server = ServerService.getServer(parseInt(req.params.id));
    if (!server) return res.status(404).json({ error: 'Server not found' });
    if (server.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });

    const fs = require('fs');
    const path = require('path');
    const propsPath = path.join(ServerService.getServerDir(server.id), 'server.properties');
    if (!fs.existsSync(propsPath)) return res.json({});

    const content = fs.readFileSync(propsPath, 'utf8');
    const props = {};
    content.split('\n').forEach(line => {
      line = line.trim();
      if (!line || line.startsWith('#')) return;
      const idx = line.indexOf('=');
      if (idx > 0) props[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
    });
    res.json(props);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/properties', (req, res) => {
  try {
    const server = ServerService.getServer(parseInt(req.params.id));
    if (!server) return res.status(404).json({ error: 'Server not found' });
    if (server.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });

    const fs = require('fs');
    const pathMod = require('path');
    const serverDir = ServerService.getServerDir(server.id);
    const propsPath = pathMod.join(serverDir, 'server.properties');

    let lines = [];
    if (fs.existsSync(propsPath)) {
      lines = fs.readFileSync(propsPath, 'utf8').split('\n');
    }

    const updates = req.body;
    const updatedKeys = new Set();
    const newLines = [];

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) { newLines.push(line); return; }
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const key = trimmed.substring(0, idx).trim();
        if (key in updates) {
          newLines.push(`${key}=${updates[key]}`);
          updatedKeys.add(key);
        } else {
          newLines.push(line);
        }
      } else {
        newLines.push(line);
      }
    });

    Object.keys(updates).forEach(key => {
      if (!updatedKeys.has(key)) newLines.push(`${key}=${updates[key]}`);
    });

    fs.writeFileSync(propsPath, newLines.join('\n'), 'utf8');
    res.json({ message: 'Properties saved' });
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

router.get('/:id/backups/:backupId/download', (req, res) => {
  try {
    const server = ServerService.getServer(parseInt(req.params.id));
    if (!server) return res.status(404).json({ error: 'Server not found' });
    if (server.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });

    const db = getDb();
    const backup = db.prepare('SELECT * FROM backups WHERE id = ? AND server_id = ?').get(parseInt(req.params.backupId), server.id);
    if (!backup) return res.status(404).json({ error: 'Backup not found' });

    const backupDir = BackupService.getBackupDir(server.id);
    const filePath = path.join(backupDir, backup.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Backup file not found' });

    res.download(filePath, backup.filename);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/download', (req, res) => {
  try {
    const server = ServerService.getServer(parseInt(req.params.id));
    if (!server) return res.status(404).json({ error: 'Server not found' });
    if (server.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });

    const archiver = require('archiver');
    const serverDir = ServerService.getServerDir(server.id);
    if (!fs.existsSync(serverDir)) return res.status(404).json({ error: 'Server directory not found' });

    const filename = `${server.name.replace(/[^a-z0-9]/gi, '_')}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', err => res.status(500).json({ error: err.message }));
    archive.pipe(res);
    archive.directory(serverDir, false);
    archive.finalize();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/restore-upload', upload.single('file'), async (req, res) => {
  try {
    const server = ServerService.getServer(parseInt(req.params.id));
    if (!server) return res.status(404).json({ error: 'Server not found' });
    if (server.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const AdmZip = require('adm-zip');
    const serverDir = ServerService.getServerDir(server.id);
    const tmpPath = req.file.path;

    const zip = new AdmZip(tmpPath);
    zip.extractAllTo(serverDir, true);
    fs.unlinkSync(tmpPath);

    res.json({ message: 'Backup restored successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/files/upload', upload.array('files', 10), (req, res) => {
  try {
    const server = ServerService.getServer(parseInt(req.params.id));
    if (!server) return res.status(404).json({ error: 'Server not found' });
    if (server.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });

    const subPath = req.body.path || '';
    const serverDir = ServerService.getServerDir(server.id);
    const targetDir = path.resolve(path.join(serverDir, subPath));

    if (!targetDir.startsWith(path.resolve(serverDir) + path.sep) && targetDir !== path.resolve(serverDir)) return res.status(400).json({ error: 'Invalid path' });
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    const uploaded = [];
    if (req.files) {
      req.files.forEach(file => {
        const dest = path.join(targetDir, file.originalname);
        fs.copyFileSync(file.path, dest);
        fs.unlinkSync(file.path);
        uploaded.push(file.originalname);
      });
    }
    res.json({ message: `${uploaded.length} file(s) uploaded`, files: uploaded });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/:id/files/download', (req, res) => {
  try {
    const server = ServerService.getServer(parseInt(req.params.id));
    if (!server) return res.status(404).json({ error: 'Server not found' });
    if (server.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });

    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ error: 'File path is required' });

    const serverDir = ServerService.getServerDir(server.id);
    const fullPath = path.resolve(path.join(serverDir, filePath));
    if (!fullPath.startsWith(path.resolve(serverDir) + path.sep) && fullPath !== path.resolve(serverDir)) return res.status(400).json({ error: 'Invalid path' });
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File not found' });

    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) return res.status(400).json({ error: 'Cannot download directory' });

    res.download(fullPath, path.basename(fullPath));
  } catch (err) {
    res.status(500).json({ error: err.message });
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

router.get('/:id/mods/search', async (req, res) => {
  try {
    const server = ServerService.getServer(parseInt(req.params.id));
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { q, limit } = req.query;
    const results = await ModService.searchForServer(q || '', server.server_type, parseInt(limit) || 20);
    res.json(results);
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

    const { mod_id, version_id, source, name } = req.body;
    if (!mod_id) {
      return res.status(400).json({ error: 'Mod ID is required' });
    }

    const mod = await ModService.installMod(server.id, mod_id, version_id, req.user.id, source || 'modrinth', name || null);
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

// Player Management Routes

router.get('/:id/players/whitelist', async (req, res) => {
  try {
    const server = ServerService.getServer(parseInt(req.params.id));
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const whitelist = await PlayerService.getWhitelist(server.id);
    res.json({ players: whitelist });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/players/whitelist', async (req, res) => {
  try {
    const server = ServerService.getServer(parseInt(req.params.id));
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { player, player_name } = req.body;
    const playerName = player_name || player;
    if (!playerName) {
      return res.status(400).json({ error: 'Player name is required' });
    }

    await PlayerService.addToWhitelist(server.id, playerName, req.user.id);
    res.json({ success: true, message: `Added ${playerName} to whitelist` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id/players/whitelist', async (req, res) => {
  try {
    const server = ServerService.getServer(parseInt(req.params.id));
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { player, player_name } = req.body;
    const playerName = player_name || player;
    if (!playerName) {
      return res.status(400).json({ error: 'Player name is required' });
    }

    await PlayerService.removeFromWhitelist(server.id, playerName, req.user.id);
    res.json({ success: true, message: `Removed ${playerName} from whitelist` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/players/ops', async (req, res) => {
  try {
    const server = ServerService.getServer(parseInt(req.params.id));
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const ops = await PlayerService.getOps(server.id);
    res.json({ ops: ops });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/players/ops', async (req, res) => {
  try {
    const server = ServerService.getServer(parseInt(req.params.id));
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { player, player_name, level } = req.body;
    const playerName = player_name || player;
    if (!playerName) {
      return res.status(400).json({ error: 'Player name is required' });
    }

    await PlayerService.addOp(server.id, playerName, level || 4, req.user.id);
    res.json({ success: true, message: `Made ${playerName} an operator` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id/players/ops', async (req, res) => {
  try {
    const server = ServerService.getServer(parseInt(req.params.id));
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { player, player_name } = req.body;
    const playerName = player_name || player;
    if (!playerName) {
      return res.status(400).json({ error: 'Player name is required' });
    }

    await PlayerService.removeOp(server.id, playerName, req.user.id);
    res.json({ success: true, message: `Removed ${playerName} from operators` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/players/bans', async (req, res) => {
  try {
    const server = ServerService.getServer(parseInt(req.params.id));
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const bans = await PlayerService.getBannedPlayers(server.id);
    res.json({ bans: bans });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/players/bans', async (req, res) => {
  try {
    const server = ServerService.getServer(parseInt(req.params.id));
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { player, player_name, reason } = req.body;
    const playerName = player_name || player;
    if (!playerName) {
      return res.status(400).json({ error: 'Player name is required' });
    }

    await PlayerService.banPlayer(server.id, playerName, reason || '', req.user.id);
    res.json({ success: true, message: `Banned ${playerName}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id/players/bans', async (req, res) => {
  try {
    const server = ServerService.getServer(parseInt(req.params.id));
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { player, player_name } = req.body;
    const playerName = player_name || player;
    if (!playerName) {
      return res.status(400).json({ error: 'Player name is required' });
    }

    await PlayerService.unbanPlayer(server.id, playerName, req.user.id);
    res.json({ success: true, message: `Unbanned ${playerName}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/resources', async (req, res) => {
  try {
    const server = ServerService.getServer(parseInt(req.params.id));
    if (!server) return res.status(404).json({ error: 'Server not found' });
    if (server.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    
    const resources = await SystemInfoService.getServerResources(server.id);
    res.json(resources);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Server Logs Route

router.get('/:id/logs', (req, res) => {
  try {
    const server = ServerService.getServer(parseInt(req.params.id));
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const lines = parseInt(req.query.lines) || 200;
    const content = ServerService.readFile(server.id, 'logs/latest.log');
    const allLines = content.split('\n');
    const tail = allLines.slice(-lines).join('\n');
    res.json({ content: tail, total_lines: allLines.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
