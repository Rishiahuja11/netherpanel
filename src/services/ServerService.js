const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const https = require('https');
const { getDb } = require('../database');
const UserService = require('./UserService');
const CloudflareService = require('./CloudflareService');
const SettingsService = require('./SettingsService');
const NotificationService = require('./NotificationService');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const SERVERS_DIR = path.join(DATA_DIR, 'servers');
const PROOT_DISTRO = 'ubuntu';
const JAVA_PATH = '/usr/lib/jvm/java-25-openjdk-arm64/bin/java';

const PAPER_API = 'https://fill.papermc.io/v3/projects/paper';
const FOLIA_API = 'https://fill.papermc.io/v3/projects/folia';
const PURPUR_API = 'https://api.purpurmc.org/v2/purpur';
const FABRIC_API = 'https://meta.fabricmc.net/v2/versions';
const QUILT_API = 'https://meta.quiltmc.org/v3/versions';
const NEOFORGE_MAVEN = 'https://maven.neoforged.net/releases/net/neoforged/neoforge';
const PMMP_PHP_URL = 'https://github.com/pmmp/PHP-Binaries/releases/download/pm5-php-8.2-latest/PHP-8.2-Android-arm64-PM5.tar.gz';

function sortVersionsDesc(versions) {
  return versions.sort((a, b) => {
    const pa = a.split(/[-.]/).filter(Boolean).map(x => parseInt(x) || 0);
    const pb = b.split(/[-.]/).filter(Boolean).map(x => parseInt(x) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const na = pa[i] || 0, nb = pb[i] || 0;
      if (na !== nb) return nb - na;
    }
    return 0;
  });
}

const SERVER_TYPES = {
  java: {
    paper: { name: 'Paper', desc: 'High performance, plugin support', loader: 'paper' },
    folia: { name: 'Folia', desc: 'Paper fork with multithreaded regions', loader: 'folia' },
    spigot: { name: 'Spigot', desc: 'Modified server with plugin API', loader: 'spigot' },
    purpur: { name: 'Purpur', desc: 'Enhanced Paper with extra features', loader: 'purpur' },
    fabric: { name: 'Fabric', desc: 'Lightweight mod loader', loader: 'fabric' },
    forge: { name: 'Forge', desc: 'Classic modding platform', loader: 'forge' },
    neoforge: { name: 'NeoForge', desc: 'Modern Forge fork, active development', loader: 'neoforge' },
    quilt: { name: 'Quilt', desc: 'Fabric fork with extra features', loader: 'quilt' },
    vanilla: { name: 'Vanilla', desc: 'Official Minecraft server', loader: 'vanilla' }
  },
  bedrock: {
    bedrock: { name: 'Bedrock Server', desc: 'Official Bedrock Dedicated Server', loader: 'bedrock' },
    pocketmine: { name: 'PocketMine-MP', desc: 'PHP-based Bedrock server with plugins', loader: 'pocketmine' },
    nukkit: { name: 'Nukkit', desc: 'Java-based Bedrock server software', loader: 'nukkit' },
    powernukkit: { name: 'PowerNukkit', desc: 'Enhanced Nukkit fork with extra features', loader: 'powernukkit' }
  }
};

const serverProcesses = new Map();
const consoleBuffers = new Map();
const intentionalStops = new Set();
const startingSet = new Set();

class ServerService {
  static SERVER_TYPES = SERVER_TYPES;
  static io = null;

  static setIo(ioInstance) {
    this.io = ioInstance;
  }

  static getDb() {
    return getDb();
  }

  static getServerDir(serverId) {
    return path.join(SERVERS_DIR, String(serverId));
  }

  static allocateRandomPort(gameType = 'java') {
    const db = this.getDb();
    const used = new Set(db.prepare('SELECT port FROM servers').all().map(r => r.port));

    const ranges = gameType === 'bedrock' ? [[19132, 19232]] : [[25565, 25765]];
    const candidates = [];
    for (const [lo, hi] of ranges) {
      for (let p = lo; p <= hi; p++) {
        if (!used.has(p)) candidates.push(p);
      }
    }

    if (candidates.length > 0) {
      return candidates[Math.floor(Math.random() * candidates.length)];
    }

    for (let i = 0; i < 1000; i++) {
      const p = 1024 + Math.floor(Math.random() * (65535 - 1024));
      if (!used.has(p)) return p;
    }
    throw new Error('No free port available');
  }

  static getAddress(server) {
    if (!server) return '';
    const cfEnabled = SettingsService.isCloudflareEnabled();
    if (cfEnabled && server.subdomain) {
      const base = `${server.subdomain}.${SettingsService.getDomain()}`;
      return (server.port === 25565 || server.port === 19132) ? base : `${base}:${server.port}`;
    }
    return `localhost:${server.port}`;
  }

