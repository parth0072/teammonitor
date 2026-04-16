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
router.use('/api/reports',      require('./routes/reports'));
router.use('/api/settings',     require('./routes/settings'));
router.use('/api/admin',        require('./routes/admin_commands'));

// ── Cron endpoint — called by cPanel cron, no login needed, secret key only ──
// POST /api/cron/daily-report?secret=YOUR_CRON_SECRET
router.post('/api/cron/daily-report', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(500).json({ error: 'CRON_SECRET not set on server' });
  if (req.query.secret !== secret) return res.status(401).json({ error: 'Invalid secret' });

  try {
    const { sendDailyReports } = require('./utils/dailyMail');
    await sendDailyReports();
    res.json({ ok: true, time: new Date() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
       connected_at     DATETIME DEFAULT CURRENT_TIMESTAMP
     )`,
    `ALTER TABLE tasks     ADD COLUMN IF NOT EXISTS jira_issue_key    VARCHAR(50)  DEFAULT NULL`,
    `ALTER TABLE sessions  ADD COLUMN IF NOT EXISTS jira_issue_key    VARCHAR(50)  DEFAULT NULL`,
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS jira_url          VARCHAR(255) DEFAULT NULL`,
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS jira_email        VARCHAR(150) DEFAULT NULL`,
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS jira_api_token    TEXT         DEFAULT NULL`,
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS screen_permission TINYINT(1)   DEFAULT 1`,

    // Custom productivity policy — admin-defined app categorization rules
    `CREATE TABLE IF NOT EXISTS productivity_rules (
       id         INT AUTO_INCREMENT PRIMARY KEY,
       app_name   VARCHAR(200) NOT NULL,
       category   ENUM('productive','neutral','unproductive') NOT NULL DEFAULT 'neutral',
       created_by INT NOT NULL,
       created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
       UNIQUE KEY uniq_app (app_name)
     )`,

    // AI memory — stores daily focus scores per employee for reminder comparisons
    `CREATE TABLE IF NOT EXISTS employee_daily_memory (
       id                  INT AUTO_INCREMENT PRIMARY KEY,
       employee_id         INT NOT NULL,
       date                DATE NOT NULL,
       total_minutes       INT NOT NULL DEFAULT 0,
       productive_percent  INT NOT NULL DEFAULT 0,
       focus_score         INT NOT NULL DEFAULT 0,
       ai_notes            TEXT DEFAULT NULL,
       created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
       UNIQUE KEY uniq_emp_date (employee_id, date),
       FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
     )`,

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

    // Organisation-wide key/value settings (admins only)
    `CREATE TABLE IF NOT EXISTS org_settings (
       \`key\`       VARCHAR(100) NOT NULL PRIMARY KEY,
       \`value\`     TEXT         NOT NULL,
       updated_at  DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
     )`,
  ];
  for (const sql of migrations) {
    try {
      await db.query(sql);
    } catch (err) {
      console.error('[migration] Failed:', err.message);
    }
  }
  // Seed default org settings if not already present
  const defaultSettings = {
    work_status_options: JSON.stringify(['WFO', 'WFH', 'Remote', 'On-site', 'Hybrid']),
  };
  for (const [key, value] of Object.entries(defaultSettings)) {
    try {
      await db.query(
        'INSERT IGNORE INTO org_settings (`key`, `value`) VALUES (?, ?)',
        [key, value]
      );
    } catch (err) {
      console.error('[migration] Seed failed for', key, err.message);
    }
  }
  console.log('[migration] Schema up to date (employees + jira + org_settings)');
}

// ── Daily report email scheduler ──────────────────────────────────────────────
// Fires at DAILY_REPORT_TIME (HH:MM, default "14:30" = 8:00 PM IST / UTC+5:30).
// Override in .env: DAILY_REPORT_TIME=14:30
function scheduleDailyReports() {
  const { sendDailyReports } = require('./utils/dailyMail');
  const [targetHour, targetMin] = (process.env.DAILY_REPORT_TIME || '14:30')
    .split(':').map(Number);

  function msUntilNext() {
    const now  = new Date();
    const next = new Date(now);
    next.setHours(targetHour, targetMin || 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next - now;
  }

  function scheduleNext() {
    const delay = msUntilNext();
    console.log(`[dailyMail] Next report scheduled in ${Math.round(delay / 60000)} min`);
    setTimeout(async () => {
      await sendDailyReports().catch(err => console.error('[dailyMail] Error:', err.message));
      scheduleNext(); // reschedule for tomorrow
    }, delay);
  }

  scheduleNext();
}

// ── Start ─────────────────────────────────────────────────────────────────────
async function start() {
  await runMigrations();
  app.listen(PORT, () => {
    console.log(`TeamMonitor server running on port ${PORT}`);
    console.log(`Health: http://localhost:${PORT}/teammonitor/api/health`);

    // Screenshot cleanup — on startup then every 24h
    cleanupOldScreenshots();
    setInterval(cleanupOldScreenshots, 24 * 60 * 60 * 1000);

    // Daily email reports — schedule for target hour each day
    scheduleDailyReports();
  });
}
start().catch(err => { console.error('[startup] Fatal:', err.message); process.exit(1); });
