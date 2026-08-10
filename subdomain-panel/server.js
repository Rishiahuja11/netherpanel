const express = require('express');
const path = require('path');
const https = require('https');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'netherpanel-subdomain-secret';

const CF_API = 'https://api.cloudflare.com/client/v4';

let db;
async function initDB() {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  const fs = require('fs');
  const dbPath = path.join(__dirname, '..', 'data', 'netherpanel.db');
  if (fs.existsSync(dbPath)) {
    const buf = fs.readFileSync(dbPath);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }
}

function getSettings() {
  const token = db.prepare("SELECT value FROM settings WHERE key = 'cloudflare_api_token'")?.get()?.value;
  const zoneId = db.prepare("SELECT value FROM settings WHERE key = 'cloudflare_zone_id'")?.get()?.value;
  const ip = db.prepare("SELECT value FROM settings WHERE key = 'cloudflare_server_ip'")?.get()?.value;
  const domain = db.prepare("SELECT value FROM settings WHERE key = 'cloudflare_domain'")?.get()?.value;
  return { token, zoneId, ip, domain: domain || 'smp45.qzz.io' };
}

function cfRequest(method, path, body) {
  const settings = getSettings();
  if (!settings.token) throw new Error('Cloudflare API token not configured');

  return new Promise((resolve, reject) => {
    const url = new URL(`${CF_API}${path}`);
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'Authorization': `Bearer ${settings.token}`,
        'Content-Type': 'application/json'
      }
    };
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);

    const req = https.request(opts, (res) => {
      let chunks = '';
      res.on('data', c => chunks += c);
      res.on('end', () => {
        try { resolve(JSON.parse(chunks)); }
        catch (e) { reject(new Error('Invalid Cloudflare response')); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, username, email, role FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

app.get('/api/records', authMiddleware, async (req, res) => {
  try {
    const settings = getSettings();
    const result = await cfRequest('GET', `/zones/${settings.zoneId}/dns_records?type=A&per_page=100`);
    if (!result.success) return res.status(500).json({ error: result.errors?.[0]?.message || 'Cloudflare error' });

    const records = result.result.map(r => ({
      id: r.id,
      name: r.name,
      content: r.content,
      proxied: r.proxied,
      ttl: r.ttl,
      created: r.created_on,
      modified: r.modified_on
    }));

    res.json({ records, domain: settings.domain, serverIp: settings.ip });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/records', authMiddleware, async (req, res) => {
  try {
    const { subdomain } = req.body;
    if (!subdomain) return res.status(400).json({ error: 'Subdomain is required' });

    const settings = getSettings();
    const fqdn = `${subdomain}.${settings.domain}`;

    const existing = await cfRequest('GET', `/zones/${settings.zoneId}/dns_records?type=A&name=${fqdn}`);
    if (existing.success && existing.result?.length > 0) {
      return res.status(409).json({ error: 'Subdomain already exists' });
    }

    const result = await cfRequest('POST', `/zones/${settings.zoneId}/dns_records`, {
      type: 'A',
      name: fqdn,
      content: settings.ip,
      ttl: 1,
      proxied: false
    });

    if (!result.success) return res.status(500).json({ error: result.errors?.[0]?.message || 'Failed to create record' });
    res.json({ success: true, record: result.result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/records/:id', authMiddleware, async (req, res) => {
  try {
    const settings = getSettings();
    const result = await cfRequest('DELETE', `/zones/${settings.zoneId}/dns_records/${req.params.id}`);
    if (!result.success) return res.status(500).json({ error: result.errors?.[0]?.message || 'Failed to delete' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/test', authMiddleware, async (req, res) => {
  try {
    const settings = getSettings();
    const result = await cfRequest('GET', `/zones/${settings.zoneId}`);
    res.json({ success: result.success, zoneName: result.result?.name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/servers', authMiddleware, (req, res) => {
  const servers = db.prepare('SELECT id, name, subdomain, port, server_type, game_type, status FROM servers WHERE user_id = ?').all(req.user.id);
  res.json(servers);
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function start() {
  await initDB();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  ╔═══════════════════════════════════════════════╗`);
    console.log(`  ║  NetherPanel Subdomain Manager                ║`);
    console.log(`  ║  Running on http://localhost:${PORT}            ║`);
    console.log(`  ╚═══════════════════════════════════════════════╝\n`);
  });
}

start();
