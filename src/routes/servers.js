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
const NotificationService = require('../services/NotificationService');
const { authenticateToken } = require('../middleware/auth');
const { getDb } = require('../database');

const upload = multer({ dest: path.join(__dirname, '../../data/tmp/uploads') });

router.use(authenticateToken);

function requireScope(category) {
  return (req, res, next) => {
    if (!req.isApiToken) return next();
    if (req.tokenScopes.includes('all') || req.tokenScopes.includes(category)) return next();
    return res.status(403).json({ error: `API token scope '${category}' required for this action` });
  };
}

const scopeByPath = [
  [/\/start$/, 'control'],
  [/\/stop$/, 'control'],
  [/\/restart$/, 'control'],
  [/\/kill$/, 'control'],
  [/\/command$/, 'control'],
  [/\/files/, 'files'],
  [/\/properties/, 'files'],
  [/\/restore-upload/, 'files'],
  [/\/download/, 'files'],
  [/\/backups/, 'backups'],
  [/\/schedules/, 'schedules'],
  [/\/mods/, 'mods'],
  [/\/players/, 'players']
];

function tokenScopeGuard(req, res, next) {
  if (!req.isApiToken) return next();
  const hit = scopeByPath.find(([re]) => re.test(req.path));
  if (hit) return requireScope(hit[1])(req, res, next);
  return next();
}

router.use(tokenScopeGuard);

const SERVER_PERMISSIONS = ['view', 'console', 'files', 'config', 'power', 'backups', 'schedules', 'mods', 'players', 'access'];

function loadServer(req, res, next) {
  const server = ServerService.getServer(parseInt(req.params.id));
  if (!server) {
    return res.status(404).json({ error: 'Server not found' });
  }
  res.locals.server = server;
  next();
}

function requireServerAccess(required = []) {
  return (req, res, next) => {
    if (req.user.role === 'admin') return next();
    const server = res.locals.server;
    if (server.user_id === req.user.id) return next();
    const access = ServerService.getServerAccess(server.id, req.user.id);
    if (!access) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!ServerService.permissionGranted({ role: access.role, permissions: access.permissions }, required)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action' });
    }
    next();
  };
}

function requireServerOwnerOrAdmin(req, res, next) {
  if (req.user.role === 'admin') return next();
  const server = res.locals.server;
  if (server.user_id === req.user.id) return next();
  const access = ServerService.getServerAccess(server.id, req.user.id);
  if (access && (access.role === 'owner' || access.role === 'admin')) {
    return next();
  }
  return res.status(403).json({ error: 'Only the server owner or an administrator can delete this server' });
}

function projectForViewer(server, viewer) {
  return ServerService.sanitizeServer(server, viewer.role);
}

function requireAccessManager(req, res, next) {
  if (req.user.role === 'admin') return next();
  const server = res.locals.server;
  const access = server.user_id === req.user.id
    ? { role: 'owner' }
    : ServerService.getServerAccess(server.id, req.user.id);
  if (access && (access.role === 'owner' || access.role === 'admin' || (access.permissions || []).includes('access'))) {
    return next();
  }
  return res.status(403).json({ error: 'Only the server owner, an admin, or a user with the access permission can manage access' });
}

