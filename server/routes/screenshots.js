// routes/screenshots.js – upload + retrieve screenshots (AES-256-GCM encrypted)
const router = require('express').Router();
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');
const jwt    = require('jsonwebtoken');
const db     = require('../db');
const auth   = require('../middleware/auth');
const { adminOnly } = require('../middleware/auth');

// Try to load sharp for image optimization (optional – falls back gracefully)
let sharp;
try { sharp = require('sharp'); } catch (_) { sharp = null; }

// ── Encryption helpers (AES-256-GCM) ─────────────────────────────────────────
// File format: [ 12-byte IV ][ 16-byte authTag ][ ciphertext ]

function getKey() {
  const hex = process.env.SCREENSHOT_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) throw new Error('SCREENSHOT_ENCRYPTION_KEY must be 64 hex chars in .env');
  return Buffer.from(hex, 'hex');
}

function encrypt(buffer) {
  const key    = getKey();
  const iv     = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc    = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]); // 12 + 16 + N bytes
}

function decrypt(encBuffer) {
  const key  = getKey();
  const iv   = encBuffer.slice(0, 12);
  const tag  = encBuffer.slice(12, 28);
  const data = encBuffer.slice(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

// ── Multer: store to temp path, we'll encrypt after ──────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const date = new Date().toISOString().slice(0, 10);
    const dir  = path.join(__dirname, '..', 'uploads', String(req.user.id), date);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_, file, cb) => {
    cb(null, `${Date.now()}.tmp`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    cb(null, file.mimetype === 'image/jpeg');
  },
});

// ── POST /api/screenshots  – upload & encrypt ─────────────────────────────────
router.post('/', auth, upload.single('screenshot'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const { sessionId, activityLevel } = req.body;
  const now  = new Date();
  const date = now.toISOString().slice(0, 10);
  const tmpPath = req.file.path;

  try {
    // Read uploaded file into buffer
    let imgBuf = fs.readFileSync(tmpPath);

    // Optimize with sharp if available
    if (sharp) {
      try {
        imgBuf = await sharp(imgBuf)
          .resize(1280, null, { withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer();
      } catch (_) { /* keep original */ }
    }

    // Encrypt and save as .enc (replace the .tmp file)
    const encBuf  = encrypt(imgBuf);
    const encName = `${path.basename(tmpPath, '.tmp')}.enc`;
    const encPath = path.join(path.dirname(tmpPath), encName);
    fs.writeFileSync(encPath, encBuf);
    fs.unlinkSync(tmpPath); // remove temp file

    // Build serve URL (decrypt route)
    const relativePath = `/api/screenshots/view/${req.user.id}/${date}/${encName}`;
    const fileUrl = process.env.BASE_URL
      ? `${process.env.BASE_URL}${relativePath}`
      : `/teammonitor${relativePath}`;

    const [result] = await db.query(
      'INSERT INTO screenshots (employee_id, session_id, captured_at, file_path, activity_level, date) VALUES (?,?,?,?,?,?)',
      [req.user.id, sessionId || null, now, fileUrl, activityLevel || 100, date]
    );
    res.status(201).json({ id: result.insertId, url: fileUrl });
  } catch (err) {
    try { fs.unlinkSync(tmpPath); } catch (_) {}
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/screenshots/view/:empId/:date/:filename  – decrypt & serve ───────
// Accepts token via ?token= query param (required since <img> can't send headers)
router.get('/view/:empId/:date/:filename', (req, res) => {
  // Auth: accept Bearer header OR ?token= query param
  const token = req.query.token ||
    (req.headers['authorization'] || '').replace('Bearer ', '');

  if (!token) return res.status(401).send('Unauthorized');

  let user;
  try {
    user = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).send('Invalid token');
  }

  // Admins can view any screenshot; employees can only view their own
  if (user.role !== 'admin' && String(user.id) !== String(req.params.empId)) {
    return res.status(403).send('Forbidden');
  }

  const { empId, date, filename } = req.params;

  // Prevent path traversal
  if (!/^\d+$/.test(empId) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^[\w.-]+\.enc$/.test(filename)) {
    return res.status(400).send('Invalid path');
  }

  const encPath = path.join(__dirname, '..', 'uploads', empId, date, filename);
  if (!fs.existsSync(encPath)) return res.status(404).send('Not found');

  try {
    const encBuf = fs.readFileSync(encPath);
    const imgBuf = decrypt(encBuf);
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'private, max-age=3600');
    res.send(imgBuf);
  } catch (err) {
    res.status(500).send('Decryption failed');
  }
});

// ── GET /api/screenshots/mine?date=  (employee – own screenshots only) ────────
router.get('/mine', auth, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const [rows] = await db.query(
      `SELECT s.*, e.name AS employee_name
       FROM screenshots s JOIN employees e ON s.employee_id=e.id
       WHERE s.date=? AND s.employee_id=?
       ORDER BY s.captured_at DESC`,
      [date, req.user.id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/screenshots?date=&employeeId=  (admin) ──────────────────────────
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
