const { getDb } = require('../database');
const ServerService = require('./ServerService');
const fs = require('fs');
const path = require('path');

const monitorIntervals = new Map();

class CrashService {
  static getDb() {
    return getDb();
  }

  static logCrash(serverId, exitCode, signal, errorOutput) {
    const db = this.getDb();
    const logSnippet = this.getLogSnippet(serverId);

    db.prepare(
      'INSERT INTO crashes (server_id, exit_code, signal, error_output, log_snippet) VALUES (?, ?, ?, ?, ?)'
    ).run(serverId, exitCode, signal, errorOutput, logSnippet);
  }

  static getLogSnippet(serverId) {
    const serverDir = ServerService.getServerDir(serverId);
    const latestLog = path.join(serverDir, 'logs', 'latest.log');

    if (!fs.existsSync(latestLog)) {
      return null;
    }

    try {
      const content = fs.readFileSync(latestLog, 'utf8');
      const lines = content.split('\n');
      const lastLines = lines.slice(-100).join('\n');

      const crashPatterns = [
        /Exception in thread/i,
        /has crashed the server/i,
        /Server stopped/i,
        /FAILED TO STOP/i,
        /OutOfMemoryError/i,
        /StackOverflowError/i,
        /java\.lang\.\w+Exception/i,
        /java\.lang\.\w+Error/i,
        /Caused by:/i
      ];

      let crashLines = [];
      for (let i = lines.length - 1; i >= Math.max(0, lines.length - 200); i--) {
        const line = lines[i];
        const isCrashLine = crashPatterns.some(pattern => pattern.test(line));
        if (isCrashLine) {
          crashLines = lines.slice(Math.max(0, i - 10), Math.min(lines.length, i + 20));
          break;
        }
      }

      if (crashLines.length > 0) {
        return crashLines.join('\n');
      }

      return lastLines;
    } catch (err) {
      return null;
    }
  }

  static getCrashes(serverId, limit = 50) {
    const db = this.getDb();
    return db.prepare(
      'SELECT * FROM crashes WHERE server_id = ? ORDER BY detected_at DESC LIMIT ?'
    ).all(serverId, limit);
  }

  static getAllCrashes(limit = 100) {
    const db = this.getDb();
    return db.prepare(`
      SELECT c.*, s.name as server_name 
      FROM crashes c 
      LEFT JOIN servers s ON c.server_id = s.id 
      ORDER BY c.detected_at DESC 
      LIMIT ?
    `).all(limit);
  }

  static deleteCrash(id) {
    const db = this.getDb();
    const crash = db.prepare('SELECT * FROM crashes WHERE id = ?').get(id);
    if (!crash) {
      throw new Error('Crash report not found');
    }

    db.prepare('DELETE FROM crashes WHERE id = ?').run(id);
    return crash;
  }

  static deleteServerCrashes(serverId) {
    const db = this.getDb();
    db.prepare('DELETE FROM crashes WHERE server_id = ?').run(serverId);
  }

  static analyzeCrash(crashId) {
    const db = this.getDb();
    const crash = db.prepare('SELECT * FROM crashes WHERE id = ?').get(crashId);
    if (!crash) {
      throw new Error('Crash report not found');
    }

    const analysis = {
      id: crash.id,
      server_id: crash.server_id,
      exit_code: crash.exit_code,
      signal: crash.signal,
      detected_at: crash.detected_at,
      possible_causes: [],
      suggestions: []
    };

    if (crash.exit_code === 137 || crash.signal === 'SIGKILL') {
      analysis.possible_causes.push('Out of memory - Java heap space exhausted');
      analysis.possible_causes.push('Process was killed by the system (OOM killer)');
      analysis.suggestions.push('Increase RAM allocation in server settings');
      analysis.suggestions.push('Reduce view-distance and simulation-distance in server.properties');
      analysis.suggestions.push('Add -XX:+UseG1GC to Java arguments for better memory management');
    } else if (crash.exit_code === 1 || crash.signal === 'SIGTERM') {
      analysis.possible_causes.push('Java exception occurred');
      analysis.possible_causes.push('Server encountered a fatal error');
      analysis.suggestions.push('Check server logs for detailed error messages');
      analysis.suggestions.push('Verify server.jar is not corrupted');
      analysis.suggestions.push('Ensure Java version is compatible with server version');
    }

    if (crash.log_snippet) {
      if (crash.log_snippet.includes('OutOfMemoryError')) {
        analysis.possible_causes.push('Java OutOfMemoryError detected in logs');
        analysis.suggestions.push('Increase -Xmx value in Java arguments');
      }

      if (crash.log_snippet.includes('StackOverflowError')) {
        analysis.possible_causes.push('Stack overflow - likely caused by infinite loop in plugin');
        analysis.suggestions.push('Check recently installed plugins/mods');
        analysis.suggestions.push('Try running without plugins to isolate the issue');
      }

      if (crash.log_snippet.includes('Port already in use')) {
        analysis.possible_causes.push('Port conflict - another process is using the same port');
        analysis.suggestions.push('Change server port in server.properties');
        analysis.suggestions.push('Check if another server instance is running');
      }

      if (crash.log_snippet.includes('Corrupted') || crash.log_snippet.includes('corrupt')) {
        analysis.possible_causes.push('World data corruption detected');
        analysis.suggestions.push('Restore from a backup');
        analysis.suggestions.push('Try running with --forceUpgrade flag');
      }
    }

    if (analysis.possible_causes.length === 0) {
      analysis.possible_causes.push('Unknown cause - review full logs for details');
    }

    if (analysis.suggestions.length === 0) {
      analysis.suggestions.push('Check the full server logs for more information');
      analysis.suggestions.push('Try restarting the server');
    }

    return analysis;
  }

  static getCrashStats() {
    const db = this.getDb();
    const total = db.prepare('SELECT COUNT(*) as count FROM crashes').get().count;
    const byServer = db.prepare(
      'SELECT server_id, COUNT(*) as count FROM crashes GROUP BY server_id'
    ).all();
    const recent = db.prepare(
      "SELECT COUNT(*) as count FROM crashes WHERE detected_at > datetime('now', '-7 days')"
    ).get().count;

    return { total, byServer, recent };
  }

  static monitorServer(serverId) {
    if (monitorIntervals.has(serverId)) return;

    const server = ServerService.getServer(serverId);
    if (!server) return;

    const checkInterval = setInterval(() => {
      const currentServer = ServerService.getServer(serverId);
      if (!currentServer || currentServer.status === 'stopped') {
        clearInterval(checkInterval);
        monitorIntervals.delete(serverId);
        return;
      }

      if (currentServer.status === 'crashed') {
        clearInterval(checkInterval);
        monitorIntervals.delete(serverId);
        const crashes = this.getCrashes(serverId, 3);
        const recentCrashes = crashes.filter(c => {
          const d = new Date(String(c.detected_at).replace(' ', 'T') + 'Z');
          return (Date.now() - d.getTime()) < 300000;
        });

        if (recentCrashes.length < 3) {
          console.log(`[CrashService] Auto-restarting server ${serverId}...`);
          ServerService.startServer(serverId, currentServer.user_id, { silent: true }).then(() => {
            this.monitorServer(serverId);
          }).catch(err => {
            console.error(`[CrashService] Auto-restart failed for server ${serverId}:`, err.message);
            this.monitorServer(serverId);
          });
        } else {
          console.log(`[CrashService] Server ${serverId} crashed ${recentCrashes.length} times in 5 minutes, not auto-restarting`);
        }
      }
    }, 15000);
    monitorIntervals.set(serverId, checkInterval);
  }
}

module.exports = CrashService;
