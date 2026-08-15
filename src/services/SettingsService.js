const { getDb } = require('../database');

let cache = null;

const DEFAULTS = {
  panel_name: 'NetherPanel',
  cloudflare_enabled: 'true',
  cloudflare_domain: 'smp45.qzz.io',
  cloudflare_api_token: '',
  cloudflare_zone_id: '',
  cloudflare_server_ip: '',
  resource_ram_limit: '0',
  resource_cpu_limit: ''
};

class SettingsService {
  static invalidate() {
    cache = null;
  }

  static loadCache() {
    const db = getDb();
    if (!db) return;
    try {
      const rows = db.prepare('SELECT key, value FROM settings').all();
      cache = {};
      for (const row of rows) cache[row.key] = row.value;
    } catch (e) {
      cache = null;
    }
  }

  static get(key, fallback = null) {
    if (cache === null) this.loadCache();
    if (cache && key in cache) return cache[key];
    if (fallback !== null) return fallback;
    return key in DEFAULTS ? DEFAULTS[key] : null;
  }

  static set(key, value, category = 'general') {
    const db = getDb();
    db.prepare(
      'INSERT INTO settings (key, value, category) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP'
    ).run(key, String(value), category, String(value));
    if (cache !== null) cache[key] = String(value);
  }

  static getBool(key, fallback = false) {
    const v = String(this.get(key, fallback ? 'true' : 'false'));
    return v === 'true' || v === '1';
  }

  static getInt(key, fallback = 0) {
    const v = parseInt(this.get(key, String(fallback)), 10);
    return isNaN(v) ? fallback : v;
  }

  static isCloudflareEnabled() {
    return this.getBool('cloudflare_enabled', true);
  }

  static getDomain() {
    return this.get('cloudflare_domain', 'smp45.qzz.io');
  }

  static getRamLimit() {
    return this.getInt('resource_ram_limit', 0);
  }

  static getCpuLimit() {
    return this.get('resource_cpu_limit', '');
  }
}

module.exports = SettingsService;
