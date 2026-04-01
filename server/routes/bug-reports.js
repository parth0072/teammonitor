// routes/bug-reports.js – employee bug/issue reports from the macOS agent
const router = require('express').Router();
const db     = require('../db');
const auth   = require('../middleware/auth');
const { adminOnly } = require('../middleware/auth');

// POST /api/bug-reports  (any authenticated employee)
router.post('/', auth, async (req, res) => {
  const { category, description, diagnostics } = req.body;
  if (!description || !description.trim()) {
    return res.status(400).json({ error: 'description required' });
  }
  const [r] = await db.query(
    `INSERT INTO bug_reports (employee_id, category, description, diagnostics)
     VALUES (?, ?, ?, ?)`,
    [
      req.employee.id,
      category || 'Other',
      description.trim(),
      diagnostics ? JSON.stringify(diagnostics) : null,
    ]
  );
  res.status(201).json({ id: r.insertId });
});

// GET /api/bug-reports  (admin only)
router.get('/', auth, adminOnly, async (req, res) => {
  const [rows] = await db.query(
    `SELECT br.*, e.name AS employee_name, e.email AS employee_email
     FROM bug_reports br
     JOIN employees e ON e.id = br.employee_id
     ORDER BY br.created_at DESC
     LIMIT 200`
  );
  res.json(rows);
});

// PUT /api/bug-reports/:id/status  (admin only)
router.put('/:id/status', auth, adminOnly, async (req, res) => {
  const { status } = req.body;
  if (!['open', 'in_progress', 'resolved'].includes(status)) {
    return res.status(400).json({ error: 'invalid status' });
  }
  await db.query('UPDATE bug_reports SET status=? WHERE id=?', [status, req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