  static enrichServer(server) {
    if (!server) return server;
    server.address = this.getAddress(server);
    server.cloudflare_enabled = SettingsService.isCloudflareEnabled();
    server.domain = SettingsService.getDomain();
    return server;
  }

  static async createServer(userId, data) {
    const db = this.getDb();
    const { name, version = '1.21.4', serverType = 'paper', gameType = 'java', ramMin = 1024, ramMax = 2048, subdomain = null } = data;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const existing = db.prepare('SELECT id FROM servers WHERE slug = ?').get(slug);
    if (existing) {
      throw new Error('Server with this name already exists');
    }

    if (subdomain) {
      const existingSub = db.prepare('SELECT id FROM servers WHERE subdomain = ?').get(subdomain);
      if (existingSub) {
        throw new Error('This subdomain is already in use');
      }
    }

    const userServers = db.prepare('SELECT COUNT(*) as count FROM servers WHERE user_id = ?').get(userId).count;
    const maxServers = parseInt(db.prepare("SELECT value FROM settings WHERE key = 'max_servers_per_user'").get()?.value || '5');
    if (userServers >= maxServers) {
      throw new Error(`Maximum server limit (${maxServers}) reached`);
    }

    const actualPort = this.allocateRandomPort(gameType);

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
      `server-portv6=${actualPort}`,
      `motd=${name}`,
      `level-name=world`,
      `online-mode=true`,
      `max-players=20`,
      `view-distance=10`,
      `simulation-distance=10`
    ].join('\n');
    fs.writeFileSync(path.join(serverDir, 'server.properties'), propsContent);

    UserService.logActivity(userId, 'create_server', 'server', serverId, `Created server "${name}" (${serverType} ${version})`);

    if (subdomain) {
      try {
        const cf = CloudflareService.fromSettings(db);
        if (cf) {
          const dns = await cf.createSubdomain(subdomain);
          if (dns.success) {
            console.log(`[Cloudflare] DNS record created: ${subdomain}.${cf.domain} -> ${cf.serverIp}`);
          } else {
            console.error('[Cloudflare] Failed to create DNS record:', dns);
          }
        }
      } catch (e) {
        console.error('[Cloudflare] Error creating DNS:', e.message);
      }
    }

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

