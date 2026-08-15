const { getDb } = require('../database');
const bcrypt = require('bcryptjs');
const { generateToken } = require('../middleware/auth');

class UserService {
  static getDb() {
    return getDb();
  }

  static async register(username, email, password, role = 'user') {
    const db = this.getDb();
    const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
    if (existing) {
      throw new Error('Username or email already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const result = db.prepare(
      'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)'
    ).run(username, email, hashedPassword, role);

    const user = db.prepare('SELECT id, username, email, role, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
    const token = generateToken(user);

    this.logActivity(user.id, 'register', 'user', user.id, `User ${username} registered`);

    return { user, token };
  }

  static async login(username, password) {
    const db = this.getDb();
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) {
      throw new Error('Invalid credentials');
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      throw new Error('Invalid credentials');
    }

    const token = generateToken(user);
    this.logActivity(user.id, 'login', 'user', user.id, `User ${username} logged in`);

    const { password: _, ...safeUser } = user;
    return { user: safeUser, token };
  }

  static getById(id) {
    const db = this.getDb();
    return db.prepare('SELECT id, username, email, role, avatar, created_at FROM users WHERE id = ?').get(id);
  }

  static getAll() {
    const db = this.getDb();
    return db.prepare('SELECT id, username, email, role, avatar, created_at FROM users').all();
  }

  static update(id, data, allowRoleChange = false) {
    const db = this.getDb();
    const fields = [];
    const values = [];

    if (data.username) {
      fields.push('username = ?');
      values.push(data.username);
    }
    if (data.email) {
      fields.push('email = ?');
      values.push(data.email);
    }
    if (data.role && allowRoleChange) {
      if (!['admin', 'user'].includes(data.role)) {
        throw new Error('Invalid role');
      }
      fields.push('role = ?');
      values.push(data.role);
    }
    if (data.avatar) {
      fields.push('avatar = ?');
      values.push(data.avatar);
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getById(id);
  }

  static async changePassword(id, currentPassword, newPassword) {
    const db = this.getDb();
    const user = db.prepare('SELECT password FROM users WHERE id = ?').get(id);
    if (!user) {
      throw new Error('User not found');
    }

    const validPassword = await bcrypt.compare(currentPassword, user.password);
    if (!validPassword) {
      throw new Error('Current password is incorrect');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    db.prepare('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hashedPassword, id);

    this.logActivity(id, 'password_change', 'user', id, 'Password changed');
    return true;
  }

  static async resetPassword(userId, newPassword) {
    const db = this.getDb();
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    db.prepare('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hashedPassword, userId);
    this.logActivity(userId, 'password_reset', 'user', userId, 'Password reset by admin');
    return true;
  }

  static delete(id) {
    const db = this.getDb();
    const user = this.getById(id);
    if (!user) {
      throw new Error('User not found');
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    this.logActivity(id, 'delete', 'user', id, `User ${user.username} deleted`);
    return user;
  }

  static getStats() {
    const db = this.getDb();
    const total = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const admins = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get('admin').count;
    const recent = db.prepare(
      "SELECT COUNT(*) as count FROM users WHERE created_at > datetime('now', '-7 days')"
    ).get().count;

    return { total, admins, recent };
  }

  static logActivity(userId, action, resourceType, resourceId, details, ipAddress = null) {
    const db = this.getDb();
    db.prepare(
      'INSERT INTO activity_logs (user_id, action, resource_type, resource_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(userId, action, resourceType, resourceId, details, ipAddress);
  }

  static getActivityLogs(limit = 100, offset = 0) {
    const db = this.getDb();
    return db.prepare(
      'SELECT a.*, u.username FROM activity_logs a LEFT JOIN users u ON a.user_id = u.id ORDER BY a.created_at DESC LIMIT ? OFFSET ?'
    ).all(limit, offset);
  }
}

module.exports = UserService;
