const https = require('https');
const fs = require('fs');
const path = require('path');
const { getDb } = require('../database');
const ServerService = require('./ServerService');
const UserService = require('./UserService');

const MODRINTH_API = 'https://api.modrinth.com/v2';
const HANGAR_API = 'https://hangar.papermc.io/api/v1';
const POGGIT_API = 'https://poggit.pmmp.io';

class ModService {
  static getDb() {
    return getDb();
  }

  static async searchMods(query, limit = 20, index = 'relevance', projectType = null) {
    return new Promise((resolve, reject) => {
      const params = new URLSearchParams({
        query: query || '',
        limit: limit.toString(),
        index: index
      });

      const facets = [];
      if (projectType) {
        facets.push([`project_type:${projectType}`]);
      }

      if (facets.length > 0) {
        params.append('facets', JSON.stringify(facets));
      }

      const url = `${MODRINTH_API}/search?${params}`;

      https.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            resolve({
              hits: (result.hits || []).map(mod => ({
                id: mod.project_id,
                slug: mod.slug,
                title: mod.title,
                description: mod.description,
                author: mod.author,
                downloads: mod.downloads,
                icon_url: mod.icon_url,
                categories: mod.categories,
                versions: mod.versions,
                server_side: mod.server_side,
                client_side: mod.client_side,
                project_type: mod.project_type,
                source: 'modrinth'
              })),
              offset: result.offset,
              limit: result.limit,
              total_hits: result.total_hits,
              source: 'modrinth'
            });
          } catch (err) {
            reject(err);
          }
        });
      }).on('error', reject);
    });
  }

  static async searchHangar(query, limit = 20) {
    return new Promise((resolve, reject) => {
      const params = new URLSearchParams({
        limit: limit.toString()
      });
      if (query) params.append('q', query);

      const url = `${HANGAR_API}/projects?${params}`;
      https.get(url, { headers: { 'Accept': 'application/json' } }, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            const hits = (result.result || []).map(p => ({
              id: p.namespace?.slug || p.name,
              slug: p.namespace?.slug || p.name,
              title: p.name,
              description: p.description || '',
              author: p.namespace?.owner || 'unknown',
              downloads: p.stats?.downloads || 0,
              icon_url: null,
              categories: [p.category],
              versions: [],
              source: 'hangar'
            }));
            resolve({
              hits,
              offset: result.pagination?.offset || 0,
              limit: result.pagination?.limit || limit,
              total_hits: result.pagination?.count || hits.length,
              source: 'hangar'
            });
          } catch (err) { reject(err); }
        });
      }).on('error', reject);
    });
  }

  static async searchPoggit(query, limit = 20) {
    return new Promise((resolve, reject) => {
      const params = new URLSearchParams({ limit: limit.toString() });
      if (query) params.append('search', query);

      const url = `${POGGIT_API}/releases.json?${params}`;

      https.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            const hits = (Array.isArray(result) ? result : []).map(p => ({
              id: String(p.project_id || p.name),
              slug: p.project_name || p.name,
              title: p.name || p.project_name,
              description: p.tagline || '',
              author: (p.repo_name || '').split('/')[0] || 'unknown',
              downloads: p.downloads || 0,
              icon_url: null,
              categories: [],
              versions: [],
              source: 'poggit'
            }));
            resolve({
              hits,
              offset: 0,
              limit,
              total_hits: hits.length,
              source: 'poggit'
            });
          } catch (err) { reject(err); }
        });
      }).on('error', reject);
    });
  }

  static async searchForServer(query, serverType, limit = 20) {
    const server = { server_type: serverType };
    const source = this.getSearchSourceType(server);

    switch (source) {
      case 'hangar':
        return this.searchHangar(query, limit);
      case 'poggit':
        return this.searchPoggit(query, limit);
      default:
        return this.searchMods(query, limit, 'relevance', this.isPluginServer(server) ? 'plugin' : 'mod');
    }
  }

  static async getModDetails(modId) {
    return new Promise((resolve, reject) => {
      const url = `${MODRINTH_API}/project/${modId}`;

      https.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const mod = JSON.parse(data);
            resolve({
              id: mod.id,
              slug: mod.slug,
              title: mod.title,
              description: mod.description,
              body: mod.body,
              author: mod.author,
              downloads: mod.downloads,
              icon_url: mod.icon_url,
              categories: mod.categories,
              versions: mod.versions,
              server_side: mod.server_side,
              client_side: mod.client_side,
              status: mod.status,
              date_created: mod.date_created,
              date_modified: mod.date_modified
            });
          } catch (err) {
            reject(err);
          }
        });
      }).on('error', reject);
    });
  }

  static async getModVersions(modId, gameVersion = null, loader = null) {
    return new Promise((resolve, reject) => {
      const params = new URLSearchParams();
      if (gameVersion) params.append('game_versions', `["${gameVersion}"]`);
      if (loader) params.append('loaders', `["${loader}"]`);

      const url = `${MODRINTH_API}/project/${modId}/version?${params}`;

      https.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const versions = JSON.parse(data);
            resolve((Array.isArray(versions) ? versions : []).map(v => ({
              id: v.id,
              name: v.name,
              version_number: v.version_number,
              version_type: v.version_type,
              game_versions: v.game_versions,
              loaders: v.loaders,
              files: (v.files || []).map(f => ({
                filename: f.filename,
                url: f.url,
                size: f.size,
                primary: f.primary
              })),
              date_created: v.date_created
            })));
          } catch (err) {
            reject(err);
          }
        });
      }).on('error', reject);
    });
  }

  static async installMod(serverId, modId, versionId, userId, source = 'modrinth', modName = null) {
    const server = ServerService.getServer(serverId);
    if (!server) {
      throw new Error('Server not found');
    }

    if (source === 'hangar') {
      return this.installHangarMod(server, modId, userId, modName);
    }
    if (source === 'poggit') {
      return this.installPoggitMod(server, modId, userId, modName);
    }
    return this.installModrinthMod(server, modId, versionId, userId);
  }

  static async getHangarVersions(slug, limit = 5) {
    return new Promise((resolve, reject) => {
      const params = new URLSearchParams({ limit: limit.toString(), channel: 'Release' });
      const url = `${HANGAR_API}/projects/${encodeURIComponent(slug)}/versions?${params}`;

      https.get(url, { headers: { 'Accept': 'application/json' } }, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            resolve((result.result || []).map(v => ({
              id: v.id,
              name: v.name,
              channel: v.channel?.name,
              downloads: v.downloads || {}
            })));
          } catch (err) { reject(err); }
        });
      }).on('error', reject);
    });
  }

  static async installHangarMod(server, slug, userId, modName) {
    const versions = await this.getHangarVersions(slug, 5);
    if (!versions.length) {
      throw new Error('No compatible version found');
    }

    const version = versions[0];
    let file = null;
    if (version.downloads && typeof version.downloads === 'object') {
      const keys = Object.keys(version.downloads);
      file = keys.length ? version.downloads[keys[0]] : null;
    }

    const fileUrl = file?.downloadUrl || file?.externalUrl;
    const filename = file?.fileInfo?.name || `${slug}-${version.name}.jar`;
    if (!fileUrl) {
      throw new Error('No download file found');
    }

    const serverDir = ServerService.getServerDir(server.id);
    const modsDir = path.join(serverDir, this.getModFolder(server));
    if (!fs.existsSync(modsDir)) {
      fs.mkdirSync(modsDir, { recursive: true });
    }

    const filePath = path.join(modsDir, filename);
    await this.downloadFile(fileUrl, filePath);

    return this.recordInstalledMod(server, slug, modName || slug, version.name, filename, userId);
  }

  static async getPoggitReleases(project, limit = 1) {
    return new Promise((resolve, reject) => {
      const url = `${POGGIT_API}/releases.json?name=${encodeURIComponent(project)}`;

      https.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const releases = JSON.parse(data);
            resolve((Array.isArray(releases) ? releases : []).slice(0, limit).map(r => ({
              id: r.id,
              name: r.name,
              version: r.version,
              artifact_url: r.artifact_url,
              downloads: r.downloads || 0
            })));
          } catch (err) { reject(err); }
        });
      }).on('error', reject);
    });
  }

  static async installPoggitMod(server, slug, userId, modName) {
    const releases = await this.getPoggitReleases(modName || slug, 1);
    const release = releases[0];
    if (!release) {
      throw new Error('No compatible version found');
    }

    const filename = `${release.name}-${release.version}.phar`;
    if (!release.artifact_url) {
      throw new Error('No download file found');
    }

    const serverDir = ServerService.getServerDir(server.id);
    const modsDir = path.join(serverDir, this.getModFolder(server));
    if (!fs.existsSync(modsDir)) {
      fs.mkdirSync(modsDir, { recursive: true });
    }

    const filePath = path.join(modsDir, filename);
    await this.downloadFile(release.artifact_url, filePath);

    return this.recordInstalledMod(server, slug, modName || release.name, release.version, filename, userId);
  }

  static async installModrinthMod(server, modId, versionId, userId) {
    const serverDir = ServerService.getServerDir(server.id);
    const modFolder = this.getModFolder(server);
    const modsDir = path.join(serverDir, modFolder);

    if (!fs.existsSync(modsDir)) {
      fs.mkdirSync(modsDir, { recursive: true });
    }

    const isPlugin = this.isPluginServer(server);
    const loader = isPlugin ? null : this.getServerLoader(server);
    const versions = await this.getModVersions(modId, null, loader);
    const version = versionId
      ? versions.find(v => v.id === versionId)
      : versions[0];

    if (!version) {
      throw new Error('No compatible version found');
    }

    const primaryFile = version.files.find(f => f.primary) || version.files[0];
    if (!primaryFile) {
      throw new Error('No download file found');
    }

    const filePath = path.join(modsDir, primaryFile.filename);

    await this.downloadFile(primaryFile.url, filePath);

    const db = this.getDb();
    const existingMod = db.prepare(
      'SELECT id FROM mods WHERE server_id = ? AND modrinth_id = ?'
    ).get(server.id, modId);

    let modName = null;
    if (!existingMod) {
      const modDetails = await this.getModDetails(modId);
      modName = modDetails.title;
    }

    return this.recordInstalledMod(server, modId, modName, version.version_number, primaryFile.filename, userId);
  }

  static recordInstalledMod(server, externalId, modName, version, filename, userId) {
    const db = this.getDb();
    const existingMod = db.prepare(
      'SELECT id FROM mods WHERE server_id = ? AND modrinth_id = ?'
    ).get(server.id, externalId);

    let mod;
    if (existingMod) {
      db.prepare(
        'UPDATE mods SET version = ?, filename = ?, enabled = 1 WHERE id = ?'
      ).run(version, filename, existingMod.id);
      mod = db.prepare('SELECT * FROM mods WHERE id = ?').get(existingMod.id);
    } else {
      const name = modName || externalId;
      const result = db.prepare(
        'INSERT INTO mods (server_id, modrinth_id, name, slug, version, filename) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(server.id, externalId, name, externalId, version, filename);
      mod = db.prepare('SELECT * FROM mods WHERE id = ?').get(result.lastInsertRowid);
    }

    UserService.logActivity(userId, 'mod_install', 'mod', mod.id, `Installed mod "${mod.name}" v${mod.version}`);

    return mod;
  }

  static async removeMod(modId, userId) {
    const db = this.getDb();
    const mod = db.prepare('SELECT * FROM mods WHERE id = ?').get(modId);
    if (!mod) {
      throw new Error('Mod not found');
    }

    const server = ServerService.getServer(mod.server_id);
    const serverDir = ServerService.getServerDir(mod.server_id);
    const modFolder = this.getModFolder(server);
    const filePath = path.join(serverDir, modFolder, mod.filename);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    db.prepare('DELETE FROM mods WHERE id = ?').run(modId);
    UserService.logActivity(userId, 'mod_remove', 'mod', modId, `Removed mod "${mod.name}"`);

    return mod;
  }

  static listMods(serverId) {
    const db = this.getDb();
    return db.prepare('SELECT * FROM mods WHERE server_id = ? ORDER BY name').all(serverId);
  }

  static toggleMod(modId, enabled, userId) {
    const db = this.getDb();
    const mod = db.prepare('SELECT * FROM mods WHERE id = ?').get(modId);
    if (!mod) {
      throw new Error('Mod not found');
    }

    db.prepare('UPDATE mods SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, modId);

    const server = ServerService.getServer(mod.server_id);
    const serverDir = ServerService.getServerDir(mod.server_id);
    const modFolder = this.getModFolder(server);
    const modsDir = path.join(serverDir, modFolder);
    const filePath = path.join(modsDir, mod.filename);
    const disabledPath = path.join(modsDir, `${mod.filename}.disabled`);

    if (enabled) {
      if (fs.existsSync(disabledPath)) {
        fs.renameSync(disabledPath, filePath);
      }
    } else {
      if (fs.existsSync(filePath)) {
        fs.renameSync(filePath, disabledPath);
      }
    }

    UserService.logActivity(userId, 'mod_toggle', 'mod', modId, `${enabled ? 'Enabled' : 'Disabled'} mod "${mod.name}"`);

    return db.prepare('SELECT * FROM mods WHERE id = ?').get(modId);
  }

  static async downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
      const download = (downloadUrl) => {
        https.get(downloadUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' } }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            download(new URL(res.headers.location, downloadUrl).toString());
            return;
          }

          if (res.statusCode !== 200) {
            res.resume();
            reject(new Error(`Download failed with status ${res.statusCode}`));
            return;
          }

          const file = fs.createWriteStream(destPath);
          res.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve();
          });
          file.on('error', (err) => {
            fs.unlink(destPath, () => {});
            reject(err);
          });
        }).on('error', (err) => {
          fs.unlink(destPath, () => {});
          reject(err);
        });
      };

      download(url);
    });
  }

  static getServerLoader(server) {
    const typeMap = {
      paper: 'paper', spigot: 'paper', purpur: 'paper', folia: 'paper',
      forge: 'forge', fabric: 'fabric', quilt: 'quilt',
      neoforge: 'neoforge',
      bukkit: 'bukkit', pocketmine: 'pocketmine', nukkit: 'spigot', powernukkit: 'spigot'
    };
    return typeMap[server.server_type] || 'paper';
  }

  static isPluginServer(server) {
    return ['paper', 'spigot', 'purpur', 'folia', 'bukkit', 'pocketmine', 'nukkit', 'powernukkit'].includes(server.server_type);
  }

  static isModrinthCompatible(server) {
    return ['paper', 'spigot', 'purpur', 'folia', 'forge', 'fabric', 'quilt', 'neoforge'].includes(server.server_type);
  }

  static isHangarCompatible(server) {
    return ['paper', 'spigot', 'purpur', 'folia'].includes(server.server_type);
  }

  static isPoggitCompatible(server) {
    return ['pocketmine'].includes(server.server_type);
  }

  static getModFolder(server) {
    if (this.isPoggitCompatible(server)) return 'plugins';
    if (this.isPluginServer(server)) return 'plugins';
    return 'mods';
  }

  static getSearchSourceType(server) {
    if (this.isPoggitCompatible(server)) return 'poggit';
    if (this.isHangarCompatible(server)) return 'hangar';
    if (this.isModrinthCompatible(server)) return 'modrinth';
    return 'modrinth';
  }

  static getModStats() {
    const db = this.getDb();
    const total = db.prepare('SELECT COUNT(*) as count FROM mods').get().count;
    const byServer = db.prepare(
      'SELECT server_id, COUNT(*) as count FROM mods GROUP BY server_id'
    ).all();

    return { total, byServer };
  }
}

module.exports = ModService;
