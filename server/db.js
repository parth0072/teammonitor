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

  // Force every connection to use UTC so NOW() always returns UTC regardless
  // of the cPanel/MySQL server's local timezone setting.
  pool.on('connection', (conn) => {
    conn.query("SET time_zone = '+00:00'", (err) => {
      if (err) console.error('[db] Failed to set time_zone:', err.message);
    });
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
    await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS screen_permission TINYINT(1) DEFAULT 1`).catch(() => {});
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
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_heartbeat_at DATETIME DEFAULT NULL`).catch(() => {});
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS jira_issue_summary VARCHAR(500) DEFAULT NULL`).catch(() => {});
    await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS agent_version VARCHAR(20) DEFAULT NULL`).catch(() => {});
    await pool.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active'`).catch(() => {});
    await pool.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS created_by INT DEFAULT NULL`).catch(() => {});
    await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS created_by INT DEFAULT NULL`).catch(() => {});
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
      CREATE TABLE IF NOT EXISTS session_breaks (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        session_id  INT NOT NULL,
        employee_id INT NOT NULL,
        break_start DATETIME NOT NULL,
        break_end   DATETIME DEFAULT NULL,
        date        DATE     NOT NULL,
        KEY (session_id),
        KEY (employee_id, date)
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

    // ── Leave management ──────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS leave_types (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        name         VARCHAR(100) NOT NULL,
        color        VARCHAR(20)  DEFAULT '#3b82f6',
        default_days DECIMAL(4,1) DEFAULT 0,
        is_paid      TINYINT(1)   DEFAULT 1,
        is_active    TINYINT(1)   DEFAULT 1,
        created_at   DATETIME     DEFAULT NOW()
      )`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS leave_balances (
        id             INT AUTO_INCREMENT PRIMARY KEY,
        employee_id    INT NOT NULL,
        leave_type_id  INT NOT NULL,
        year           INT NOT NULL,
        allocated_days DECIMAL(4,1) DEFAULT 0,
        used_days      DECIMAL(4,1) DEFAULT 0,
        UNIQUE KEY uq_emp_type_year (employee_id, leave_type_id, year)
      )`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS leave_requests (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        employee_id   INT NOT NULL,
        leave_type_id INT NOT NULL,
        from_date     DATE NOT NULL,
        to_date       DATE NOT NULL,
        days          DECIMAL(4,1) DEFAULT 1,
        reason        TEXT,
        status        VARCHAR(20)  DEFAULT 'pending',
        reviewed_by   INT          DEFAULT NULL,
        reviewed_at   DATETIME     DEFAULT NULL,
        reviewer_note TEXT,
        created_at    DATETIME     DEFAULT NOW()
      )`);

    // ── Admin remote commands ─────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_commands (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        employee_id  INT          DEFAULT NULL,
        command_type VARCHAR(50)  NOT NULL,
        payload      TEXT         DEFAULT NULL,
        status       VARCHAR(20)  DEFAULT 'pending',
        created_by   INT          NOT NULL,
        created_at   DATETIME     DEFAULT NOW(),
        delivered_at DATETIME     DEFAULT NULL
      )`);
    await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS tracking_locked TINYINT DEFAULT 0`).catch(() => {});
    await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS last_lat DECIMAL(10,7) DEFAULT NULL`).catch(() => {});
    await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS last_lng DECIMAL(10,7) DEFAULT NULL`).catch(() => {});
    await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS last_location_at DATETIME DEFAULT NULL`).catch(() => {});
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_manual TINYINT(1) DEFAULT 0`).catch(() => {});
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS note VARCHAR(500) DEFAULT NULL`).catch(() => {});
    await pool.query(`
      CREATE TABLE IF NOT EXISTS performance_logs (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        employee_id  INT          NOT NULL,
        logged_by    INT          NOT NULL,
        rating       VARCHAR(10)  NOT NULL,
        category     VARCHAR(50)  NOT NULL,
        title        VARCHAR(200) NOT NULL,
        description  TEXT         DEFAULT NULL,
        event_date   DATE         NOT NULL,
        event_time   VARCHAR(8)   DEFAULT NULL,
        created_at   DATETIME     DEFAULT NOW()
      )`).catch(() => {});

    // One-time cleanup: remove false idle_logs created by overly-aggressive heartbeat gap
    // detection (threshold was idle_stop_minutes instead of idle_stop_minutes+6, causing
    // every normal 5-min heartbeat to insert a 5-min idle_log). IDs 46-59 are the known
    // false entries created on 2026-05-11 before the threshold was corrected.
    await pool.query(`DELETE FROM idle_logs WHERE id IN (46,47,48,49,50,51,52,53,54,55,56,57,58,59)`).catch(() => {});

    // Close any orphaned open session_break rows from past days (break_end IS NULL but
    // the session is completed or the date is before today). These cause the timeline to
    // show the employee as "on break" for the rest of the day even when they were active.
    await pool.query(`
      UPDATE session_breaks sb
      JOIN sessions s ON s.id = sb.session_id
      SET sb.break_end = COALESCE(s.punch_out, sb.break_start + INTERVAL 1 MINUTE)
      WHERE sb.break_end IS NULL
        AND (s.status = 'completed' OR sb.date < CURDATE())
    `).catch(() => {});

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
    CREATE TABLE IF NOT EXISTS leave_types (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT NOT NULL,
      color        TEXT DEFAULT '#3b82f6',
      default_days REAL DEFAULT 0,
      is_paid      INTEGER DEFAULT 1,
      is_active    INTEGER DEFAULT 1,
      created_at   TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS leave_balances (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id    INTEGER NOT NULL,
      leave_type_id  INTEGER NOT NULL,
      year           INTEGER NOT NULL,
      allocated_days REAL DEFAULT 0,
      used_days      REAL DEFAULT 0,
      UNIQUE(employee_id, leave_type_id, year)
    );
    CREATE TABLE IF NOT EXISTS leave_requests (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id   INTEGER NOT NULL,
      leave_type_id INTEGER NOT NULL,
      from_date     TEXT NOT NULL,
      to_date       TEXT NOT NULL,
      days          REAL DEFAULT 1,
      reason        TEXT,
      status        TEXT DEFAULT 'pending',
      reviewed_by   INTEGER DEFAULT NULL,
      reviewed_at   TEXT DEFAULT NULL,
      reviewer_note TEXT,
      created_at    TEXT DEFAULT (datetime('now'))
    );
  `);

  // Migrate existing databases that predate new columns
  const migrations = [
    `ALTER TABLE employees ADD COLUMN screenshot_interval INTEGER DEFAULT 300`,
    `ALTER TABLE employees ADD COLUMN screen_permission INTEGER DEFAULT 1`,
    `ALTER TABLE sessions  ADD COLUMN task_id INTEGER DEFAULT NULL`,
    `ALTER TABLE projects  ADD COLUMN status     TEXT DEFAULT 'active'`,
    `ALTER TABLE projects  ADD COLUMN created_by INTEGER DEFAULT NULL`,
    `ALTER TABLE tasks     ADD COLUMN created_by INTEGER DEFAULT NULL`,
    `ALTER TABLE employees ADD COLUMN tracking_locked INTEGER DEFAULT 0`,
    `ALTER TABLE sessions  ADD COLUMN jira_issue_key     TEXT DEFAULT NULL`,
    `ALTER TABLE sessions  ADD COLUMN jira_issue_summary TEXT DEFAULT NULL`,
    `CREATE TABLE IF NOT EXISTS admin_commands (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id  INTEGER DEFAULT NULL,
      command_type TEXT NOT NULL,
      payload      TEXT DEFAULT NULL,
      status       TEXT DEFAULT 'pending',
      created_by   INTEGER NOT NULL,
      created_at   TEXT DEFAULT (datetime('now')),
      delivered_at TEXT DEFAULT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS performance_logs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id  INTEGER NOT NULL,
      logged_by    INTEGER NOT NULL,
      rating       TEXT    NOT NULL,
      category     TEXT    NOT NULL,
      title        TEXT    NOT NULL,
      description  TEXT    DEFAULT NULL,
      event_date   TEXT    NOT NULL,
      event_time   TEXT    DEFAULT NULL,
      created_at   TEXT    DEFAULT (datetime('now'))
    )`,
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
