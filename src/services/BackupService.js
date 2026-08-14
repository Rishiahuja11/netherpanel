const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { createWriteStream } = require('fs');
const { getDb } = require('../database');
const ServerService = require('./ServerService');
const UserService = require('./UserService');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

fs.mkdirSync(BACKUPS_DIR, { recursive: true });

class BackupService {
  static getDb() {
    return getDb();
  }

  static getBackupDir(serverId) {
    const dir = path.join(BACKUPS_DIR, String(serverId));
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  static async createBackup(serverId, name, userId) {
    const server = ServerService.getServer(serverId);
    if (!server) {
      throw new Error('Server not found');
    }

    const backupName = name || `backup-${Date.now()}`;
    const filename = `${backupName}.zip`;
    const backupDir = this.getBackupDir(serverId);
    const backupPath = path.join(backupDir, filename);

    const serverDir = ServerService.getServerDir(serverId);

    return new Promise((resolve, reject) => {
      const output = createWriteStream(backupPath);
      const archive = archiver('zip', { zlib: { level: 6 } });

      output.on('error', reject);
      output.on('close', () => {
        const size = archive.pointer();
        const db = this.getDb();
        const result = db.prepare(
          'INSERT INTO backups (server_id, name, filename, size) VALUES (?, ?, ?, ?)'
        ).run(serverId, backupName, filename, size);

        UserService.logActivity(userId, 'backup_create', 'backup', result.lastInsertRowid, `Created backup "${backupName}"`);

        resolve({
          id: result.lastInsertRowid,
          name: backupName,
          filename,
          size,
          created_at: new Date().toISOString()
        });
      });

      archive.on('error', reject);
      archive.pipe(output);

      const excludeDirs = ['logs', 'cache', 'crash-reports'];
      const includeFiles = [
        'server.properties',
        'eula.txt',
        'banned-ips.json',
        'banned-players.json',
        'ops.json',
        'whitelist.json',
        'server.jar'
      ];

      for (const file of includeFiles) {
        const filePath = path.join(serverDir, file);
        if (fs.existsSync(filePath)) {
          archive.file(filePath, { name: file });
        }
      }

      const worldDirs = ['world', 'world_nether', 'world_the_end'];
      for (const dir of worldDirs) {
        const dirPath = path.join(serverDir, dir);
        if (fs.existsSync(dirPath)) {
          archive.directory(dirPath, dir);
        }
      }

      const pluginsDir = path.join(serverDir, 'plugins');
      if (fs.existsSync(pluginsDir)) {
        archive.directory(pluginsDir, 'plugins');
      }

      const modsDir = path.join(serverDir, 'mods');
      if (fs.existsSync(modsDir)) {
        archive.directory(modsDir, 'mods');
      }

      archive.finalize();
    });
  }

  static listBackups(serverId) {
    const db = this.getDb();
    return db.prepare(
      'SELECT * FROM backups WHERE server_id = ? ORDER BY created_at DESC'
    ).all(serverId);
  }

  static getBackup(id) {
    const db = this.getDb();
    return db.prepare('SELECT * FROM backups WHERE id = ?').get(id);
  }

  static deleteBackup(id, userId) {
    const db = this.getDb();
    const backup = this.getBackup(id);
    if (!backup) {
      throw new Error('Backup not found');
    }

    const backupDir = this.getBackupDir(backup.server_id);
    const backupPath = path.join(backupDir, backup.filename);

    if (fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath);
    }

    db.prepare('DELETE FROM backups WHERE id = ?').run(id);
    UserService.logActivity(userId, 'backup_delete', 'backup', id, `Deleted backup "${backup.name}"`);

    return backup;
  }

  static async restoreBackup(id, userId) {
    const backup = this.getBackup(id);
    if (!backup) {
      throw new Error('Backup not found');
    }

    const server = ServerService.getServer(backup.server_id);
    if (!server) {
      throw new Error('Server not found');
    }

    if (server.status === 'running') {
      throw new Error('Stop the server before restoring a backup');
    }

    const backupDir = this.getBackupDir(backup.server_id);
    const backupPath = path.join(backupDir, backup.filename);

    if (!fs.existsSync(backupPath)) {
      throw new Error('Backup file not found');
    }

    const serverDir = ServerService.getServerDir(backup.server_id);
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(backupPath);
    zip.extractAllTo(serverDir, true);

    UserService.logActivity(userId, 'backup_restore', 'backup', id, `Restored backup "${backup.name}"`);
    return backup;
  }

  static cleanupOldBackups(serverId) {
    const db = this.getDb();
    const retentionDays = parseInt(
      db.prepare("SELECT value FROM settings WHERE key = 'backup_retention_days'").get()?.value || '30'
    );

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const oldBackups = db.prepare(
      'SELECT * FROM backups WHERE server_id = ? AND created_at < ?'
    ).all(serverId, cutoffDate.toISOString());

    for (const backup of oldBackups) {
      const backupDir = this.getBackupDir(serverId);
      const backupPath = path.join(backupDir, backup.filename);
      if (fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath);
      }
    }

    db.prepare(
      'DELETE FROM backups WHERE server_id = ? AND created_at < ?'
    ).run(serverId, cutoffDate.toISOString());

    return oldBackups.length;
  }

  static getBackupStats() {
    const db = this.getDb();
    const total = db.prepare('SELECT COUNT(*) as count FROM backups').get().count;
    const totalSize = db.prepare('SELECT COALESCE(SUM(size), 0) as total FROM backups').get().total;
    const byServer = db.prepare(
      'SELECT server_id, COUNT(*) as count, COALESCE(SUM(size), 0) as total_size FROM backups GROUP BY server_id'
    ).all();

    return { total, totalSize, byServer };
  }
}

module.exports = BackupService;
