const https = require('https');
const fs = require('fs');
const path = require('path');
const { getDb } = require('../database');
const ServerService = require('./ServerService');
const UserService = require('./UserService');

const MODRINTH_API = 'https://api.modrinth.com/v2';

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
              hits: result.hits.map(mod => ({
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
                project_type: mod.project_type
              })),
              offset: result.offset,
              limit: result.limit,
              total_hits: result.total_hits
            });
          } catch (err) {
            reject(err);
          }
        });
      }).on('error', reject);
    });
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
            resolve(versions.map(v => ({
              id: v.id,
              name: v.name,
              version_number: v.version_number,
              version_type: v.version_type,
              game_versions: v.game_versions,
              loaders: v.loaders,
              files: v.files.map(f => ({
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

  static async installMod(serverId, modId, versionId, userId) {
    const server = ServerService.getServer(serverId);
    if (!server) {
      throw new Error('Server not found');
    }

    const serverDir = ServerService.getServerDir(serverId);
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
    ).get(serverId, modId);

    let mod;
    if (existingMod) {
      db.prepare(
        'UPDATE mods SET version = ?, filename = ?, enabled = 1 WHERE id = ?'
      ).run(version.version_number, primaryFile.filename, existingMod.id);
      mod = db.prepare('SELECT * FROM mods WHERE id = ?').get(existingMod.id);
    } else {
      const modDetails = await this.getModDetails(modId);
      const result = db.prepare(
        'INSERT INTO mods (server_id, modrinth_id, name, slug, version, filename) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(serverId, modId, modDetails.title, modDetails.slug, version.version_number, primaryFile.filename);
      mod = db.prepare('SELECT * FROM mods WHERE id = ?').get(result.lastInsertRowid);
    }

    UserService.logActivity(userId, 'mod_install', 'mod', mod.id, `Installed ${isPlugin ? 'plugin' : 'mod'} "${mod.name}" v${mod.version}`);

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
      const file = fs.createWriteStream(destPath);

      const download = (downloadUrl) => {
        https.get(downloadUrl, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            download(res.headers.location);
            return;
          }

          res.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve();
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
      paper: 'paper', spigot: 'paper', purpur: 'paper',
      forge: 'forge', fabric: 'fabric', quilt: 'quilt',
      bukkit: 'bukkit', pocketmine: 'pocketmine', nukkit: 'spigot'
    };
    return typeMap[server.server_type] || 'paper';
  }

  static isPluginServer(server) {
    return ['paper', 'spigot', 'purpur', 'bukkit'].includes(server.server_type);
  }

  static getModFolder(server) {
    if (this.isPluginServer(server)) return 'plugins';
    return 'mods';
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
