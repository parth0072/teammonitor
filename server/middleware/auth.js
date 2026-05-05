// middleware/auth.js – token verification + live is_active check (no expiry)
const jwt = require('jsonwebtoken');
const db  = require('../db');

module.exports = async (req, res, next) => {
  const header = req.headers['authorization'];
  const token  = header && header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) return res.status(401).json({ error: 'No token provided' });

  // Step 1: verify JWT signature — only this should produce a 401
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
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
    if (!rows.length) return res.status(401).json({ error: 'Account disabled' });
  } catch (dbErr) {
    console.error('[auth] DB check failed, trusting JWT:', dbErr.message);
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