    switch (serverType) {
      case 'paper':
        return this.downloadFromPapermcApi(serverId, version, serverDir, PAPER_API, 'Paper');
      case 'folia':
        return this.downloadFromPapermcApi(serverId, version, serverDir, FOLIA_API, 'Folia');
      case 'purpur':
        return this.downloadFromPurpurApi(serverId, version, serverDir);
      case 'fabric':
        return this.downloadFabricServer(version, serverDir);
      case 'forge':
        return this.downloadForgeServer(version, serverDir);
      case 'neoforge':
        return this.downloadNeoForgeServer(version, serverDir);
      case 'quilt':
        return this.downloadQuiltServer(version, serverDir);
      case 'spigot':
        return this.downloadFromPapermcApi(serverId, version, serverDir, PAPER_API, 'Paper');
      case 'vanilla':
        return this.downloadVanillaServer(version, serverDir);
      default:
        return this.downloadFromPapermcApi(serverId, version, serverDir, PAPER_API, 'Paper');
    }
  }

  static async downloadFabricServer(version, serverDir) {
    const jarPath = path.join(serverDir, 'server.jar');
    if (fs.existsSync(jarPath)) return jarPath;

    return new Promise((resolve, reject) => {
      https.get(`https://meta.fabricmc.net/v2/versions/loader/${version}`, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try {
            const loaders = JSON.parse(data);
            if (!loaders.length) return reject(new Error('No Fabric loader found for ' + version));
            const latest = loaders[0];
            const loaderVer = latest.loader.version;
            const installVer = latest.installer ? latest.installer.version : '1.0.1';
            const url = `https://meta.fabricmc.net/v2/versions/loader/${version}/${loaderVer}/${installVer}/server/jar`;
            this.downloadFileTo(url, jarPath).then(() => resolve(jarPath)).catch(reject);
          } catch (e) { reject(e); }
        });
      }).on('error', reject);
    });
  }

  static async downloadForgeServer(version, serverDir) {
    const jarPath = path.join(serverDir, 'server.jar');
    if (fs.existsSync(jarPath)) return jarPath;

    const installerUrl = `https://maven.minecraftforge.net/net/minecraftforge/forge/${version}-${version}/forge-${version}-${version}-installer.jar`;
    const installerPath = path.join(serverDir, 'forge-installer.jar');

    await this.downloadFileTo(installerUrl, installerPath);

    return new Promise((resolve, reject) => {
      const { exec } = require('child_process');
      const cmd = `proot-distro login ${PROOT_DISTRO} -- bash -c "cd '${serverDir}' && java -jar forge-installer.jar --installServer"`;
      exec(cmd, { cwd: serverDir, timeout: 300000 }, (err) => {
        if (err) {
          reject(new Error(`Forge installer failed: ${err.message}`));
          return;
        }
        const forgeJar = fs.readdirSync(serverDir).find(f => f.startsWith('forge-') && f.endsWith('.jar') && !f.includes('installer'));
        if (forgeJar) {
          fs.renameSync(path.join(serverDir, forgeJar), jarPath);
        }
        resolve(jarPath);
      });
    });
  }

  static async downloadNeoForgeServer(version, serverDir) {
    const jarPath = path.join(serverDir, 'server.jar');
    if (fs.existsSync(jarPath)) return jarPath;

    const installerUrl = `${NEOFORGE_MAVEN}/${version}/neoforge-${version}-installer.jar`;
    const installerPath = path.join(serverDir, 'neoforge-installer.jar');

    await this.downloadFileTo(installerUrl, installerPath);

    return new Promise((resolve, reject) => {
      const cmd = `proot-distro login ${PROOT_DISTRO} -- bash -c "cd '${serverDir}' && java -jar neoforge-installer.jar --installServer"`;
      exec(cmd, { cwd: serverDir, timeout: 300000 }, (err) => {
        if (err) {
          reject(new Error(`NeoForge installer failed: ${err.message}`));
          return;
        }
        const neoJar = fs.readdirSync(serverDir).find(f => f.startsWith('neoforge-') && f.endsWith('.jar') && !f.includes('installer'));
        if (neoJar) {
          fs.renameSync(path.join(serverDir, neoJar), jarPath);
        } else {
          const allJar = fs.readdirSync(serverDir).find(f => f.endsWith('.jar') && !f.includes('installer'));
          if (allJar) fs.renameSync(path.join(serverDir, allJar), jarPath);
        }
        resolve(jarPath);
      });
    });
  }

  static async downloadQuiltServer(version, serverDir) {
    const jarPath = path.join(serverDir, 'server.jar');
    if (fs.existsSync(jarPath)) return jarPath;

    return new Promise((resolve, reject) => {
      https.get(`${QUILT_API}/loader/${version}`, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try {
            const loaders = JSON.parse(data);
            if (!loaders.length) return reject(new Error('No Quilt loader found for ' + version));
            const latest = loaders[0];
            const loaderVer = latest.loader.version;
            const url = `https://meta.quiltmc.org/v3/versions/loader/${version}/${loaderVer}/server/jar`;
            this.downloadFileTo(url, jarPath).then(() => resolve(jarPath)).catch(reject);
          } catch (e) { reject(e); }
        });
      }).on('error', reject);
    });
  }

  static async downloadVanillaServer(version, serverDir) {
    const jarPath = path.join(serverDir, 'server.jar');
    if (fs.existsSync(jarPath)) return jarPath;

    const manifestUrl = 'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json';
    return new Promise((resolve, reject) => {
      https.get(manifestUrl, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const manifest = JSON.parse(data);
            const verInfo = manifest.versions.find(v => v.id === version);
            if (!verInfo) throw new Error(`Version ${version} not found in Mojang manifest`);
            https.get(verInfo.url, (res2) => {
              let data2 = '';
              res2.on('data', (chunk) => data2 += chunk);
              res2.on('end', () => {
                try {
                  const verData = JSON.parse(data2);
                  const serverUrl = verData.downloads?.server?.url;
                  if (!serverUrl) throw new Error(`No server download for ${version}`);
                  this.downloadFileTo(serverUrl, jarPath).then(() => resolve(jarPath)).catch(reject);
                } catch (e) { reject(e); }
              });
            }).on('error', reject);
          } catch (e) { reject(e); }
        });
      }).on('error', reject);
    });
  }

  static async downloadFromPapermcApi(serverId, version, serverDir, apiBase, label) {
    const jarPath = path.join(serverDir, 'server.jar');
    if (fs.existsSync(jarPath)) return jarPath;

    return new Promise((resolve, reject) => {
      const apiUrl = `${apiBase}/versions/${version}/builds/latest`;
      https.get(apiUrl, { headers: { 'User-Agent': 'NetherPanel/1.0' } }, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const build = JSON.parse(data);
            const dl = build.downloads && build.downloads['server:default'];
            if (!dl || !dl.url) {
              throw new Error(`No download found for ${label} version ${version}`);
            }
            this.downloadFileTo(dl.url, jarPath).then(() => resolve(jarPath)).catch(reject);
          } catch (err) { reject(err); }
        });
      }).on('error', reject);
    });
  }

  static async downloadFromPurpurApi(serverId, version, serverDir) {
    const jarPath = path.join(serverDir, 'server.jar');
    if (fs.existsSync(jarPath)) return jarPath;

    return new Promise((resolve, reject) => {
      const downloadUrl = `${PURPUR_API}/${version}/latest/download`;
      this.downloadFileTo(downloadUrl, jarPath).then(() => resolve(jarPath)).catch(reject);
    });
  }

  static async downloadBedrockServer(serverId, serverType, version, serverDir) {
    switch (serverType) {
      case 'pocketmine':
        return this.downloadPocketMineServer(version, serverDir);
      case 'powernukkit':
        return this.downloadPowerNukkitServer(version, serverDir);
      case 'nukkit':
        return this.downloadNukkitServer(version, serverDir);
      default:
        return this.downloadOfficialBedrockServer(version, serverDir);
    }
  }

  static async downloadOfficialBedrockServer(version, serverDir) {
    const exePath = path.join(serverDir, 'bedrock_server');
    const zipPath = path.join(serverDir, 'bedrock_server.zip');

    if (fs.existsSync(exePath)) return exePath;

    let downloadUrl;
    try {
      const versionsData = await new Promise((resolve, reject) => {
        https.get('https://raw.githubusercontent.com/kittizz/bedrock-server-downloads/main/bedrock-server-downloads.json', (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
        }).on('error', reject);
      });
      const release = versionsData.release?.[version];
      if (release?.linux?.url) {
        downloadUrl = release.linux.url;
      }
    } catch (e) {}

    if (!downloadUrl) {
      downloadUrl = 'https://www.minecraft.net/bedrockdedicatedserver/bin-linux/bedrock-server.zip';
    }

    return new Promise((resolve, reject) => {
      this.downloadFileTo(downloadUrl, zipPath).then(() => {
        try {
          const AdmZip = require('adm-zip');
          const zip = new AdmZip(zipPath);
          zip.extractAllTo(serverDir, true);
          fs.unlinkSync(zipPath);
          if (fs.existsSync(exePath)) {
            fs.chmodSync(exePath, 0o755);
          }
          resolve(exePath);
        } catch (err) {
          reject(err);
        }
      }).catch(reject);
    });
  }

  static async downloadPocketMineServer(version, serverDir) {
    const pharPath = path.join(serverDir, 'PocketMine-MP.phar');
    if (fs.existsSync(pharPath)) return pharPath;

    let downloadUrl;
    if (version && version !== 'latest') {
      downloadUrl = `https://github.com/pmmp/PocketMine-MP/releases/download/${version}/PocketMine-MP.phar`;
    } else {
      downloadUrl = 'https://github.com/pmmp/PocketMine-MP/releases/latest/download/PocketMine-MP.phar';
    }
    await this.downloadFileTo(downloadUrl, pharPath);
    await this.ensurePocketMinePhp();
    return pharPath;
  }

  static getPocketMinePhpDir() {
    return path.join(DATA_DIR, 'pmmpphp');
  }

  static getPocketMinePhpBin() {
    return path.join(this.getPocketMinePhpDir(), 'bin', 'php7', 'bin', 'php');
  }

  static async ensurePocketMinePhp() {
    const phpBin = this.getPocketMinePhpBin();
    if (fs.existsSync(phpBin)) return phpBin;

    const phpDir = this.getPocketMinePhpDir();
    fs.mkdirSync(phpDir, { recursive: true });

    const tarPath = path.join(phpDir, 'php.tar.gz');
    console.log('[PocketMine] Downloading PocketMine PHP runtime...');
    await this.downloadFileTo(PMMP_PHP_URL, tarPath);

    await new Promise((resolve, reject) => {
      exec(`tar -xzf "${tarPath}" -C "${phpDir}"`, (err) => {
        if (err) {
          fs.unlinkSync(tarPath);
          return reject(new Error(`Failed to extract PocketMine PHP: ${err.message}`));
        }
        fs.unlinkSync(tarPath);
        resolve();
      });
    });

    if (fs.existsSync(phpBin)) {
      fs.chmodSync(phpBin, 0o755);
    }
    console.log('[PocketMine] PocketMine PHP runtime ready');
    return phpBin;
  }

  static async downloadPowerNukkitServer(version, serverDir) {
    const jarPath = path.join(serverDir, 'server.jar');
    if (fs.existsSync(jarPath)) return jarPath;

    const dlVersion = String(version).replace(/^v/, '');
    const downloadUrl = `https://github.com/PowerNukkit/PowerNukkit/releases/download/${version}/powernukkit-${dlVersion}-shaded.jar`;
    await this.downloadFileTo(downloadUrl, jarPath);
    return jarPath;
  }

  static async downloadNukkitServer(version, serverDir) {
    const jarPath = path.join(serverDir, 'server.jar');
    if (fs.existsSync(jarPath)) return jarPath;

    const downloadUrl = `https://github.com/PowerNukkitX/PowerNukkitX/releases/download/${version}/powernukkitx.jar`;
    await this.downloadFileTo(downloadUrl, jarPath);
    return jarPath;
  }

  static async downloadFileTo(url, destPath) {
    return new Promise((resolve, reject) => {
      const followRedirect = (downloadUrl) => {
        https.get(downloadUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' } }, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303 || res.statusCode === 307 || res.statusCode === 308) {
            res.resume();
            followRedirect(new URL(res.headers.location, downloadUrl).toString());
            return;
          }
          if (res.statusCode !== 200) {
            res.resume();
            reject(new Error(`Download failed with status ${res.statusCode}`));
            return;
          }
          const file = fs.createWriteStream(destPath);
          res.pipe(file);
          file.on('finish', () => { file.close(); resolve(); });
          file.on('error', (err) => { fs.unlink(destPath, () => {}); reject(err); });
        }).on('error', reject);
      };
      followRedirect(url);
    });
  }

  static getServer(id) {
    const db = this.getDb();
    return this.enrichServer(db.prepare('SELECT * FROM servers WHERE id = ?').get(id));
  }

  static getUserServers(userId) {
    const db = this.getDb();
    return db.prepare('SELECT * FROM servers WHERE user_id = ? ORDER BY created_at DESC').all(userId).map(s => this.enrichServer(s));
  }

  static computeRamLimits(server, globalRam) {
    let max = server.ram_max || 1024;
    let min = server.ram_min || 512;
    if (globalRam > 0) {
      max = Math.min(max, globalRam);
      min = Math.min(min, max);
    }
    return { max, min };
  }

  static buildCpuPrefix(cpuLimit) {
    const raw = String(cpuLimit || '').trim();
    if (!raw) return '';
    let range;
    if (/^\d+$/.test(raw)) {
      const cores = Math.max(1, Math.min(parseInt(raw, 10), os.cpus().length));
      range = `0-${cores - 1}`;
    } else if (/^\d+-\d+$/.test(raw)) {
      range = raw;
    } else {
      return '';
    }
    return `taskset -c ${range} `;
  }

  static validateJavaArgs(raw) {
    if (!raw || !String(raw).trim()) return true;
    const tokens = String(raw).split(/\s+/).filter(Boolean);
    return tokens.length > 0 && tokens.every(t => /^-[A-Za-z0-9_.:+=%@-]+$/.test(t));
  }

  static sanitizeJavaArgs(raw) {
    if (!raw) return [];
    return String(raw).split(/\s+/).filter(t => /^-[A-Za-z0-9_.:+=%@-]+$/.test(t));
  }

  static async startServer(serverId, userId, opts = {}) {
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
        if (e.message === 'Server is already running') throw e;
        db.prepare('UPDATE servers SET status = ?, pid = NULL WHERE id = ?').run('stopped', serverId);
      }
    }

    if (startingSet.has(serverId)) {
      throw new Error('Server is already starting');
    }

    const serverDir = this.getServerDir(serverId);
    const isBedrock = server.game_type === 'bedrock';

    const globalRam = SettingsService.getRamLimit();
    const cpuPrefix = this.buildCpuPrefix(SettingsService.getCpuLimit());
    const { max: ramMax, min: ramMin } = this.computeRamLimits(server, globalRam);

    consoleBuffers.set(serverId, []);

    let child;
    if (isBedrock) {
      const serverType = server.server_type;
      if (serverType === 'pocketmine') {
        const pharPath = path.join(serverDir, 'PocketMine-MP.phar');
        if (!fs.existsSync(pharPath)) {
          throw new Error('PocketMine phar not found. Please reinstall server.');
        }
        startingSet.add(serverId);
        try {
          const phpBin = await this.ensurePocketMinePhp();
          const phpMemArg = globalRam > 0 ? ` -d memory_limit=${ramMax}M` : '';
          child = spawn('proot-distro', ['login', PROOT_DISTRO, '--', 'bash', '-c',
            `cd '${serverDir}' && ${cpuPrefix}'${phpBin}'${phpMemArg} PocketMine-MP.phar --no-wizard`], {
            cwd: serverDir,
            detached: true,
            stdio: ['pipe', 'pipe', 'pipe']
          });
        } catch (err) {
          startingSet.delete(serverId);
          throw err;
        }
      } else if (serverType === 'nukkit' || serverType === 'powernukkit') {
        const jarPath = path.join(serverDir, 'server.jar');
        if (!fs.existsSync(jarPath)) {
          throw new Error('Server jar not found. Please reinstall server.');
        }
        child = spawn('proot-distro', ['login', PROOT_DISTRO, '--', 'bash', '-c',
          `cd '${serverDir}' && ${cpuPrefix}${JAVA_PATH} -Xmx${ramMax}M -Xms${ramMin}M -jar server.jar nogui`], {
          cwd: serverDir,
          detached: true,
          stdio: ['pipe', 'pipe', 'pipe']
        });
      } else {
        const exePath = path.join(serverDir, 'bedrock_server');
        if (!fs.existsSync(exePath)) {
          throw new Error('Bedrock server not found. Please reinstall server.');
        }
        if (process.arch !== 'x64') {
          throw new Error(`Official Bedrock Dedicated Server only runs on x86_64 CPUs (this device is ${process.arch}). Please use PocketMine or Nukkit instead.`);
        }
        child = spawn(exePath, [], {
          cwd: serverDir,
          detached: true,
          stdio: ['pipe', 'pipe', 'pipe']
        });
      }
    } else {
      const jarPath = path.join(serverDir, 'server.jar');
      if (!fs.existsSync(jarPath)) {
        throw new Error('Server jar not found. Please reinstall server.');
      }
      const javaArgsRaw = server.java_args || `-Xmx${ramMax}M -Xms${ramMin}M`;
      let javaArgs = javaArgsRaw;
      if (globalRam > 0) {
        javaArgs = javaArgsRaw.replace(/-Xmx\S+/g, '').replace(/-Xms\S+/g, '').replace(/\s+/g, ' ').trim();
        javaArgs = `${javaArgs} -Xmx${ramMax}M -Xms${ramMin}M`.trim();
      }
      const args = this.sanitizeJavaArgs(javaArgs);
      args.push('-jar', 'server.jar', 'nogui');
      child = spawn('proot-distro', ['login', PROOT_DISTRO, '--', 'bash', '-c',
        `cd '${serverDir}' && ${cpuPrefix}${JAVA_PATH} ${args.join(' ')}`], {
        cwd: serverDir,
        detached: true,
        stdio: ['pipe', 'pipe', 'pipe']
      });
    }

    serverProcesses.set(serverId, child);
    startingSet.delete(serverId);
    db.prepare('UPDATE servers SET status = ?, pid = ? WHERE id = ?').run('running', child.pid, serverId);

    const bufferConsole = (data) => {
      const line = data.toString();
      const buffer = consoleBuffers.get(serverId) || [];
      const entry = { timestamp: new Date().toISOString(), line };
      buffer.push(entry);
      if (buffer.length > 1000) buffer.shift();
      consoleBuffers.set(serverId, buffer);
      if (this.io) {
        this.io.to(`console:${serverId}`).emit('console_line', { line: entry });
      }
    };

    child.stdout.on('data', bufferConsole);
    child.stderr.on('data', bufferConsole);

    child.on('exit', (code, signal) => {
      serverProcesses.delete(serverId);
      const intentional = intentionalStops.has(serverId);
      intentionalStops.delete(serverId);
      const crashed = !intentional && (code !== 0 || signal);

      db.prepare('UPDATE servers SET status = ?, pid = NULL WHERE id = ?').run(crashed ? 'crashed' : 'stopped', serverId);

      if (crashed) {
        const buffer = consoleBuffers.get(serverId) || [];
        const crashOutput = buffer.slice(-50).map(b => b.line).join('');
        this.logCrash(serverId, code, signal, crashOutput);
        UserService.logActivity(userId, 'server_crash', 'server', serverId, `Server crashed (exit code: ${code}, signal: ${signal})`);
        NotificationService.notify('server_crash', { server, code, signal, userId });
      } else {
        UserService.logActivity(userId, 'server_stop', 'server', serverId, `Server stopped (exit code: ${code})`);
        NotificationService.notify('server_stop', { server, userId });
      }
      consoleBuffers.delete(serverId);
    });

    child.on('error', (err) => {
      serverProcesses.delete(serverId);
      startingSet.delete(serverId);
      db.prepare('UPDATE servers SET status = ?, pid = NULL WHERE id = ?').run('crashed', serverId);
      this.logCrash(serverId, null, null, err.message);
    });

    UserService.logActivity(userId, 'server_start', 'server', serverId, 'Server started');
    if (!opts.silent) {
      NotificationService.notify('server_start', { server, userId });
    }
    return this.getServer(serverId);
  }

  static killProcessGroup(pid, signal) {
    try {
      process.kill(-pid, signal);
      return true;
    } catch (e) {
      try {
        process.kill(pid, signal);
        return true;
      } catch (e2) {
        return false;
      }
    }
  }

  static async stopServer(serverId, userId) {
    const db = this.getDb();
    const server = this.getServer(serverId);
    if (!server) {
      throw new Error('Server not found');
    }

    const proc = serverProcesses.get(serverId);
    if (proc) {
      intentionalStops.add(serverId);
      this.killProcessGroup(proc.pid, 'SIGTERM');

      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          this.killProcessGroup(proc.pid, 'SIGKILL');
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
      intentionalStops.add(serverId);
      this.killProcessGroup(proc.pid, 'SIGKILL');
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
    if (!command || typeof command !== 'string') {
      throw new Error('Invalid command');
    }
    const proc = serverProcesses.get(serverId);
    if (!proc || !proc.stdin || proc.stdin.destroyed || proc.stdin.writableEnded || proc.killed) {
      throw new Error('Server is not running');
    }
    proc.stdin.on('error', () => {});
    try {
      proc.stdin.write(command + '\n');
    } catch (e) {
      throw new Error('Server is not running');
    }
    UserService.logActivity(userId, 'server_command', 'server', serverId, `Command: ${command}`);
    return true;
  }

  static updateServer(id, data) {
    const db = this.getDb();

    if (data.subdomain) {
      const existingSub = db.prepare('SELECT id FROM servers WHERE subdomain = ? AND id != ?').get(data.subdomain, id);
      if (existingSub) {
        throw new Error('This subdomain is already in use');
      }
    }

    if (data.java_args !== undefined && !this.validateJavaArgs(data.java_args)) {
      throw new Error('java_args contains invalid characters. Only JVM flags like -Xmx2G, -Dkey=value, -XX:+UseG1GC are allowed.');
    }

    const fields = [];
    const values = [];

    Object.entries(data).forEach(([key, value]) => {
      if (['name', 'version', 'ram_min', 'ram_max', 'java_args', 'subdomain', 'startup_cmd'].includes(key)) {
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

    try {
      this.killServer(id, userId);
    } catch (e) {
      console.error(`[ServerService] Error killing server ${id}:`, e.message);
    }

    const serverDir = this.getServerDir(id);
    if (fs.existsSync(serverDir)) {
      fs.rmSync(serverDir, { recursive: true, force: true });
    }

    if (server.subdomain) {
      try {
        const cf = CloudflareService.fromSettings(db);
        if (cf) {
          cf.deleteSubdomain(server.subdomain).then(dns => {
            if (dns.success) console.log(`[Cloudflare] DNS record deleted: ${server.subdomain}.${cf.domain}`);
          }).catch(e => console.error('[Cloudflare] Error deleting DNS:', e.message));
        }
      } catch (e) {
        console.error('[Cloudflare] Error:', e.message);
      }
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
      https.get(PAPER_API, { headers: { 'User-Agent': 'NetherPanel/1.0' } }, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const versionsObj = json.versions || {};
            const allVersions = [];
            for (const group of Object.keys(versionsObj)) {
              for (const v of versionsObj[group]) {
                if (!v.includes('rc') && !v.includes('pre') && !v.includes('-dev')) {
                  allVersions.push(v);
                }
              }
            }
            resolve(sortVersionsDesc(allVersions));
          } catch (err) {
            reject(err);
          }
        });
      }).on('error', reject);
    });
  }

  static async getPurpurVersions() {
    return new Promise((resolve, reject) => {
      https.get(`${PURPUR_API}`, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(sortVersionsDesc(json.versions || []));
          } catch (err) {
            reject(err);
          }
        });
      }).on('error', reject);
    });
  }

  static async getFabricVersions() {
    return new Promise((resolve, reject) => {
      https.get('https://meta.fabricmc.net/v2/versions/game', (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const versions = JSON.parse(data);
            resolve(sortVersionsDesc(versions.filter(v => v.stable).map(v => v.version)));
          } catch (err) {
            reject(err);
          }
        });
      }).on('error', reject);
    });
  }

  static async getForgeVersions() {
    return new Promise((resolve, reject) => {
      const followRedirect = (url) => {
        https.get(url, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 308) {
            followRedirect(res.headers.location);
            return;
          }
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              const versions = sortVersionsDesc(
                [...new Set(Object.keys(json.promos || {})
                  .map(v => v.replace(/-(latest|recommended)/g, '')))]
              );
              resolve(versions.filter(v => /^\d/.test(v)).slice(0, 50));
            } catch (err) {
              reject(err);
            }
          });
        }).on('error', reject);
      };
      followRedirect('https://files.minecraftforge.net/maven/net/minecraftforge/forge/promotions_slim.json');
    });
  }

  static async getSpigotVersions() {
    return new Promise((resolve, reject) => {
      https.get('https://hub.spigotmc.org/versions/', { headers: { 'User-Agent': 'NetherPanel/1.0' } }, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const matches = data.match(/<a[^>]*href="(\d+\.\d+(?:\.\d+)?)\.json">/g) || [];
            const versions = sortVersionsDesc(
              [...new Set(matches.map(m => m.match(/href="(\d+\.\d+(?:\.\d+)?)\.json"/)[1]))]
            );
            resolve(versions.slice(0, 30));
          } catch (err) {
            reject(err);
          }
        });
      }).on('error', reject);
    });
  }

  static async getBedrockVersions() {
    return new Promise((resolve, reject) => {
      https.get('https://raw.githubusercontent.com/kittizz/bedrock-server-downloads/main/bedrock-server-downloads.json', (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const releases = json.release || {};
            resolve(sortVersionsDesc(Object.keys(releases)));
          } catch (err) {
            reject(err);
          }
        });
      }).on('error', reject);
    });
  }

  static async getPocketMineVersions() {
    return new Promise((resolve, reject) => {
      https.get('https://api.github.com/repos/pmmp/PocketMine-MP/releases', { headers: { 'User-Agent': 'NetherPanel/1.0' } }, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const releases = JSON.parse(data);
            const versions = releases
              .filter(r => !r.prerelease && r.assets.some(a => a.name === 'PocketMine-MP.phar'))
              .map(r => r.tag_name);
            resolve(versions);
          } catch (err) { reject(err); }
        });
      }).on('error', reject);
    });
  }

  static async getNukkitVersions() {
    return new Promise((resolve, reject) => {
      https.get('https://api.github.com/repos/PowerNukkitX/PowerNukkitX/releases', { headers: { 'User-Agent': 'NetherPanel/1.0' } }, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const releases = JSON.parse(data);
            const versions = releases
              .filter(r => !r.prerelease && r.assets.some(a => a.name === 'powernukkitx.jar'))
              .map(r => r.tag_name);
            resolve(versions);
          } catch (err) { reject(err); }
        });
      }).on('error', reject);
    });
  }

  static async getPowerNukkitVersions() {
    return new Promise((resolve, reject) => {
      https.get('https://api.github.com/repos/PowerNukkit/PowerNukkit/releases', { headers: { 'User-Agent': 'NetherPanel/1.0' } }, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const releases = JSON.parse(data);
            const versions = releases
              .filter(r => !r.prerelease && r.assets.some(a => a.name.includes('shaded.jar')))
              .map(r => r.tag_name);
            resolve(versions);
          } catch (err) { reject(err); }
        });
      }).on('error', reject);
    });
  }

  static async getVanillaVersions() {
    return new Promise((resolve, reject) => {
      https.get('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json', (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const manifest = JSON.parse(data);
            const versions = manifest.versions
              .filter(v => v.type === 'release')
              .map(v => v.id);
            resolve(sortVersionsDesc(versions).slice(0, 30));
          } catch (err) { reject(err); }
        });
      }).on('error', reject);
    });
  }

  static async getFoliaVersions() {
    return new Promise((resolve, reject) => {
      https.get(FOLIA_API, { headers: { 'User-Agent': 'NetherPanel/1.0' } }, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const versionsObj = json.versions || {};
            const allVersions = [];
            for (const group of Object.keys(versionsObj)) {
              for (const v of versionsObj[group]) {
                if (!v.includes('rc') && !v.includes('pre') && !v.includes('-dev')) {
                  allVersions.push(v);
                }
              }
            }
            resolve(sortVersionsDesc(allVersions));
          } catch (err) { reject(err); }
        });
      }).on('error', reject);
    });
  }

  static async getNeoForgeVersions() {
    return new Promise((resolve, reject) => {
      https.get('https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml', (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const matches = data.match(/<version>([^<]+)<\/version>/g) || [];
            const versions = matches.map(m => m.replace(/<\/?version>/g, ''))
              .filter(v => !v.includes('beta') && !v.includes('alpha'));
            resolve(sortVersionsDesc(versions).slice(0, 50));
          } catch (err) { reject(err); }
        });
      }).on('error', reject);
    });
  }

  static async getQuiltVersions() {
    return new Promise((resolve, reject) => {
      https.get(`${QUILT_API}/game`, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const versions = JSON.parse(data);
            resolve(sortVersionsDesc(versions.filter(v => v.stable).map(v => v.version)));
          } catch (err) { reject(err); }
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
