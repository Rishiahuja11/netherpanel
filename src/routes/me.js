const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { getDb } = require('../database');
const NotificationService = require('../services/NotificationService');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

router.get('/notifications', (req, res) => {
  try {
    const items = NotificationService.list(req.user.id);
    res.json({ items, unread: NotificationService.unreadCount(req.user.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/notifications/read', (req, res) => {
  try {
    NotificationService.markAllRead(req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/tokens', (req, res) => {
  const db = getDb();
  const tokens = db.prepare(
    'SELECT id, name, scopes, expires_at, last_used_at, created_at FROM api_tokens WHERE user_id = ? ORDER BY id DESC'
  ).all(req.user.id);
  res.json(tokens);
});

router.post('/tokens', (req, res) => {
  const { name, scopes, expires_at } = req.body;
  if (!name) return res.status(400).json({ error: 'Token name is required' });

  const db = getDb();
  const validScopes = ['all', 'control', 'files', 'backups', 'schedules', 'mods', 'players'];
  let scopeList = Array.isArray(scopes) && scopes.length ? scopes : ['all'];
  scopeList = scopeList.filter(s => validScopes.includes(s));
  if (!scopeList.length) scopeList = ['all'];

  const raw = `np_${crypto.randomBytes(24).toString('hex')}`;
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const expires = expires_at ? new Date(expires_at).toISOString().slice(0, 19).replace('T', ' ') : null;

  const result = db.prepare(
    'INSERT INTO api_tokens (user_id, name, token_hash, scopes, expires_at) VALUES (?, ?, ?, ?, ?)'
  ).run(req.user.id, name, hash, scopeList.join(','), expires);

  db.save();
  res.status(201).json({
    id: result.lastInsertRowid,
    name,
    scopes: scopeList,
    token: raw,
    expires_at: expires
  });
});

router.delete('/tokens/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM api_tokens WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Token not found' });
  db.save();
  res.json({ success: true });
});

module.exports = router;
