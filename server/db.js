// db.js – Auto-detecting database adapter
//
// • cPanel / production  → DB_HOST set in .env → uses MySQL (pure JS, no compilation)
// • Local dev            → no DB_HOST           → uses SQLite (better-sqlite3)
//
// Both expose the same async query(sql, params) interface.

require('dotenv').config();

// ─────────────────────────────────────────────────────────────────────────────
// Decide mode AFTER dotenv has loaded
// ─────────────────────────────────────────────────────────────────────────────
const USE_MYSQL = !!process.env.DB_HOST;

if (USE_MYSQL) {
  // ── MySQL mode (cPanel) ──────────────────────────────────────────────────
  const mysql  = require('mysql2/promise');
  const bcrypt = require('bcryptjs');

  if (!process.env.DB_NAME || !process.env.DB_USER) {
    console.error('');
    console.error('ERROR: .env file is missing or incomplete.');
    console.error('Please create /teammonitor/server/.env with DB_HOST, DB_NAME, DB_USER, DB_PASS');
    console.error('');
    process.exit(1);
  }

  const pool = mysql.createPool({
    host:               process.env.DB_HOST,
    port:               parseInt(process.env.DB_PORT || '3306'),
    database:           process.env.DB_NAME,
    user:               process.env.DB_USER,
    password:           process.env.DB_PASS || '',
    waitForConnections: true,
    connectionLimit:    10,
    timezone:           '+00:00',
  });

  // Run schema + seed on startup
  async function initDB() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS employees (
        id                  INT AUTO_INCREMENT PRIMARY KEY,
        name                VARCHAR(255) NOT NULL,
        email               VARCHAR(255) NOT NULL UNIQUE,
        password            VARCHAR(255) NOT NULL,
        department          VARCHAR(255) DEFAULT '',
        role                VARCHAR(50)  DEFAULT 'employee',
        is_active           TINYINT(1)   DEFAULT 1,
        screenshot_interval INT          DEFAULT 300,
        created_at          DATETIME     DEFAULT NOW()
      )`);
    // Add screenshot_interval to existing tables that predate this column
    await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS screenshot_interval INT DEFAULT 300`).catch(() => {});
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id             INT AUTO_INCREMENT PRIMARY KEY,
        employee_id    INT NOT NULL,
        task_id        INT          DEFAULT NULL,
        punch_in       DATETIME,
        punch_out      DATETIME,
        total_minutes  INT         DEFAULT 0,
        status         VARCHAR(20) DEFAULT 'active',
        date           DATE        NOT NULL,
        created_at     DATETIME    DEFAULT NOW()
      )`);
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS task_id INT DEFAULT NULL`).catch(() => {});
    await pool.query(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id               INT AUTO_INCREMENT PRIMARY KEY,
        employee_id      INT NOT NULL,
        session_id       INT,
        app_name         VARCHAR(255),
        window_title     TEXT,
        start_time       DATETIME,
        end_time         DATETIME,
        duration_seconds INT      DEFAULT 0,
        date             DATE,
        created_at       DATETIME DEFAULT NOW()
      )`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS screenshots (
        id             INT AUTO_INCREMENT PRIMARY KEY,
        employee_id    INT NOT NULL,
        session_id     INT,
        captured_at    DATETIME,
        file_path      TEXT,
        activity_level INT      DEFAULT 100,
        date           DATE,
        created_at     DATETIME DEFAULT NOW()
      )`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS idle_logs (
        id               INT AUTO_INCREMENT PRIMARY KEY,
        employee_id      INT NOT NULL,
        session_id       INT,
        idle_start       DATETIME,
        idle_end         DATETIME,
        duration_seconds INT      DEFAULT 0,
        date             DATE,
        created_at       DATETIME DEFAULT NOW()
      )`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        name        VARCHAR(255) NOT NULL,
        description TEXT         DEFAULT '',
        color       VARCHAR(20)  DEFAULT '#3b82f6',
        created_at  DATETIME     DEFAULT NOW()
      )`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id             INT AUTO_INCREMENT PRIMARY KEY,
        project_id     INT NOT NULL,
        name           VARCHAR(255) NOT NULL,
        description    TEXT         DEFAULT '',
        status         VARCHAR(20)  DEFAULT 'todo',
        assigned_to    INT          DEFAULT NULL,
        created_at     DATETIME     DEFAULT NOW()
      )`);
    console.log('✓  MySQL connected:', process.env.DB_NAME);
  }

  initDB().catch(err => {
    console.error('DB init error:', err.message);
    process.exit(1);
  });

  module.exports = pool;

} else {
  // ── SQLite mode (local dev) ───────────────────────────────────────────────
  let Database;
  try {
    Database = require('better-sqlite3');
  } catch (e) {
    console.error('');
    console.error('ERROR: better-sqlite3 not installed and no DB_HOST set.');
    console.error('For local dev: run  npm install  in the server folder.');
    console.error('For cPanel:    create a .env file with DB_HOST, DB_NAME, DB_USER, DB_PASS');
    console.error('');
    process.exit(1);
  }

  const path   = require('path');
  const bcrypt = require('bcryptjs');

  const DB_PATH = path.join(__dirname, 'teammonitor.sqlite');
  const db      = new Database(DB_PATH);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS employees (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      name                TEXT NOT NULL,
      email               TEXT NOT NULL UNIQUE,
      password            TEXT NOT NULL,
      department          TEXT DEFAULT '',
      role                TEXT DEFAULT 'employee',
      is_active           INTEGER DEFAULT 1,
      screenshot_interval INTEGER DEFAULT 300,
      created_at          TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id    INTEGER NOT NULL,
      task_id        INTEGER DEFAULT NULL,
      punch_in       TEXT,
      punch_out      TEXT,
      total_minutes  INTEGER DEFAULT 0,
      status         TEXT DEFAULT 'active',
      date           TEXT NOT NULL,
      created_at     TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS activity_logs (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id      INTEGER NOT NULL,
      session_id       INTEGER,
      app_name         TEXT,
      window_title     TEXT,
      start_time       TEXT,
      end_time         TEXT,
      duration_seconds INTEGER DEFAULT 0,
      date             TEXT,
      created_at       TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS screenshots (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id    INTEGER NOT NULL,
      session_id     INTEGER,
      captured_at    TEXT,
      file_path      TEXT,
      activity_level INTEGER DEFAULT 100,
      date           TEXT,
      created_at     TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS idle_logs (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id      INTEGER NOT NULL,
      session_id       INTEGER,
      idle_start       TEXT,
      idle_end         TEXT,
      duration_seconds INTEGER DEFAULT 0,
      date             TEXT,
      created_at       TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS projects (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      description TEXT DEFAULT '',
      color       TEXT DEFAULT '#3b82f6',
      created_at  TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id  INTEGER NOT NULL,
      name        TEXT NOT NULL,
      description TEXT DEFAULT '',
      status      TEXT DEFAULT 'todo',
      assigned_to INTEGER DEFAULT NULL,
      created_at  TEXT DEFAULT (datetime('now'))
    );
  `);

  // Migrate existing databases that predate new columns
  const migrations = [
    `ALTER TABLE employees ADD COLUMN screenshot_interval INTEGER DEFAULT 300`,
    `ALTER TABLE sessions  ADD COLUMN task_id INTEGER DEFAULT NULL`,
  ];
  for (const m of migrations) {
    try { db.exec(m); } catch (_) { /* column already exists */ }
  }

  const existingAdmin = db.prepare("SELECT id FROM employees WHERE role='admin' LIMIT 1").get();
  if (!existingAdmin) {
    const hash = bcrypt.hashSync('Admin1234', 10);
    db.prepare(
      "INSERT INTO employees (name, email, password, role) VALUES ('Admin','admin@teammonitor.local',?,?)"
    ).run(hash, 'admin');
    console.log('✓  Admin created: admin@teammonitor.local / Admin1234');
  }
  console.log('✓  SQLite ready:', DB_PATH);

  function translateSQL(sql) {
    return sql
      .replace(/DATE_SUB\s*\(\s*CURDATE\(\s*\)\s*,\s*INTERVAL\s+(\d+)\s+DAY\s*\)/gi, (_, n) => {
        const d = new Date(); d.setDate(d.getDate() - parseInt(n));
        return `'${d.toISOString().slice(0, 10)}'`;
      })
      // TIMESTAMPDIFF(MINUTE, col, NOW()) → SQLite julianday math
      .replace(/TIMESTAMPDIFF\s*\(\s*MINUTE\s*,\s*([^,]+?)\s*,\s*([^)]+?)\s*\)/gi, (_, t1, t2) =>
        `CAST((julianday(${t2.trim()}) - julianday(${t1.trim()})) * 24 * 60 AS INTEGER)`)
      .replace(/CURDATE\(\s*\)/gi, `'${new Date().toISOString().slice(0, 10)}'`)
      .replace(/NOW\(\s*\)/gi,     `'${new Date().toISOString()}'`);
  }

  function query(sql, params = []) {
    return new Promise((resolve, reject) => {
      try {
        const tsql = translateSQL(sql);
        const args = (params || []).map(p => (p == null ? null : p instanceof Date ? p.toISOString() : p));
        const upper = tsql.trim().toUpperCase();
        if (upper.startsWith('SELECT') || upper.startsWith('WITH')) {
          resolve([db.prepare(tsql).all(...args), []]);
        } else if (upper.startsWith('INSERT')) {
          const info = db.prepare(tsql).run(...args);
          resolve([{ insertId: info.lastInsertRowid, affectedRows: info.changes }, []]);
        } else {
          const info = db.prepare(tsql).run(...args);
          resolve([{ affectedRows: info.changes, changedRows: info.changes }, []]);
        }
      } catch (err) { reject(err); }
    });
  }

  module.exports = { query, execute: query };
}
