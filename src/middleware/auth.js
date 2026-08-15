const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const SECRET_PATH = path.join(DATA_DIR, '.jwt_secret');

let JWT_SECRET;
if (fs.existsSync(SECRET_PATH)) {
  JWT_SECRET = fs.readFileSync(SECRET_PATH, 'utf8').trim();
} else {
  JWT_SECRET = crypto.randomBytes(64).toString('hex');
  fs.writeFileSync(SECRET_PATH, JWT_SECRET, 'utf8');
  fs.chmodSync(SECRET_PATH, 0o600);
}

const JWT_EXPIRES_IN = '7d';

function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function hashApiToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function authenticateApiToken(token, next) {
  try {
    const db = require('../database').getDb();
    if (!db) return null;
    const row = db.prepare('SELECT * FROM api_tokens WHERE token_hash = ?').get(hashApiToken(token));
    if (!row) return null;
    if (row.expires_at) {
      const expires = new Date(String(row.expires_at).replace(' ', 'T') + 'Z');
      if (expires.getTime() < Date.now()) return null;
    }
    const user = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(row.user_id);
    if (!user) return null;
    db.prepare('UPDATE api_tokens SET last_used_at = ? WHERE id = ?').run(new Date().toISOString(), row.id);
    return {
      user,
      tokenScopes: row.scopes ? row.scopes.split(',').map(s => s.trim()).filter(Boolean) : ['all'],
      isApiToken: true
    };
  } catch (err) {
    console.error('[auth] API token auth failed:', err.message);
    return null;
  }
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    const api = authenticateApiToken(token, next);
    if (api) {
      req.user = api.user;
      req.tokenScopes = api.tokenScopes;
      req.isApiToken = true;
      return next();
    }
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
    } catch (err) {
      // Token invalid, continue without user
    }
  }
  next();
}

module.exports = {
  generateToken,
  authenticateToken,
  requireAdmin,
  optionalAuth,
  JWT_SECRET
};
