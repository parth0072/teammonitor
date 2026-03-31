// routes/leaves.js – leave types, balances, requests
const router = require('express').Router();
const db     = require('../db');
const auth   = require('../middleware/auth');
const { adminOnly } = require('../middleware/auth');

// ── Leave Types ───────────────────────────────────────────────────────────────

// GET /api/leaves/types  (everyone)
router.get('/types', auth, async (req, res) => {
  const [rows] = await db.query('SELECT * FROM leave_types ORDER BY name');
  res.json(rows);
});

// POST /api/leaves/types  (admin)
router.post('/types', auth, adminOnly, async (req, res) => {
  const { name, color = '#3b82f6', default_days = 0, is_paid = 1 } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const [r] = await db.query(
    'INSERT INTO leave_types (name, color, default_days, is_paid) VALUES (?,?,?,?)',
    [name, color, default_days, is_paid ? 1 : 0]
  );
  res.status(201).json({ id: r.insertId });
});

// PUT /api/leaves/types/:id  (admin)
router.put('/types/:id', auth, adminOnly, async (req, res) => {
  const { name, color, default_days, is_paid, is_active } = req.body;
  await db.query(
    'UPDATE leave_types SET name=?, color=?, default_days=?, is_paid=?, is_active=? WHERE id=?',
    [name, color, default_days, is_paid ? 1 : 0, is_active ? 1 : 0, req.params.id]
  );
  res.json({ ok: true });
});

