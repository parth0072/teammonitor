// middleware/auth.js – token verification + live is_active check (no expiry)
const jwt  = require('jsonwebtoken');
const db   = require('../db');
const fs   = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '../auth-debug.log');
function authLog(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(LOG_FILE, line); } catch (_) {}
  console.error(msg);
}

module.exports = async (req, res, next) => {
  const header = req.headers['authorization'];
  const token  = header && header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    authLog(`No token provided | path: ${req.path}`);
    return res.status(401).json({ error: 'No token provided' });
  }

  // Step 1: verify JWT signature — only this should produce a 401
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    authLog(`jwt.verify FAILED | error: ${err.message} | JWT_SECRET set: ${!!process.env.JWT_SECRET} | path: ${req.path} | token[:20]: ${token.substring(0,20)}`);
    return res.status(401).json({ error: 'Invalid token' });
  }

  // Step 2: live DB check so admin can deactivate accounts mid-session.
  // If the DB is temporarily unavailable (common on shared hosting after idle),
  // trust the JWT rather than incorrectly logging the user out.
  try {
    const [rows] = await db.query(
      'SELECT id FROM employees WHERE id = ? AND is_active = 1',
      [decoded.id]
    );
    if (!rows.length) {
      authLog(`Account disabled | employee_id: ${decoded.id} | path: ${req.path}`);
      return res.status(401).json({ error: 'Account disabled' });
    }
  } catch (dbErr) {
    authLog(`DB check failed (trusting JWT) | error: ${dbErr.message} | path: ${req.path}`);
    // fall through — token is valid, DB is just momentarily down
  }

  req.user = decoded;
  next();
};

// Admin-only gate (use after auth middleware)
module.exports.adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};
