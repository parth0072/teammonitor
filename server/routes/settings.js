// routes/settings.js — organisation-wide settings (admin read/write, any auth read)

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const auth               = require('../middleware/auth');
const { adminOnly }      = require('../middleware/auth');

// GET /api/settings — returns all org settings as { key: parsedValue }
// Open to any authenticated user so the macOS app can read status options.
router.get('/', auth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT `key`, `value` FROM org_settings');
    const out = {};
    for (const row of rows) {
      try { out[row.key] = JSON.parse(row.value); }
      catch { out[row.key] = row.value; }
    }
    res.json(out);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/settings — upsert one or many settings keys (admin only)
// Body: { work_status_options: ["WFO","WFH","Remote"] }
router.put('/', auth, adminOnly, async (req, res) => {
  try {
    const updates = req.body;
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'Body must be a JSON object' });
    }
    for (const [key, value] of Object.entries(updates)) {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      await db.query(
        'INSERT INTO org_settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value`=?',
        [key, serialized, serialized]
      );
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
