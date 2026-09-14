const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.NETHERPANEL_DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.NETHERPANEL_DB || path.join(DATA_DIR, 'netherpanel.db');

let db = null;

class Database {
  constructor(sqliteDb) {
    this.db = sqliteDb;
    this.inTx = false;
  }

  prepare(sql) {
    return new PreparedStatement(this, sql);
  }

  exec(sql) {
    this.db.run(sql);
    if (!this.inTx) this.save();
  }

  pragma(str) {
    try {
      this.db.run(`PRAGMA ${str}`);
    } catch (e) {
      // Ignore pragma errors
    }
  }

  transaction(fn) {
    return (...args) => {
      this.db.run('BEGIN TRANSACTION');
      this.inTx = true;
      try {
        const result = fn(...args);
        this.db.run('COMMIT');
        this.inTx = false;
        this.save();
        return result;
      } catch (err) {
        this.inTx = false;
        try {
          this.db.run('ROLLBACK');
        } catch (rollbackErr) {
          // Ignore rollback errors
        }
        throw err;
      }
    };
  }

  save() {
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

class PreparedStatement {
  constructor(database, sql) {
    this.database = database;
    this.db = database.db;
    this.sql = sql;
  }

  run(...params) {
    const flatParams = params.flat();
    this.db.run(this.sql, flatParams);

    const lastRow = this.db.exec('SELECT last_insert_rowid() as id');
    const lastInsertRowid = lastRow.length > 0 ? lastRow[0].values[0][0] : 0;

    const changes = this.db.getRowsModified();

    if (!this.database.inTx) {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(DB_PATH, buffer);
    }

    return { lastInsertRowid, changes };
  }

  get(...params) {
    const flatParams = params.flat();
    const stmt = this.db.prepare(this.sql);
    stmt.bind(flatParams);

    if (stmt.step()) {
      const cols = stmt.getColumnNames();
      const values = stmt.get();
      stmt.free();
      const row = {};
      cols.forEach((col, i) => {
        row[col] = values[i];
      });
      return row;
    }

    stmt.free();
    return undefined;
  }

  all(...params) {
    const flatParams = params.flat();
    const results = [];
    const stmt = this.db.prepare(this.sql);
    stmt.bind(flatParams);

    while (stmt.step()) {
      const cols = stmt.getColumnNames();
      const values = stmt.get();
      const row = {};
      cols.forEach((col, i) => {
        row[col] = values[i];
      });
      results.push(row);
    }

    stmt.free();
    return results;
  }
}

async function initDatabase() {
  const SQL = await initSqlJs();

  let existingData = null;
  if (fs.existsSync(DB_PATH)) {
    existingData = fs.readFileSync(DB_PATH);
  }

  const sqliteDb = existingData ? new SQL.Database(existingData) : new SQL.Database();

  db = new Database(sqliteDb);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      avatar TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS servers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      version TEXT NOT NULL DEFAULT '1.21.4',
      server_type TEXT DEFAULT 'paper',
      game_type TEXT DEFAULT 'java',
      port INTEGER DEFAULT 25565,
      ram_min INTEGER DEFAULT 1024,
      ram_max INTEGER DEFAULT 2048,
      status TEXT DEFAULT 'stopped',
      pid INTEGER,
      path TEXT NOT NULL,
      java_args TEXT,
      startup_cmd TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS server_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      content TEXT,
      size INTEGER DEFAULT 0,
      is_directory INTEGER DEFAULT 0,
      path TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS backups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      filename TEXT NOT NULL,
      size INTEGER DEFAULT 0,
      status TEXT DEFAULT 'completed',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      cron_expression TEXT NOT NULL,
      action TEXT NOT NULL,
      command TEXT,
      enabled INTEGER DEFAULT 1,
      last_run DATETIME,
      next_run DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS schedule_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_id INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      output TEXT,
      executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      resource_type TEXT,
      resource_id INTEGER,
      details TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT,
      category TEXT DEFAULT 'general',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS mods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER NOT NULL,
      modrinth_id TEXT,
      name TEXT NOT NULL,
      slug TEXT,
      version TEXT,
      filename TEXT,
      enabled INTEGER DEFAULT 1,
      installed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS crashes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER NOT NULL,
      exit_code INTEGER,
      signal TEXT,
      error_output TEXT,
      log_snippet TEXT,
      detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      type TEXT DEFAULT 'info',
      server_id INTEGER,
      read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS api_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      scopes TEXT DEFAULT 'all',
      expires_at DATETIME,
      last_used_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS server_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT DEFAULT 'member',
      permissions TEXT DEFAULT 'view',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (server_id, user_id),
      FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS server_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      server_type TEXT DEFAULT 'paper',
      version TEXT NOT NULL,
      java_args TEXT,
      config TEXT,
      is_public INTEGER DEFAULT 0,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );
  `);

  // Migrations - add columns that may not exist
  try { db.db.run('ALTER TABLE servers ADD COLUMN startup_cmd TEXT'); } catch (e) {}
  try { db.db.run('ALTER TABLE servers ADD COLUMN subdomain TEXT'); } catch (e) {}
  try { db.db.run('ALTER TABLE schedules ADD COLUMN user_id INTEGER'); } catch (e) {}
  try { db.db.run('ALTER TABLE server_templates ADD COLUMN game_type TEXT DEFAULT \'java\''); } catch (e) {}
  try { db.db.run('ALTER TABLE users ADD COLUMN must_change_password INTEGER DEFAULT 0'); } catch (e) {}

  // Seed owner access rows for existing servers (first-run migration for server_users)
  db.exec(`
    INSERT OR IGNORE INTO server_users (server_id, user_id, role, permissions)
    SELECT id, user_id, 'owner', 'all' FROM servers;
  `);

  const defaultSettings = [
    { key: 'panel_name', value: 'NetherPanel', category: 'general' },
    { key: 'allow_registrations', value: 'true', category: 'security' },
    { key: 'default_ram_min', value: '1024', category: 'server' },
    { key: 'default_ram_max', value: '2048', category: 'server' },
    { key: 'auto_start_servers', value: 'false', category: 'server' },
    { key: 'max_servers_per_user', value: '5', category: 'limits' },
    { key: 'backup_retention_days', value: '30', category: 'backup' },
    { key: 'resource_ram_limit', value: '0', category: 'resource' },
    { key: 'resource_cpu_limit', value: '', category: 'resource' },
    { key: 'ram_per_user', value: '0', category: 'limits' },
  ];

  for (const setting of defaultSettings) {
    const existing = db.prepare('SELECT id FROM settings WHERE key = ?').get(setting.key);
    if (!existing) {
      db.prepare('INSERT INTO settings (key, value, category) VALUES (?, ?, ?)').run(setting.key, setting.value, setting.category);
    }
  }

  // Remove legacy webhook and Cloudflare/domain settings
  db.prepare("DELETE FROM settings WHERE key IN ('webhook_url', 'webhook_events')").run();
  db.prepare("DELETE FROM settings WHERE key LIKE 'cloudflare_%'").run();

  // Seed default server templates (eggs) on first run
  const templateCount = db.prepare('SELECT COUNT(*) as count FROM server_templates').get().count;
  if (templateCount === 0) {
    const defaultTemplates = [
      { name: 'Vanilla Minecraft', description: 'Official Mojang server jar', server_type: 'vanilla', version: '1.21.4', game_type: 'java', java_args: '', is_public: 1 },
      { name: 'Paper', description: 'High-performance fork with plugin support', server_type: 'paper', version: '1.21.4', game_type: 'java', java_args: '-XX:+UseG1GC -XX:MaxGCPauseMillis=200', is_public: 1 },
      { name: 'Fabric', description: 'Lightweight mod loader', server_type: 'fabric', version: '1.21.4', game_type: 'java', java_args: '', is_public: 1 },
      { name: 'Forge', description: 'Classic modding platform', server_type: 'forge', version: '1.20.1-47.2.0', game_type: 'java', java_args: '-XX:+UseG1GC', is_public: 1 },
      { name: 'NeoForge', description: 'Modern Forge fork with active development', server_type: 'neoforge', version: '1.21.0-21.0.167', game_type: 'java', java_args: '-XX:+UseG1GC', is_public: 1 },
      { name: 'PocketMine-MP', description: 'PHP-based Bedrock server software', server_type: 'pocketmine', version: 'latest', game_type: 'bedrock', java_args: '', is_public: 1 },
      { name: 'Nukkit', description: 'Java-based Bedrock server software', server_type: 'nukkit', version: 'latest', game_type: 'bedrock', java_args: '', is_public: 1 },
      { name: 'Bedrock Edition', description: 'Official Bedrock Dedicated Server', server_type: 'bedrock', version: 'latest', game_type: 'bedrock', java_args: '', is_public: 1 }
    ];
    const tplInsert = db.prepare(
      "INSERT INTO server_templates (name, description, server_type, version, game_type, java_args, is_public) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    for (const tpl of defaultTemplates) {
      tplInsert.run(tpl.name, tpl.description, tpl.server_type, tpl.version, tpl.game_type, tpl.java_args, tpl.is_public);
    }
  }

  db.save();

  return db;
}

function getDb() {
  return db;
}

module.exports = { initDatabase, getDb };
