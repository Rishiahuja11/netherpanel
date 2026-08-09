const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { getDb } = require('../database');
const UserService = require('./UserService');

const DATA_DIR = path.join(process.env.HOME || '/data/data/com.termux/files/home/panel', 'data');
const SERVERS_DIR = path.join(DATA_DIR, 'servers');
const JAVA_PATH = '/usr/bin/java';

const PAPER_API = 'https://api.papermc.io/v2/projects/paper';
const PURPUR_API = 'https://api.purpurmc.org/v2/purpur';
const FABRIC_API = 'https://meta.fabricmc.net/v2/versions';
const BEDROCK_API = 'https://api.github.com/repos/BedrockServer/Bedrockserver/releases';

const SERVER_TYPES = {
  java: {
    paper: { name: 'Paper', desc: 'High performance, plugin support', loader: 'paper' },
    spigot: { name: 'Spigot', desc: 'Modified server with plugin API', loader: 'spigot' },
    purpur: { name: 'Purpur', desc: 'Enhanced Paper with extra features', loader: 'purpur' },
    fabric: { name: 'Fabric', desc: 'Lightweight mod loader', loader: 'fabric' },
    forge: { name: 'Forge', desc: 'Classic modding platform', loader: 'forge' },
    vanilla: { name: 'Vanilla', desc: 'Official Minecraft server', loader: 'vanilla' }
  },
  bedrock: {
    pocketmine: { name: 'PocketMine-MP', desc: 'PHP-based Bedrock server software', loader: 'pocketmine' },
    nukkit: { name: 'Nukkit', desc: 'Java-based Bedrock server software', loader: 'nukkit' },
    bedrock: { name: 'Bedrock Server', desc: 'Official Bedrock Dedicated Server', loader: 'bedrock' }
  }
};

const serverProcesses = new Map();
const consoleBuffers = new Map();

class ServerService {
  static SERVER_TYPES = SERVER_TYPES;

  static getDb() {
    return getDb();
  }

  static getServerDir(serverId) {
    return path.join(SERVERS_DIR, String(serverId));
  }

