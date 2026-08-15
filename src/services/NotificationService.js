const https = require('https');
const http = require('http');
const { getDb } = require('../database');
const SettingsService = require('./SettingsService');

const DEFAULT_EVENTS = ['server_start', 'server_stop', 'server_crash', 'server_created', 'backup_created'];

let io = null;

class NotificationService {
  static setIo(socketIo) {
    io = socketIo;
  }

  static getEnabledEvents() {
    const raw = SettingsService.get('webhook_events', '');
    if (!raw) return DEFAULT_EVENTS;
    return raw.split(',').map(s => s.trim()).filter(Boolean);
  }

  static isEventEnabled(event) {
    const events = this.getEnabledEvents();
    if (events.length === 0) return true;
    return events.includes(event);
  }

  static notify(event, data = {}) {
    try {
      this.notifyWebhook(event, data);
      this.notifyInApp(event, data);
    } catch (err) {
      console.error('[NotificationService] notify error:', err.message);
    }
  }

  static notifyWebhook(event, data) {
    const url = SettingsService.get('webhook_url', '');
    if (!url || !this.isEventEnabled(event)) return;

    const payload = JSON.stringify({
      event,
      panel_name: SettingsService.get('panel_name', 'NetherPanel'),
      timestamp: new Date().toISOString(),
      data
    });

    try {
      const parsed = new URL(url);
      const client = parsed.protocol === 'https:' ? https : http;
      const req = client.request(parsed, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 8000
      }, (res) => {
        res.resume();
      });
      req.on('error', (err) => console.error('[Webhook] send failed:', err.message));
      req.on('timeout', () => req.destroy());
      req.write(payload);
      req.end();
    } catch (err) {
      console.error('[Webhook] invalid URL:', err.message);
    }
  }

  static notifyInApp(event, data) {
    const db = getDb();
    if (!db) return;

    const server = data.server || null;
    const userId = data.userId || (server && server.user_id) || null;
    const { title, body, type } = this.buildMessage(event, data);
    if (!userId) return;

    db.prepare(
      'INSERT INTO notifications (user_id, title, body, type, server_id) VALUES (?, ?, ?, ?, ?)'
    ).run(userId, title, body, type, server ? server.id : null);
    db.save();

    if (io) {
      io.emit('notification', { userId, title, body, type, event, created_at: new Date().toISOString() });
    }
  }

  static buildMessage(event, data) {
    const server = data.server || {};
    const name = server.name || data.serverName || 'Server';
    switch (event) {
      case 'server_start':
        return { title: `${name} started`, body: 'The server is now online.', type: 'success' };
      case 'server_stop':
        return { title: `${name} stopped`, body: 'The server was stopped.', type: 'info' };
      case 'server_crash':
        return { title: `${name} crashed`, body: `Exit code ${data.code !== null ? data.code : 'unknown'}${data.signal ? ` (${data.signal})` : ''}.`, type: 'error' };
      case 'server_created':
        return { title: `${name} created`, body: 'Your server is ready to start.', type: 'success' };
      case 'backup_created':
        return { title: `Backup created for ${name}`, body: data.backupName || 'A new backup was created.', type: 'info' };
      default:
        return { title: 'Notification', body: '', type: 'info' };
    }
  }

  static list(userId, limit = 30) {
    const db = getDb();
    return db.prepare(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?'
    ).all(userId, limit);
  }

  static unreadCount(userId) {
    const db = getDb();
    const row = db.prepare(
      'SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read = 0'
    ).get(userId);
    return row ? row.c : 0;
  }

  static markAllRead(userId) {
    const db = getDb();
    db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0').run(userId);
    db.save();
  }
}

module.exports = NotificationService;
