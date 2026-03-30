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
router.use('/api/timeline',    require('./routes/timeline'));

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

// ── 30-day screenshot cleanup ─────────────────────────────────────────────────
async function cleanupOldScreenshots() {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const [rows] = await db.query(
      'SELECT id, file_path FROM screenshots WHERE captured_at < ?',
      [cutoff]
    );
    if (!rows.length) return;
    for (const row of rows) {
      // Extract the /uploads/... portion of the URL and map to disk path
      const match = (row.file_path || '').match(/\/uploads\/(.+)$/);
      if (match) {
        const diskPath = path.join(__dirname, 'uploads', match[1]);
        try { if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath); } catch (_) {}
      }
    }
    const ids = rows.map(r => r.id);
    await db.query(`DELETE FROM screenshots WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
    console.log(`[cleanup] Deleted ${ids.length} screenshots older than 30 days`);
  } catch (err) {
    console.error('[cleanup] Screenshot cleanup error:', err.message);
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`TeamMonitor server running on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/teammonitor/api/health`);

  // Run cleanup once on startup, then every 24 hours
  cleanupOldScreenshots();
  setInterval(cleanupOldScreenshots, 24 * 60 * 60 * 1000);
});
