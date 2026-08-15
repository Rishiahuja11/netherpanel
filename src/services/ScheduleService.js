const cron = require('node-cron');
const { getDb } = require('../database');
const ServerService = require('./ServerService');
const UserService = require('./UserService');

const scheduledTasks = new Map();

class ScheduleService {
  static getDb() {
    return getDb();
  }

  static init() {
    const db = this.getDb();
    const schedules = db.prepare('SELECT * FROM schedules WHERE enabled = 1').all();
    for (const schedule of schedules) {
      this.startTask(schedule);
    }
  }

  static startTask(schedule) {
    if (!cron.validate(schedule.cron_expression)) {
      console.error(`Invalid cron expression for schedule ${schedule.id}: ${schedule.cron_expression}`);
      return;
    }

    const task = cron.schedule(schedule.cron_expression, async () => {
      try {
        await this.executeSchedule(schedule.id);
      } catch (err) {
        console.error(`Error executing schedule ${schedule.id}:`, err.message);
      }
    }, {
      scheduled: true,
      timezone: 'UTC'
    });

    scheduledTasks.set(schedule.id, task);
  }

  static stopTask(scheduleId) {
    const task = scheduledTasks.get(scheduleId);
    if (task) {
      task.stop();
      scheduledTasks.delete(scheduleId);
    }
  }

  static async executeSchedule(scheduleId) {
    const db = this.getDb();
    const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(scheduleId);
    if (!schedule || !schedule.enabled) {
      return;
    }

    db.prepare('UPDATE schedules SET last_run = CURRENT_TIMESTAMP WHERE id = ?').run(scheduleId);

    let output = '';
    let status = 'completed';

    try {
      switch (schedule.action) {
        case 'start':
          await ServerService.startServer(schedule.server_id, schedule.user_id || 1);
          output = 'Server started successfully';
          break;
        case 'stop':
          await ServerService.stopServer(schedule.server_id, schedule.user_id || 1);
          output = 'Server stopped successfully';
          break;
        case 'restart':
          await ServerService.restartServer(schedule.server_id, schedule.user_id || 1);
          output = 'Server restarted successfully';
          break;
        case 'backup':
          const BackupService = require('./BackupService');
          const backup = await BackupService.createBackup(schedule.server_id, `scheduled-${Date.now()}`, schedule.user_id || 1);
          output = `Backup created: ${backup.name}`;
          break;
        case 'command':
          if (schedule.command) {
            ServerService.sendCommand(schedule.server_id, schedule.command, schedule.user_id || 1);
            output = `Command sent: ${schedule.command}`;
          }
          break;
        default:
          output = `Unknown action: ${schedule.action}`;
          status = 'failed';
      }
    } catch (err) {
      output = `Error: ${err.message}`;
      status = 'failed';
    }

    db.prepare(
      'INSERT INTO schedule_tasks (schedule_id, status, output) VALUES (?, ?, ?)'
    ).run(scheduleId, status, output);

    return { status, output };
  }

  static createSchedule(data) {
    const db = this.getDb();
    const { server_id, name, cron_expression, action, command = null, user_id } = data;

    if (!cron.validate(cron_expression)) {
      throw new Error('Invalid cron expression');
    }

    const validActions = ['start', 'stop', 'restart', 'backup', 'command'];
    if (!validActions.includes(action)) {
      throw new Error('Invalid action');
    }

    const result = db.prepare(
      'INSERT INTO schedules (server_id, name, cron_expression, action, command, user_id) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(server_id, name, cron_expression, action, command, user_id || null);

    const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(result.lastInsertRowid);

    this.startTask(schedule);

    UserService.logActivity(user_id, 'schedule_create', 'schedule', schedule.id, `Created schedule "${name}"`);

    return schedule;
  }

  static getSchedules(serverId) {
    const db = this.getDb();
    return db.prepare('SELECT * FROM schedules WHERE server_id = ? ORDER BY created_at DESC').all(serverId);
  }

  static getSchedule(id) {
    const db = this.getDb();
    return db.prepare('SELECT * FROM schedules WHERE id = ?').get(id);
  }

  static updateSchedule(id, data) {
    const db = this.getDb();
    const schedule = this.getSchedule(id);
    if (!schedule) {
      throw new Error('Schedule not found');
    }

    this.stopTask(id);

    const fields = [];
    const values = [];

    if (data.name) {
      fields.push('name = ?');
      values.push(data.name);
    }
    if (data.cron_expression) {
      if (!cron.validate(data.cron_expression)) {
        throw new Error('Invalid cron expression');
      }
      fields.push('cron_expression = ?');
      values.push(data.cron_expression);
    }
    if (data.action) {
      fields.push('action = ?');
      values.push(data.action);
    }
    if (data.enabled !== undefined) {
      fields.push('enabled = ?');
      values.push(data.enabled ? 1 : 0);
    }

    if (fields.length === 0) return this.getSchedule(id);

    values.push(id);
    db.prepare(`UPDATE schedules SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    const updated = this.getSchedule(id);
    if (updated.enabled) {
      this.startTask(updated);
    }

    return updated;
  }

  static deleteSchedule(id, userId) {
    const db = this.getDb();
    const schedule = this.getSchedule(id);
    if (!schedule) {
      throw new Error('Schedule not found');
    }

    this.stopTask(id);

    db.prepare('DELETE FROM schedules WHERE id = ?').run(id);
    UserService.logActivity(userId, 'schedule_delete', 'schedule', id, `Deleted schedule "${schedule.name}"`);

    return schedule;
  }

  static async runScheduleNow(id, userId) {
    const schedule = this.getSchedule(id);
    if (!schedule) {
      throw new Error('Schedule not found');
    }

    const result = await this.executeSchedule(id);
    UserService.logActivity(userId, 'schedule_run', 'schedule', id, `Manually ran schedule "${schedule.name}"`);

    return result;
  }

  static getAllSchedules() {
    const db = this.getDb();
    return db.prepare(`
      SELECT s.*, srv.name as server_name 
      FROM schedules s 
      LEFT JOIN servers srv ON s.server_id = srv.id 
      ORDER BY s.created_at DESC
    `).all();
  }

  static getScheduleStats() {
    const db = this.getDb();
    const total = db.prepare('SELECT COUNT(*) as count FROM schedules').get().count;
    const active = db.prepare('SELECT COUNT(*) as count FROM schedules WHERE enabled = 1').get().count;
    const byAction = db.prepare(
      'SELECT action, COUNT(*) as count FROM schedules GROUP BY action'
    ).all();

    return { total, active, byAction };
  }
}

module.exports = ScheduleService;