// DELETE /api/leaves/types/:id  (admin)
router.delete('/types/:id', auth, adminOnly, async (req, res) => {
  await db.query('UPDATE leave_types SET is_active=0 WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// ── Leave Requests ────────────────────────────────────────────────────────────

// GET /api/leaves/requests  (admin = all; employee = own)
router.get('/requests', auth, async (req, res) => {
  const { status, employeeId } = req.query;
  let sql = `SELECT lr.*, e.name AS employee_name, lt.name AS leave_type_name,
               lt.color AS leave_type_color, lt.is_paid,
               rev.name AS reviewer_name
             FROM leave_requests lr
             JOIN employees e  ON lr.employee_id   = e.id
             JOIN leave_types lt ON lr.leave_type_id = lt.id
             LEFT JOIN employees rev ON lr.reviewed_by = rev.id
             WHERE 1=1`;
  const params = [];
  if (req.user.role !== 'admin') {
    sql += ' AND lr.employee_id=?'; params.push(req.user.id);
  } else if (employeeId) {
    sql += ' AND lr.employee_id=?'; params.push(employeeId);
  }
  if (status) { sql += ' AND lr.status=?'; params.push(status); }
  sql += ' ORDER BY lr.created_at DESC';
  const [rows] = await db.query(sql, params);
  res.json(rows);
});

// POST /api/leaves/requests  (employee submits)
router.post('/requests', auth, async (req, res) => {
  const { leave_type_id, from_date, to_date, days, reason } = req.body;
  if (!leave_type_id || !from_date || !to_date) return res.status(400).json({ error: 'leave_type_id, from_date, to_date required' });

  // Check balance
  const year = new Date(from_date).getFullYear();
  const [[bal]] = await db.query(
    'SELECT * FROM leave_balances WHERE employee_id=? AND leave_type_id=? AND year=?',
    [req.user.id, leave_type_id, year]
  );
  const remaining = bal ? (bal.allocated_days - bal.used_days) : 0;
  const requested = parseFloat(days) || 1;
  if (bal && remaining < requested) {
    return res.status(400).json({ error: `Insufficient balance. Available: ${remaining} day(s)` });
  }

  const [r] = await db.query(
    'INSERT INTO leave_requests (employee_id, leave_type_id, from_date, to_date, days, reason) VALUES (?,?,?,?,?,?)',
    [req.user.id, leave_type_id, from_date, to_date, requested, reason || '']
  );
  res.status(201).json({ id: r.insertId });
});

// PUT /api/leaves/requests/:id/approve  (admin)
router.put('/requests/:id/approve', auth, adminOnly, async (req, res) => {
  const { note } = req.body;
  const [[req_row]] = await db.query('SELECT * FROM leave_requests WHERE id=?', [req.params.id]);
  if (!req_row) return res.status(404).json({ error: 'Not found' });
  if (req_row.status !== 'pending') return res.status(400).json({ error: 'Request is not pending' });

  await db.query(
    'UPDATE leave_requests SET status=?, reviewed_by=?, reviewed_at=NOW(), reviewer_note=? WHERE id=?',
    ['approved', req.user.id, note || '', req.params.id]
  );

  // Deduct from balance
  const year = new Date(req_row.from_date).getFullYear();
  await db.query(
    `INSERT INTO leave_balances (employee_id, leave_type_id, year, allocated_days, used_days)
     VALUES (?,?,?,0,?)
     ON DUPLICATE KEY UPDATE used_days = used_days + ?`,
    [req_row.employee_id, req_row.leave_type_id, year, req_row.days, req_row.days]
  ).catch(async () => {
    // SQLite fallback (no ON DUPLICATE KEY)
    const [[bal]] = await db.query(
      'SELECT * FROM leave_balances WHERE employee_id=? AND leave_type_id=? AND year=?',
      [req_row.employee_id, req_row.leave_type_id, year]
    );
    if (bal) {
      await db.query('UPDATE leave_balances SET used_days=used_days+? WHERE id=?', [req_row.days, bal.id]);
    } else {
      await db.query('INSERT INTO leave_balances (employee_id,leave_type_id,year,allocated_days,used_days) VALUES (?,?,?,0,?)',
        [req_row.employee_id, req_row.leave_type_id, year, req_row.days]);
    }
  });

  res.json({ ok: true });
});

// PUT /api/leaves/requests/:id/reject  (admin)
router.put('/requests/:id/reject', auth, adminOnly, async (req, res) => {
  const { note } = req.body;
  await db.query(
    'UPDATE leave_requests SET status=?, reviewed_by=?, reviewed_at=NOW(), reviewer_note=? WHERE id=?',
    ['rejected', req.user.id, note || '', req.params.id]
  );
  res.json({ ok: true });
});

// PUT /api/leaves/requests/:id/cancel  (employee cancels own; admin can cancel any)
router.put('/requests/:id/cancel', auth, async (req, res) => {
  const [[req_row]] = await db.query('SELECT * FROM leave_requests WHERE id=?', [req.params.id]);
  if (!req_row) return res.status(404).json({ error: 'Not found' });
  if (req.user.role !== 'admin' && req_row.employee_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

  // If approved, restore balance
  if (req_row.status === 'approved') {
    const year = new Date(req_row.from_date).getFullYear();
    await db.query(
      'UPDATE leave_balances SET used_days=GREATEST(0,used_days-?) WHERE employee_id=? AND leave_type_id=? AND year=?',
      [req_row.days, req_row.employee_id, req_row.leave_type_id, year]
    ).catch(async () => {
      await db.query(
        'UPDATE leave_balances SET used_days=MAX(0,used_days-?) WHERE employee_id=? AND leave_type_id=? AND year=?',
        [req_row.days, req_row.employee_id, req_row.leave_type_id, year]
      );
    });
  }

  await db.query('UPDATE leave_requests SET status=? WHERE id=?', ['cancelled', req.params.id]);
  res.json({ ok: true });
});

// ── Leave Balances ────────────────────────────────────────────────────────────

// GET /api/leaves/balances  (admin = all; employee = own)
router.get('/balances', auth, async (req, res) => {
  const year = req.query.year || new Date().getFullYear();
  let sql = `SELECT lb.*, e.name AS employee_name, lt.name AS leave_type_name, lt.color, lt.is_paid
             FROM leave_balances lb
             JOIN employees e   ON lb.employee_id   = e.id
             JOIN leave_types lt ON lb.leave_type_id = lt.id
             WHERE lb.year=?`;
  const params = [year];
  if (req.user.role !== 'admin') { sql += ' AND lb.employee_id=?'; params.push(req.user.id); }
  sql += ' ORDER BY e.name, lt.name';
  const [rows] = await db.query(sql, params);
  res.json(rows);
});

// PUT /api/leaves/balances  (admin sets allocation for employee)
router.put('/balances', auth, adminOnly, async (req, res) => {
  const { employee_id, leave_type_id, year, allocated_days } = req.body;
  if (!employee_id || !leave_type_id || !year) return res.status(400).json({ error: 'employee_id, leave_type_id, year required' });

  await db.query(
    `INSERT INTO leave_balances (employee_id, leave_type_id, year, allocated_days, used_days)
     VALUES (?,?,?,?,0)
     ON DUPLICATE KEY UPDATE allocated_days=?`,
    [employee_id, leave_type_id, year, allocated_days, allocated_days]
  ).catch(async () => {
    // SQLite fallback
    const [[bal]] = await db.query(
      'SELECT id FROM leave_balances WHERE employee_id=? AND leave_type_id=? AND year=?',
      [employee_id, leave_type_id, year]
    );
    if (bal) {
      await db.query('UPDATE leave_balances SET allocated_days=? WHERE id=?', [allocated_days, bal.id]);
    } else {
      await db.query('INSERT INTO leave_balances (employee_id,leave_type_id,year,allocated_days,used_days) VALUES (?,?,?,?,0)',
        [employee_id, leave_type_id, year, allocated_days]);
    }
  });
  res.json({ ok: true });
});

module.exports = router;
