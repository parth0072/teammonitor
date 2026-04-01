// index.js – TeamMonitor Express server
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const db      = require('./db');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','OPTIONS'] }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Mount everything under /teammonitor  (cPanel proxy path) ──────────────────
const router = express.Router();

// Screenshots
router.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API routes
router.use('/api/auth',        require('./routes/auth'));
router.use('/api/employees',   require('./routes/employees'));
router.use('/api/sessions',    require('./routes/sessions'));
router.use('/api/activity',    require('./routes/activity'));
router.use('/api/screenshots', require('./routes/screenshots'));
router.use('/api/projects',    require('./routes/projects'));
router.use('/api/jira',        require('./routes/jira'));
router.use('/api/timeline',    require('./routes/timeline'));
router.use('/api/leaves',      require('./routes/leaves'));
router.use('/api/productivity', require('./routes/productivity'));
router.use('/api/bug-reports',  require('./routes/bug-reports'));

// Health check
router.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', time: new Date() });
  } catch (err) {
    res.status(500).json({ status: 'error', db: err.message });
  }
});

// Serve React admin panel static files
const PUBLIC_DIR = path.join(__dirname, 'public');
if (fs.existsSync(PUBLIC_DIR)) {
  router.use(express.static(PUBLIC_DIR));
  // SPA fallback
  router.get('*', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
}

// Mount router at /teammonitor  AND  / (works for both cPanel proxy and local dev)
app.use('/teammonitor', router);
app.use('/', router);

// ── 90-day screenshot cleanup (files + DB records only) ──────────────────────
async function cleanupOldScreenshots() {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const [rows] = await db.query(
      'SELECT id, file_path FROM screenshots WHERE captured_at < ?',
      [cutoff]
    );
    if (!rows.length) return;
    for (const row of rows) {
      // Delete the physical image file only — no other data touched
      // Supports both old URL format (/uploads/...) and new encrypted format (/view/empId/date/file.enc)
      const fp = row.file_path || '';
      const newMatch = fp.match(/\/view\/(\d+\/\d{4}-\d{2}-\d{2}\/[\w.-]+\.enc)/);
      const oldMatch = fp.match(/\/uploads\/(.+)$/);
      const rel = newMatch ? newMatch[1] : (oldMatch ? oldMatch[1] : null);
      if (rel) {
        const diskPath = path.join(__dirname, 'uploads', rel);
        try { if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath); } catch (_) {}
      }
    }
    const ids = rows.map(r => r.id);
    await db.query(`DELETE FROM screenshots WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
    console.log(`[cleanup] Deleted ${ids.length} screenshot files older than 90 days`);
  } catch (err) {
    console.error('[cleanup] Screenshot cleanup error:', err.message);
  }
}

// ── DB migrations (idempotent — safe to run on every startup) ────────────────
async function runMigrations() {
  const migrations = [
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS break_enabled          TINYINT(1) NOT NULL DEFAULT 0`,
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS break_interval_minutes INT        NOT NULL DEFAULT 60`,
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS idle_warning_minutes   INT        NOT NULL DEFAULT 2`,
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS idle_stop_minutes      INT        NOT NULL DEFAULT 5`,
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS screenshots_enabled    TINYINT(1) NOT NULL DEFAULT 1`,

    // Jira integration — dedicated credentials table + issue key on tasks
    `CREATE TABLE IF NOT EXISTS jira_credentials (
       id               INT AUTO_INCREMENT PRIMARY KEY,
       employee_id      INT NOT NULL UNIQUE,
       site_url         VARCHAR(255) NOT NULL,
       email            VARCHAR(150) NOT NULL,
       api_token        TEXT NOT NULL,
       jira_account_id  VARCHAR(100) DEFAULT NULL,
       display_name     VARCHAR(150) DEFAULT NULL,
       connected_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
       FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
     )`,
    `ALTER TABLE tasks     ADD COLUMN IF NOT EXISTS jira_issue_key    VARCHAR(50)  DEFAULT NULL`,
    `ALTER TABLE sessions  ADD COLUMN IF NOT EXISTS jira_issue_key    VARCHAR(50)  DEFAULT NULL`,
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS jira_url          VARCHAR(255) DEFAULT NULL`,
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS jira_email        VARCHAR(150) DEFAULT NULL`,
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS jira_api_token    TEXT         DEFAULT NULL`,
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS screen_permission TINYINT(1)   DEFAULT 1`,

    // Bug reports — submitted from the macOS agent
    `CREATE TABLE IF NOT EXISTS bug_reports (
       id          INT AUTO_INCREMENT PRIMARY KEY,
       employee_id INT NOT NULL,
       category    VARCHAR(50)  NOT NULL DEFAULT 'Other',
       description TEXT         NOT NULL,
       diagnostics JSON         DEFAULT NULL,
       status      ENUM('open','in_progress','resolved') NOT NULL DEFAULT 'open',
       created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
       FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
     )`,
  ];
  for (const sql of migrations) {
    try {
      await db.query(sql);
    } catch (err) {
      console.error('[migration] Failed:', err.message);
    }
  }
  console.log('[migration] Schema up to date (employees + jira)');
}

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`TeamMonitor server running on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/teammonitor/api/health`);

  runMigrations();

  // Run cleanup once on startup, then every 24 hours
  cleanupOldScreenshots();
  setInterval(cleanupOldScreenshots, 24 * 60 * 60 * 1000);
});
