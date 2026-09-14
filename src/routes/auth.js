const express = require('express');
const router = express.Router();
const UserService = require('../services/UserService');
const SettingsService = require('../services/SettingsService');
const { authenticateToken } = require('../middleware/auth');
const { rateLimit } = require('../middleware/security');

const authRateLimit = rateLimit({ windowMs: 10 * 60 * 1000, max: 15, message: 'Too many login/registration attempts. Try again later.' });

router.post('/register', authRateLimit, async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (typeof username !== 'string' || username.length < 3 || username.length > 32) {
      return res.status(400).json({ error: 'Username must be 3-32 characters' });
    }

    if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
      return res.status(400).json({ error: 'Username can only contain letters, numbers, dots, underscores and hyphens' });
    }

    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    if (email !== undefined && email !== null && email !== '' && typeof email === 'string' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    if (email && email.length > 100) {
      return res.status(400).json({ error: 'Email too long' });
    }

    if (!SettingsService.getBool('allow_registrations', true)) {
      return res.status(403).json({ error: 'Registration is disabled' });
    }

    const result = await UserService.register(username, email, password);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/login', authRateLimit, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const result = await UserService.login(username, password);
    res.json(result);
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

router.get('/me', authenticateToken, (req, res) => {
  const user = UserService.getById(req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json(user);
});

router.put('/me', authenticateToken, async (req, res) => {
  try {
    const user = UserService.update(req.user.id, req.body);
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/me/password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }

    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    await UserService.changePassword(req.user.id, currentPassword, newPassword);
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
