// routes/screenshots.js – upload + retrieve screenshots
const router = require('express').Router();
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const db     = require('../db');
const auth   = require('../middleware/auth');
const { adminOnly } = require('../middleware/auth');

// Try to load sharp for image optimization (optional – falls back gracefully)
let sharp;
try { sharp = require('sharp'); } catch (_) { sharp = null; }

// Store files in uploads/<employeeId>/<date>/
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const date = new Date().toISOString().slice(0, 10);
    const dir  = path.join(__dirname, '..', 'uploads', String(req.user.id), date);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_, file, cb) => {
    cb(null, `${Date.now()}.jpg`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
  fileFilter: (_, file, cb) => {
    cb(null, file.mimetype === 'image/jpeg');
  },
});

// POST /api/screenshots  – upload a screenshot (from macOS agent)
router.post('/', auth, upload.single('screenshot'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const { sessionId, activityLevel } = req.body;
  const now  = new Date();
  const date = now.toISOString().slice(0, 10);

  // Optimize image with sharp if available (resize to max 1280px, 80% JPEG quality)
  if (sharp) {
    try {
      const buf = await sharp(req.file.path)
        .resize(1280, null, { withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
      fs.writeFileSync(req.file.path, buf);
    } catch (_) { /* optimization failed – keep original */ }
  }

  // Build URL: use BASE_URL env var if set, otherwise use relative /teammonitor path
  const relativePath = `/uploads/${req.user.id}/${date}/${req.file.filename}`;
  const fileUrl = process.env.BASE_URL
    ? `${process.env.BASE_URL}${relativePath}`
    : `/teammonitor${relativePath}`;

  try {
    const [result] = await db.query(
      'INSERT INTO screenshots (employee_id, session_id, captured_at, file_path, activity_level, date) VALUES (?,?,?,?,?,?)',
      [req.user.id, sessionId || null, now, fileUrl, activityLevel || 100, date]
    );
    res.status(201).json({ id: result.insertId, url: fileUrl });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/screenshots?date=&employeeId=  (admin)
router.get('/', auth, adminOnly, async (req, res) => {
  try {
    const date  = req.query.date || new Date().toISOString().slice(0, 10);
    const empId = req.query.employeeId;
    let sql = `SELECT s.*, e.name AS employee_name
               FROM screenshots s JOIN employees e ON s.employee_id=e.id
               WHERE s.date=?`;
    const params = [date];
    if (empId) { sql += ' AND s.employee_id=?'; params.push(empId); }
    sql += ' ORDER BY s.captured_at DESC';
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