  static async createServer(userId, data) {
    const db = this.getDb();
    const { name, version = '1.21.4', serverType = 'paper', gameType = 'java', port = 25565, ramMin = 1024, ramMax = 2048, subdomain = null } = data;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const existing = db.prepare('SELECT id FROM servers WHERE slug = ?').get(slug);
    if (existing) {
      throw new Error('Server with this name already exists');
    }

    const userServers = db.prepare('SELECT COUNT(*) as count FROM servers WHERE user_id = ?').get(userId).count;
    const maxServers = parseInt(db.prepare("SELECT value FROM settings WHERE key = 'max_servers_per_user'").get()?.value || '5');
    if (userServers >= maxServers) {
      throw new Error(`Maximum server limit (${maxServers}) reached`);
    }

    const defaultPort = gameType === 'bedrock' ? 19132 : 25565;
    const actualPort = port || defaultPort;

    const result = db.prepare(
      'INSERT INTO servers (user_id, name, slug, version, server_type, game_type, port, ram_min, ram_max, path, subdomain) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(userId, name, slug, version, serverType, gameType, actualPort, ramMin, ramMax, '', subdomain || null);

    const serverId = result.lastInsertRowid;
    const serverDir = this.getServerDir(serverId);
    fs.mkdirSync(serverDir, { recursive: true });

    db.prepare('UPDATE servers SET path = ? WHERE id = ?').run(serverDir, serverId);

    await this.downloadServerSoftware(serverId, serverType, gameType, version, serverDir);

    const eulaContent = `eula=true\n`;
    fs.writeFileSync(path.join(serverDir, 'eula.txt'), eulaContent);

    const propsContent = [
      `server-port=${actualPort}`,
      `motd=${name}`,
      `level-name=world`,
      `online-mode=true`,
      `max-players=20`,
      `view-distance=10`,
      `simulation-distance=10`
    ].join('\n');
    fs.writeFileSync(path.join(serverDir, 'server.properties'), propsContent);

    UserService.logActivity(userId, 'create_server', 'server', serverId, `Created server "${name}" (${serverType} ${version})`);

    return this.getServer(serverId);
  }

  static async downloadServerSoftware(serverId, serverType, gameType, version, serverDir) {
    if (gameType === 'bedrock') {
      return this.downloadBedrockServer(serverId, serverType, version, serverDir);
    }
    return this.downloadJavaServer(serverId, serverType, version, serverDir);
  }

  static async downloadJavaServer(serverId, serverType, version, serverDir) {
    const jarPath = path.join(serverDir, 'server.jar');
    if (fs.existsSync(jarPath)) return jarPath;

    if (serverType === 'paper') {
      return this.downloadFromPaperApi(serverId, version, serverDir);
    } else if (serverType === 'purpur') {
      return this.downloadFromPurpurApi(serverId, version, serverDir);
    } else {
      return this.downloadFromPaperApi(serverId, version, serverDir);
    }
  }

  static async downloadFromPaperApi(serverId, version, serverDir) {
    const jarPath = path.join(serverDir, 'server.jar');
    if (fs.existsSync(jarPath)) return jarPath;

    return new Promise((resolve, reject) => {
      const apiUrl = `${PAPER_API}/versions/${version}/builds`;
      https.get(apiUrl, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const builds = JSON.parse(data);
            if (!builds.builds || builds.builds.length === 0) {
              throw new Error(`No builds found for version ${version}`);
            }
            const latestBuild = builds.builds[builds.builds.length - 1];
            const downloadUrl = `${PAPER_API}/versions/${version}/builds/${latestBuild.build}/downloads/paper-${version}-${latestBuild.build}.jar`;
            this.downloadFileTo(downloadUrl, jarPath).then(() => resolve(jarPath)).catch(reject);
          } catch (err) { reject(err); }
        });
      }).on('error', reject);
    });
  }

  static async downloadFromPurpurApi(serverId, version, serverDir) {
    const jarPath = path.join(serverDir, 'server.jar');
    if (fs.existsSync(jarPath)) return jarPath;

    return new Promise((resolve, reject) => {
      const apiUrl = `${PURPUR_API}/versions/${version}`;
      https.get(apiUrl, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const info = JSON.parse(data);
            const latestBuild = info.builds?.latest || '1';
            const downloadUrl = `${PURPUR_API}/versions/${version}/builds/${latestBuild}/download`;
            this.downloadFileTo(downloadUrl, jarPath).then(() => resolve(jarPath)).catch(reject);
          } catch (err) { reject(err); }
        });
      }).on('error', reject);
    });
  }

  static async downloadBedrockServer(serverId, serverType, version, serverDir) {
    const exePath = path.join(serverDir, 'bedrock_server');
    const zipPath = path.join(serverDir, 'bedrock_server.zip');

    if (fs.existsSync(exePath)) return exePath;

    const downloadUrl = 'https://www.minecraft.net/bedrockdedicatedserver/bin-linux/bedrock-server.zip';

    return new Promise((resolve, reject) => {
      this.downloadFileTo(downloadUrl, zipPath).then(() => {
        try {
          const AdmZip = require('adm-zip');
          const zip = new AdmZip(zipPath);
          zip.extractAllTo(serverDir, true);
          fs.unlinkSync(zipPath);
          resolve(exePath);
        } catch (err) {
          reject(err);
        }
      }).catch(reject);
    });
  }

  static async downloadFileTo(url, destPath) {
    return new Promise((resolve, reject) => {
      const followRedirect = (downloadUrl) => {
        https.get(downloadUrl, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            followRedirect(res.headers.location);
            return;
          }
          const file = fs.createWriteStream(destPath);
          res.pipe(file);
          file.on('finish', () => { file.close(); resolve(); });
        }).on('error', reject);
      };
      followRedirect(url);
    });
  }

  static getServer(id) {
    const db = this.getDb();
    return db.prepare('SELECT * FROM servers WHERE id = ?').get(id);
  }

  static getUserServers(userId) {
    const db = this.getDb();
    return db.prepare('SELECT * FROM servers WHERE user_id = ? ORDER BY created_at DESC').all(userId);
  }

  static async startServer(serverId, userId) {
    const db = this.getDb();
    const server = this.getServer(serverId);
    if (!server) {
      throw new Error('Server not found');
    }

    if (server.status === 'running' && server.pid) {
      try {
        process.kill(server.pid, 0);
        throw new Error('Server is already running');
      } catch (e) {
        db.prepare('UPDATE servers SET status = ?, pid = NULL WHERE id = ?').run('stopped', serverId);
      }
    }

    const serverDir = this.getServerDir(serverId);
    const isBedrock = server.game_type === 'bedrock';

    consoleBuffers.set(serverId, []);

    let child;
    if (isBedrock) {
      const exePath = path.join(serverDir, 'bedrock_server');
      if (!fs.existsSync(exePath)) {
        throw new Error('Bedrock server not found. Please reinstall server.');
      }
      child = spawn(exePath, [], {
        cwd: serverDir,
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } else {
      const jarPath = path.join(serverDir, 'server.jar');
      if (!fs.existsSync(jarPath)) {
        throw new Error('Server jar not found. Please reinstall server.');
      }
      const javaArgs = server.java_args || `-Xmx${server.ram_max}M -Xms${server.ram_min}M`;
      const args = javaArgs.split(' ').filter(a => a);
      args.push('-jar', jarPath, 'nogui');
      child = spawn(JAVA_PATH, args, {
        cwd: serverDir,
        stdio: ['pipe', 'pipe', 'pipe']
      });
    }

    serverProcesses.set(serverId, child);
    db.prepare('UPDATE servers SET status = ?, pid = ? WHERE id = ?').run('running', child.pid, serverId);

    const bufferConsole = (data) => {
      const line = data.toString();
      const buffer = consoleBuffers.get(serverId) || [];
      buffer.push({ timestamp: new Date().toISOString(), line });
      if (buffer.length > 1000) buffer.shift();
      consoleBuffers.set(serverId, buffer);
    };

    child.stdout.on('data', bufferConsole);
    child.stderr.on('data', bufferConsole);

    child.on('exit', (code, signal) => {
      serverProcesses.delete(serverId);
      db.prepare('UPDATE servers SET status = ?, pid = NULL WHERE id = ?').run('stopped', serverId);

      if (code !== 0 || signal) {
        this.logCrash(serverId, code, signal, bufferConsole.toString());
      }

      UserService.logActivity(userId, 'server_stop', 'server', serverId, `Server stopped (exit code: ${code})`);
    });

    child.on('error', (err) => {
      serverProcesses.delete(serverId);
      db.prepare('UPDATE servers SET status = ?, pid = NULL WHERE id = ?').run('crashed', serverId);
      this.logCrash(serverId, null, null, err.message);
    });

    UserService.logActivity(userId, 'server_start', 'server', serverId, 'Server started');
    return this.getServer(serverId);
  }

  static async stopServer(serverId, userId) {
    const db = this.getDb();
    const server = this.getServer(serverId);
    if (!server) {
      throw new Error('Server not found');
    }

    const proc = serverProcesses.get(serverId);
    if (proc) {
      proc.kill('SIGTERM');

      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          proc.kill('SIGKILL');
          resolve();
        }, 10000);

        proc.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }

    db.prepare('UPDATE servers SET status = ?, pid = NULL WHERE id = ?').run('stopped', serverId);
    serverProcesses.delete(serverId);

    UserService.logActivity(userId, 'server_stop', 'server', serverId, 'Server stopped');
    return this.getServer(serverId);
  }

  static async restartServer(serverId, userId) {
    await this.stopServer(serverId, userId);
    await new Promise(resolve => setTimeout(resolve, 1000));
    return this.startServer(serverId, userId);
  }

  static killServer(serverId, userId) {
    const db = this.getDb();
    const server = this.getServer(serverId);
    if (!server) {
      throw new Error('Server not found');
    }

    const proc = serverProcesses.get(serverId);
    if (proc) {
      proc.kill('SIGKILL');
    }

    db.prepare('UPDATE servers SET status = ?, pid = NULL WHERE id = ?').run('stopped', serverId);
    serverProcesses.delete(serverId);

    UserService.logActivity(userId, 'server_kill', 'server', serverId, 'Server force killed');
    return this.getServer(serverId);
  }

  static getConsole(serverId) {
    return consoleBuffers.get(serverId) || [];
  }

  static sendCommand(serverId, command, userId) {
    const proc = serverProcesses.get(serverId);
    if (!proc) {
      throw new Error('Server is not running');
    }

    proc.stdin.write(command + '\n');
    UserService.logActivity(userId, 'server_command', 'server', serverId, `Command: ${command}`);
    return true;
  }

  static updateServer(id, data) {
    const db = this.getDb();
    const fields = [];
    const values = [];

    Object.entries(data).forEach(([key, value]) => {
      if (['name', 'version', 'port', 'ram_min', 'ram_max', 'java_args'].includes(key)) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    });

    if (fields.length === 0) return this.getServer(id);

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    db.prepare(`UPDATE servers SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getServer(id);
  }

  static deleteServer(id, userId) {
    const db = this.getDb();
    const server = this.getServer(id);
    if (!server) {
      throw new Error('Server not found');
    }

    this.killServer(id, userId);

    const serverDir = this.getServerDir(id);
    if (fs.existsSync(serverDir)) {
      fs.rmSync(serverDir, { recursive: true, force: true });
    }

    db.prepare('DELETE FROM servers WHERE id = ?').run(id);
    UserService.logActivity(userId, 'delete_server', 'server', id, `Deleted server "${server.name}"`);

    return server;
  }

  static getFiles(serverId, subPath = '') {
    const serverDir = this.getServerDir(serverId);
    const targetDir = path.join(serverDir, subPath);

    if (!targetDir.startsWith(serverDir)) {
      throw new Error('Invalid path');
    }

    if (!fs.existsSync(targetDir)) {
      return [];
    }

    const items = fs.readdirSync(targetDir);
    return items.map(item => {
      const itemPath = path.join(targetDir, item);
      const stat = fs.statSync(itemPath);
      return {
        name: item,
        path: path.relative(serverDir, itemPath),
        isDirectory: stat.isDirectory(),
        size: stat.size,
        modified: stat.mtime,
        created: stat.birthtime
      };
    });
  }

  static readFile(serverId, filePath) {
    const serverDir = this.getServerDir(serverId);
    const fullPath = path.join(serverDir, filePath);

    if (!fullPath.startsWith(serverDir)) {
      throw new Error('Invalid path');
    }

    if (!fs.existsSync(fullPath)) {
      throw new Error('File not found');
    }

    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      throw new Error('Cannot read directory');
    }

    if (stat.size > 5 * 1024 * 1024) {
      throw new Error('File too large to read (>5MB)');
    }

    return fs.readFileSync(fullPath, 'utf8');
  }

  static writeFile(serverId, filePath, content) {
    const serverDir = this.getServerDir(serverId);
    const fullPath = path.join(serverDir, filePath);

    if (!fullPath.startsWith(serverDir)) {
      throw new Error('Invalid path');
    }

    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(fullPath, content, 'utf8');
    return true;
  }

  static deleteFile(serverId, filePath) {
    const serverDir = this.getServerDir(serverId);
    const fullPath = path.join(serverDir, filePath);

    if (!fullPath.startsWith(serverDir)) {
      throw new Error('Invalid path');
    }

    if (!fs.existsSync(fullPath)) {
      throw new Error('File not found');
    }

    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      fs.rmSync(fullPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(fullPath);
    }

    return true;
  }

  static renameFile(serverId, oldPath, newPath) {
    const serverDir = this.getServerDir(serverId);
    const fullOldPath = path.join(serverDir, oldPath);
    const fullNewPath = path.join(serverDir, newPath);

    if (!fullOldPath.startsWith(serverDir) || !fullNewPath.startsWith(serverDir)) {
      throw new Error('Invalid path');
    }

    if (!fs.existsSync(fullOldPath)) {
      throw new Error('File not found');
    }

    fs.renameSync(fullOldPath, fullNewPath);
    return true;
  }

  static mkdir(serverId, dirPath) {
    const serverDir = this.getServerDir(serverId);
    const fullPath = path.join(serverDir, dirPath);

    if (!fullPath.startsWith(serverDir)) {
      throw new Error('Invalid path');
    }

    fs.mkdirSync(fullPath, { recursive: true });
    return true;
  }

  static async getPaperVersions() {
    return new Promise((resolve, reject) => {
      https.get(PAPER_API, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const versions = JSON.parse(data);
            resolve(versions.versions || []);
          } catch (err) {
            reject(err);
          }
        });
      }).on('error', reject);
    });
  }

  static logCrash(serverId, exitCode, signal, errorOutput) {
    const db = this.getDb();
    db.prepare(
      'INSERT INTO crashes (server_id, exit_code, signal, error_output) VALUES (?, ?, ?, ?)'
    ).run(serverId, exitCode, signal, errorOutput);
  }

  static getCrashes(serverId) {
    const db = this.getDb();
    return db.prepare('SELECT * FROM crashes WHERE server_id = ? ORDER BY detected_at DESC LIMIT 50').all(serverId);
  }

  static getServerStats() {
    const db = this.getDb();
    const total = db.prepare('SELECT COUNT(*) as count FROM servers').get().count;
    const running = db.prepare("SELECT COUNT(*) as count FROM servers WHERE status = 'running'").get().count;
    const stopped = db.prepare("SELECT COUNT(*) as count FROM servers WHERE status = 'stopped'").get().count;
    const crashed = db.prepare("SELECT COUNT(*) as count FROM servers WHERE status = 'crashed'").get().count;

    return { total, running, stopped, crashed };
  }

  static isRunning(serverId) {
    const proc = serverProcesses.get(serverId);
    return proc && !proc.killed;
  }
}

module.exports = ServerService;
