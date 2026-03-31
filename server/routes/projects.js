// routes/projects.js  – project & task CRUD
const router = require('express').Router();
const db     = require('../db');
const auth   = require('../middleware/auth');
const { adminOnly } = require('../middleware/auth');

// ── Projects ─────────────────────────────────────────────────────────────────

// GET /api/projects  – all active projects (any authenticated user)
router.get('/', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT p.*, e.name AS created_by_name,
              COUNT(t.id) AS task_count
       FROM projects p
       LEFT JOIN employees e ON p.created_by = e.id
       LEFT JOIN tasks t ON t.project_id = p.id
       WHERE p.status = 'active'
       GROUP BY p.id
       ORDER BY p.created_at DESC`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/projects  – create project (admin only)
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const { name, description = '', color = '#3b82f6' } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const [result] = await db.query(
      "INSERT INTO projects (name, description, color, created_by) VALUES (?,?,?,?)",
      [name, description, color, req.user.id]
    );
    const [rows] = await db.query('SELECT * FROM projects WHERE id=?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/projects/:id
router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    const { name, description, color, status } = req.body;
    await db.query(
      'UPDATE projects SET name=COALESCE(?,name), description=COALESCE(?,description), color=COALESCE(?,color), status=COALESCE(?,status) WHERE id=?',
      [name, description, color, status, req.params.id]
    );
    const [rows] = await db.query('SELECT * FROM projects WHERE id=?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/projects/:id  – archive instead of hard delete
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    await db.query("UPDATE projects SET status='archived' WHERE id=?", [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Tasks ─────────────────────────────────────────────────────────────────────

// GET /api/projects/:id/tasks  – tasks for a project
router.get('/:id/tasks', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT t.*, e.name AS assigned_to_name, p.name AS project_name, p.color AS project_color
       FROM tasks t
       JOIN projects p ON t.project_id = p.id
       LEFT JOIN employees e ON t.assigned_to = e.id
       WHERE t.project_id = ?
       ORDER BY t.created_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/projects/tasks/mine  – tasks assigned to me (for macOS agent)
router.get('/tasks/mine', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT t.*, p.name AS project_name, p.color AS project_color,
              e.name AS assigned_to_name
       FROM tasks t
       JOIN projects p ON t.project_id = p.id
       LEFT JOIN employees e ON t.assigned_to = e.id
       WHERE (t.assigned_to = ? OR t.created_by = ? OR t.assigned_to IS NULL)
         AND t.status != 'done'
         AND p.status = 'active'
       ORDER BY t.status ASC, t.created_at DESC`,
      [req.user.id, req.user.id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/projects/:id/tasks  – create task
router.post('/:id/tasks', auth, async (req, res) => {
  try {
    const { name, description = '', assignedTo } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const [result] = await db.query(
      'INSERT INTO tasks (project_id, name, description, assigned_to, created_by) VALUES (?,?,?,?,?)',
      [req.params.id, name, description, assignedTo || req.user.id, req.user.id]
    );
    const [rows] = await db.query(
      `SELECT t.*, p.name AS project_name, p.color AS project_color,
              e.name AS assigned_to_name
       FROM tasks t
       JOIN projects p ON t.project_id = p.id
       LEFT JOIN employees e ON t.assigned_to = e.id
       WHERE t.id = ?`,
      [result.insertId]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/projects/tasks/:taskId  – update task
router.put('/tasks/:taskId', auth, async (req, res) => {
  try {
    const { name, description, status, assignedTo } = req.body;
    await db.query(
      'UPDATE tasks SET name=COALESCE(?,name), description=COALESCE(?,description), status=COALESCE(?,status), assigned_to=COALESCE(?,assigned_to) WHERE id=?',
      [name, description, status, assignedTo, req.params.taskId]
    );
    const [rows] = await db.query(
      `SELECT t.*, p.name AS project_name, p.color AS project_color,
              e.name AS assigned_to_name
       FROM tasks t
       JOIN projects p ON t.project_id = p.id
       LEFT JOIN employees e ON t.assigned_to = e.id
       WHERE t.id = ?`,
      [req.params.taskId]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/projects/tasks/:taskId
router.delete('/tasks/:taskId', auth, adminOnly, async (req, res) => {
  try {
    await db.query('DELETE FROM tasks WHERE id=?', [req.params.taskId]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
