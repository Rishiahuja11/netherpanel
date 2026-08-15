const { getDb } = require('../database');

const DEFAULTS = {
  panel_name: 'NetherPanel',
  cloudflare_enabled: 'true',
  cloudflare_domain: 'smp45.qzz.io',
  cloudflare_api_token: '',
  cloudflare_zone_id: '',
  cloudflare_server_ip: ''
};

class SettingsService {
  static get(key, fallback = null) {
    const db = getDb();
    if (!db) return fallback !== null ? fallback : DEFAULTS[key] || null;
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    if (row) return row.value;
    if (fallback !== null) return fallback;
    return key in DEFAULTS ? DEFAULTS[key] : null;
  }

  static set(key, value, category = 'general') {
    const db = getDb();
    db.prepare(
      'INSERT INTO settings (key, value, category) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP'
    ).run(key, String(value), category, String(value));
  }

  static getBool(key, fallback = false) {
    const v = String(this.get(key, fallback ? 'true' : 'false'));
    return v === 'true' || v === '1';
  }

  static getInt(key, fallback = 0) {
    const v = parseInt(this.get(key, String(fallback)), 10);
    return isNaN(v) ? fallback : v;
  }

  static getCloudflareConfig() {
    return {
      enabled: this.getBool('cloudflare_enabled', true),
      domain: this.get('cloudflare_domain', 'smp45.qzz.io'),
      apiToken: this.get('cloudflare_api_token', ''),
      zoneId: this.get('cloudflare_zone_id', ''),
      serverIp: this.get('cloudflare_server_ip', '')
    };
  }

  static isCloudflareEnabled() {
    return this.getBool('cloudflare_enabled', true);
  }

  static getDomain() {
    return this.get('cloudflare_domain', 'smp45.qzz.io');
  }
}

module.exports = SettingsService;
