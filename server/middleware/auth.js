// middleware/auth.js – token verification + live is_active check (no expiry)
const jwt = require('jsonwebtoken');
const db  = require('../db');

module.exports = async (req, res, next) => {
  const header = req.headers['authorization'];
  const token  = header && header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Live DB check — 401 immediately if admin deactivates the account mid-session
    const [rows] = await db.query(
      'SELECT id FROM employees WHERE id = ? AND is_active = 1',
      [decoded.id]
    );
    if (!rows.length) return res.status(401).json({ error: 'Account disabled' });

    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Admin-only gate (use after auth middleware)
module.exports.adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};