router.get('/', (req, res) => {
  try {
    const servers = ServerService.getUserServers(req.user.id);
    res.json(servers.map(s => projectForViewer(s, req.user)));
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

router.get('/templates', (req, res) => {
  try {
    const templates = ServerService.getAllTemplates();
    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/versions', async (req, res) => {
  try {
    const software = String(req.query.software || 'paper').toLowerCase();
    let versions = [];
    switch (software) {
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

router.get('/:id', loadServer, requireServerAccess(['view']), (req, res) => {
  try {
    const server = projectForViewer(res.locals.server, req.user);

    server.is_running = ServerService.isRunning(server.id);
    if (req.user.role === 'admin') {
      server.access_role = 'admin';
      server.access_permissions = ['all'];
    } else if (server.user_id === req.user.id) {
      server.access_role = 'owner';
      server.access_permissions = ['all'];
    } else {
      const access = ServerService.getServerAccess(server.id, req.user.id);
      if (access) {
        server.access_role = access.role;
        server.access_permissions = access.permissions;
      }
    }
    res.json(server);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, version, server_type, game_type, ram_min, ram_max, subdomain, java_args, template_id } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Server name is required' });
    }

    if (typeof name !== 'string' || name.length < 3 || name.length > 32) {
      return res.status(400).json({ error: 'Server name must be 3-32 characters' });
    }

    const server = await ServerService.createServer(req.user.id, {
      name,
      version,
      serverType: server_type,
      gameType: game_type || 'java',
      ramMin: ram_min,
      ramMax: ram_max,
      subdomain,
      javaArgs: java_args,
      templateId: template_id
    });

    NotificationService.notify('server_created', { server, userId: req.user.id });

    res.status(201).json(projectForViewer(server, req.user));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', loadServer, requireServerAccess(['config']), (req, res) => {
  try {
    const server = res.locals.server;

    const updated = ServerService.updateServer(server.id, req.body);
    res.json(projectForViewer(updated, req.user));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', loadServer, requireServerOwnerOrAdmin, (req, res) => {
  try {
    const server = res.locals.server;

    ServerService.deleteServer(server.id, req.user.id);
    res.json({ message: 'Server deleted' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/start', loadServer, requireServerAccess(['power']), async (req, res) => {
  try {
    const server = res.locals.server;

    const updated = await ServerService.startServer(server.id, req.user.id);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/stop', loadServer, requireServerAccess(['power']), async (req, res) => {
  try {
    const server = res.locals.server;

    const updated = await ServerService.stopServer(server.id, req.user.id);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/restart', loadServer, requireServerAccess(['power']), async (req, res) => {
  try {
    const server = res.locals.server;

    const updated = await ServerService.restartServer(server.id, req.user.id);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/kill', loadServer, requireServerAccess(['power']), (req, res) => {
  try {
    const server = res.locals.server;

    const updated = ServerService.killServer(server.id, req.user.id);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/:id/console', loadServer, requireServerAccess(['console']), (req, res) => {
  try {
    const server = res.locals.server;

    const consoleOutput = ServerService.getConsole(server.id);
    res.json(consoleOutput);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/command', loadServer, requireServerAccess(['console']), (req, res) => {
  try {
    const server = res.locals.server;

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

router.get('/:id/files', loadServer, requireServerAccess(['files']), (req, res) => {
  try {
    const server = res.locals.server;

    const subPath = req.query.path || '';
    const files = ServerService.getFiles(server.id, subPath);
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/files/read', loadServer, requireServerAccess(['files']), (req, res) => {
  try {
    const server = res.locals.server;

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

router.put('/:id/files/write', loadServer, requireServerAccess(['files']), (req, res) => {
  try {
    const server = res.locals.server;

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

router.delete('/:id/files', loadServer, requireServerAccess(['files']), (req, res) => {
  try {
    const server = res.locals.server;

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

router.put('/:id/files/rename', loadServer, requireServerAccess(['files']), (req, res) => {
  try {
    const server = res.locals.server;

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

router.post('/:id/files/mkdir', loadServer, requireServerAccess(['files']), (req, res) => {
  try {
    const server = res.locals.server;

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

router.get('/:id/properties', loadServer, requireServerAccess(['config']), (req, res) => {
  try {
    const server = res.locals.server;

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

router.put('/:id/properties', loadServer, requireServerAccess(['config']), (req, res) => {
  try {
    const server = res.locals.server;

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

router.get('/:id/backups', loadServer, requireServerAccess(['backups']), (req, res) => {
  try {
    const server = res.locals.server;

    const backups = BackupService.listBackups(server.id);
    res.json(backups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/backups', loadServer, requireServerAccess(['backups']), async (req, res) => {
  try {
    const server = res.locals.server;

    const { name } = req.body;
    const backup = await BackupService.createBackup(server.id, name, req.user.id);
    res.status(201).json(backup);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id/backups/:backupId', loadServer, requireServerAccess(['backups']), (req, res) => {
  try {
    const server = res.locals.server;

    BackupService.deleteBackup(parseInt(req.params.backupId), req.user.id, server.id);
    res.json({ message: 'Backup deleted' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/backups/:backupId/restore', loadServer, requireServerAccess(['backups']), async (req, res) => {
  try {
    const server = res.locals.server;

    const backup = await BackupService.restoreBackup(parseInt(req.params.backupId), req.user.id, server.id);
    res.json({ message: 'Backup restored', backup });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/:id/backups/:backupId/download', loadServer, requireServerAccess(['backups']), (req, res) => {
  try {
    const server = res.locals.server;

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

router.get('/:id/download', loadServer, requireServerAccess(['files']), (req, res) => {
  try {
    const server = res.locals.server;

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
    const server = res.locals.server;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const AdmZip = require('adm-zip');
    const serverDir = ServerService.getServerDir(server.id);
    const tmpPath = req.file.path;

    const zip = new AdmZip(tmpPath);
    const entries = zip.getEntries();
    const maxSize = 2 * 1024 * 1024 * 1024;
    let totalSize = 0;
    for (const entry of entries) {
      if (entry.entryName.includes('..')) {
        fs.unlinkSync(tmpPath);
        return res.status(400).json({ error: 'Backup contains an invalid path' });
      }
      totalSize += entry.header.size;
      if (totalSize > maxSize) {
        fs.unlinkSync(tmpPath);
        return res.status(400).json({ error: 'Backup is too large to restore' });
      }
    }

    zip.extractAllTo(serverDir, true);
    fs.unlinkSync(tmpPath);

    res.json({ message: 'Backup restored successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/files/upload', upload.array('files', 10), (req, res) => {
  try {
    const server = res.locals.server;

    const subPath = req.body.path || '';
    const serverDir = ServerService.getServerDir(server.id);
    const targetDir = path.resolve(path.join(serverDir, subPath));

    if (!targetDir.startsWith(path.resolve(serverDir) + path.sep) && targetDir !== path.resolve(serverDir)) return res.status(400).json({ error: 'Invalid path' });
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    const uploaded = [];
    if (req.files) {
      for (const file of req.files) {
        const safeName = path.basename(file.originalname || '');
        if (!safeName || safeName === '.' || safeName === '..' || safeName.includes('/') || safeName.includes('\\')) {
          throw new Error('Invalid file name');
        }
        const dest = path.join(targetDir, safeName);
        fs.copyFileSync(file.path, dest);
        fs.unlinkSync(file.path);
        uploaded.push(safeName);
      }
    }
    res.json({ message: `${uploaded.length} file(s) uploaded`, files: uploaded });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/:id/files/download', loadServer, requireServerAccess(['files']), (req, res) => {
  try {
    const server = res.locals.server;

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

router.get('/:id/schedules', loadServer, requireServerAccess(['schedules']), (req, res) => {
  try {
    const server = res.locals.server;

    const schedules = ScheduleService.getSchedules(server.id);
    res.json(schedules);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/schedules', loadServer, requireServerAccess(['schedules']), (req, res) => {
  try {
    const server = res.locals.server;

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

router.put('/:id/schedules/:scheduleId', loadServer, requireServerAccess(['schedules']), (req, res) => {
  try {
    const server = res.locals.server;

    const schedule = ScheduleService.updateSchedule(parseInt(req.params.scheduleId), req.body, server.id);
    res.json(schedule);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id/schedules/:scheduleId', loadServer, requireServerAccess(['schedules']), (req, res) => {
  try {
    const server = res.locals.server;

    ScheduleService.deleteSchedule(parseInt(req.params.scheduleId), req.user.id, server.id);
    res.json({ message: 'Schedule deleted' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/schedules/:scheduleId/run', loadServer, requireServerAccess(['schedules']), async (req, res) => {
  try {
    const server = res.locals.server;

    const result = await ScheduleService.runScheduleNow(parseInt(req.params.scheduleId), req.user.id, server.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/:id/mods', loadServer, requireServerAccess(['mods']), (req, res) => {
  try {
    const server = res.locals.server;

    const mods = ModService.listMods(server.id);
    res.json(mods);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/mods/search', loadServer, requireServerAccess(['mods']), async (req, res) => {
  try {
    const server = res.locals.server;

    const { q, limit } = req.query;
    const results = await ModService.searchForServer(q || '', server.server_type, parseInt(limit) || 20);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/mods/install', loadServer, requireServerAccess(['mods']), async (req, res) => {
  try {
    const server = res.locals.server;

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

router.delete('/:id/mods/:modId', loadServer, requireServerAccess(['mods']), async (req, res) => {
  try {
    const server = res.locals.server;

    await ModService.removeMod(parseInt(req.params.modId), req.user.id, server.id);
    res.json({ message: 'Mod removed' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id/mods/:modId/toggle', loadServer, requireServerAccess(['mods']), (req, res) => {
  try {
    const server = res.locals.server;

    const { enabled } = req.body;
    const mod = ModService.toggleMod(parseInt(req.params.modId), enabled, req.user.id, server.id);
    res.json(mod);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/:id/crashes', loadServer, requireServerAccess(['view']), (req, res) => {
  try {
    const server = res.locals.server;

    const crashes = CrashService.getCrashes(server.id);
    res.json(crashes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/crashes/:crashId', loadServer, requireServerAccess(['view']), (req, res) => {
  try {
    const server = res.locals.server;

    const analysis = CrashService.analyzeCrash(parseInt(req.params.crashId), server.id);
    res.json(analysis);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Player Management Routes

router.get('/:id/players/whitelist', loadServer, requireServerAccess(['players']), async (req, res) => {
  try {
    const server = res.locals.server;

    const whitelist = await PlayerService.getWhitelist(server.id);
    res.json({ players: whitelist });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/players/whitelist', loadServer, requireServerAccess(['players']), async (req, res) => {
  try {
    const server = res.locals.server;

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

router.delete('/:id/players/whitelist', loadServer, requireServerAccess(['players']), async (req, res) => {
  try {
    const server = res.locals.server;

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

router.get('/:id/players/ops', loadServer, requireServerAccess(['players']), async (req, res) => {
  try {
    const server = res.locals.server;

    const ops = await PlayerService.getOps(server.id);
    res.json({ ops: ops });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/players/ops', loadServer, requireServerAccess(['players']), async (req, res) => {
  try {
    const server = res.locals.server;

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

router.delete('/:id/players/ops', loadServer, requireServerAccess(['players']), async (req, res) => {
  try {
    const server = res.locals.server;

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

router.get('/:id/players/bans', loadServer, requireServerAccess(['players']), async (req, res) => {
  try {
    const server = res.locals.server;

    const bans = await PlayerService.getBannedPlayers(server.id);
    res.json({ bans: bans });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/players/bans', loadServer, requireServerAccess(['players']), async (req, res) => {
  try {
    const server = res.locals.server;

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

router.delete('/:id/players/bans', loadServer, requireServerAccess(['players']), async (req, res) => {
  try {
    const server = res.locals.server;

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

router.get('/:id/resources', loadServer, requireServerAccess(['view']), async (req, res) => {
  try {
    const server = res.locals.server;
    
    const resources = await SystemInfoService.getServerResources(server.id);
    res.json(resources);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Server Logs Route

router.get('/:id/logs', loadServer, requireServerAccess(['console']), (req, res) => {
  try {
    const server = res.locals.server;

    const lines = Math.min(parseInt(req.query.lines) || 200, 2000);
    const content = ServerService.readFile(server.id, 'logs/latest.log');
    const allLines = content.split('\n');
    const tail = allLines.slice(-lines).join('\n');
    res.json({ content: tail, total_lines: allLines.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/access', loadServer, requireAccessManager, (req, res) => {
  try {
    res.json(ServerService.getAccessList(res.locals.server.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/access', loadServer, requireAccessManager, (req, res) => {
  try {
    const { username, email, userId, role = 'member', permissions = ['view'] } = req.body;

    const db = getDb();
    let target = null;
    if (userId) {
      target = db.prepare('SELECT id, username FROM users WHERE id = ?').get(userId);
    } else if (username) {
      target = db.prepare('SELECT id, username FROM users WHERE LOWER(username) = LOWER(?)').get(username);
    } else if (email) {
      target = db.prepare('SELECT id, username FROM users WHERE LOWER(email) = LOWER(?)').get(email);
    }
    if (!target) return res.status(404).json({ error: 'User not found' });
    if ((target.id === req.user.id || res.locals.server.user_id === target.id) && role === 'owner') {
      return res.status(400).json({ error: 'Cannot grant owner role this way' });
    }

    const validRole = ['owner', 'admin', 'member'].includes(role) ? role : 'member';
    const validPerms = Array.isArray(permissions)
      ? permissions.filter(p => SERVER_PERMISSIONS.includes(p))
      : permissions === 'all' ? ['all'] : String(permissions).split(',').map(p => p.trim()).filter(p => SERVER_PERMISSIONS.includes(p));

    const entry = ServerService.grantAccess(res.locals.server.id, target.id, validRole, validPerms);
    res.status(201).json({ message: `Access granted to ${target.username}`, entry });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id/access/:userId', loadServer, requireAccessManager, (req, res) => {
  try {
    const { role, permissions } = req.body;
    if (role && !['admin', 'member'].includes(role)) {
      return res.status(400).json({ error: 'Role must be admin or member' });
    }
    let validPerms;
    if (permissions !== undefined) {
      validPerms = Array.isArray(permissions)
        ? ['all', ...SERVER_PERMISSIONS].filter(p => permissions.includes(p))
        : permissions === 'all' ? ['all'] : String(permissions).split(',').map(p => p.trim()).filter(p => SERVER_PERMISSIONS.includes(p));
    }
    const entry = ServerService.updateAccess(res.locals.server.id, parseInt(req.params.userId), {
      role,
      permissions: validPerms
    });
    res.json({ message: 'Access updated', entry });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id/access/:userId', loadServer, requireAccessManager, (req, res) => {
  try {
    ServerService.revokeAccess(res.locals.server.id, parseInt(req.params.userId));
    res.json({ message: 'Access revoked' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
