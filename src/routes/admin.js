const express = require('express');
const router = express.Router();
const UserService = require('../services/UserService');
const ServerService = require('../services/ServerService');
const BackupService = require('../services/BackupService');
const ScheduleService = require('../services/ScheduleService');
const ModService = require('../services/ModService');
const CrashService = require('../services/CrashService');
const CloudflareService = require('../services/CloudflareService');
const SettingsService = require('../services/SettingsService');
const { getDb } = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

router.use(authenticateToken);
router.use(requireAdmin);

router.get('/stats', (req, res) => {
  try {
    const db = getDb();
    const userStats = UserService.getStats();
    const serverStats = ServerService.getServerStats();
    const backupStats = BackupService.getBackupStats();
    const scheduleStats = ScheduleService.getScheduleStats();
    const modStats = ModService.getModStats();
    const crashStats = CrashService.getCrashStats();

    const totalRam = db.prepare('SELECT COALESCE(SUM(ram_max), 0) as total FROM servers WHERE status = ?').get('running').total;

    res.json({
      users: userStats,
      servers: serverStats,
      backups: backupStats,
      schedules: scheduleStats,
      mods: modStats,
      crashes: crashStats,
      resources: {
        running_ram: totalRam
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/users', (req, res) => {
  try {
    const users = UserService.getAll();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/users/:id', (req, res) => {
  try {
    const user = UserService.getById(parseInt(req.params.id));
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/users/:id', (req, res) => {
  try {
    const user = UserService.update(parseInt(req.params.id), req.body);
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/users/:id/reset-password', async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword) {
      return res.status(400).json({ error: 'New password is required' });
    }

    await UserService.resetPassword(parseInt(req.params.id), newPassword);
    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/users/:id', (req, res) => {
  try {
    const user = UserService.delete(parseInt(req.params.id));
    res.json({ message: 'User deleted', user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/servers', (req, res) => {
  try {
    const db = getDb();
    const servers = db.prepare(`
      SELECT s.*, u.username 
      FROM servers s 
      LEFT JOIN users u ON s.user_id = u.id 
      ORDER BY s.created_at DESC
    `).all();

    servers.forEach(server => {
      server.is_running = ServerService.isRunning(server.id);
    });

    res.json(servers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/schedules', (req, res) => {
  try {
    const schedules = ScheduleService.getAllSchedules();
    res.json(schedules);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/logs', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    const logs = UserService.getActivityLogs(limit, offset);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/crashes', (req, res) => {
  try {
    const crashes = CrashService.getAllCrashes();
    res.json(crashes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/crashes/:id/analyze', (req, res) => {
  try {
    const analysis = CrashService.analyzeCrash(parseInt(req.params.id));
    res.json(analysis);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/settings', (req, res) => {
  try {
    const db = getDb();
    const settings = db.prepare('SELECT * FROM settings ORDER BY category, key').all();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/settings', (req, res) => {
  try {
    const db = getDb();
    const { settings } = req.body;

    if (!settings || !Array.isArray(settings)) {
      return res.status(400).json({ error: 'Settings array is required' });
    }

    const updateStmt = db.prepare(
      'INSERT INTO settings (key, value, category) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP'
    );

    const transaction = db.transaction((items) => {
      for (const item of items) {
        updateStmt.run(item.key, item.value, item.category || 'general', item.value);
      }
    });

    transaction(settings);
    SettingsService.invalidate();

    res.json({ message: 'Settings updated' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/crashes/:id', (req, res) => {
  try {
    const crash = CrashService.deleteCrash(parseInt(req.params.id));
    res.json({ message: 'Crash report deleted', crash });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/cloudflare/test', async (req, res) => {
  try {
    const db = getDb();
    const cf = CloudflareService.fromSettings(db);
    if (!cf) {
      return res.status(400).json({ error: 'Cloudflare not configured. Save API token, Zone ID, and Server IP first.' });
    }
    const result = await cf.testConnection();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
