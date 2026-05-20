const express = require('express');
const { authMiddleware } = require('../middleware/auth');

const VALID_STATUSES = ['new', 'contacted', 'interview', 'documents', 'training', 'active', 'inactive', 'rejected'];

module.exports = function (db) {
  const router = express.Router();
  router.use(authMiddleware);

  function logActivity(recruiter_id, driver_id, action, details) {
    db.prepare('INSERT INTO activities (recruiter_id, driver_id, action, details) VALUES (?, ?, ?, ?)').run(recruiter_id, driver_id, action, details);
  }

  router.get('/', (req, res) => {
    const { status, search, recruiter_id } = req.query;
    const isAdmin = req.user.role === 'admin';
    const params = [];
    let sql = `SELECT d.*, u.name as recruiter_name, u.avatar_color as recruiter_color
               FROM drivers d JOIN users u ON d.recruiter_id = u.id WHERE 1=1`;

    if (!isAdmin) { sql += ' AND d.recruiter_id = ?'; params.push(req.user.id); }
    else if (recruiter_id) { sql += ' AND d.recruiter_id = ?'; params.push(Number(recruiter_id)); }

    if (status && status !== 'all') { sql += ' AND d.status = ?'; params.push(status); }
    if (search) {
      sql += ' AND (d.name LIKE ? OR d.phone LIKE ? OR d.email LIKE ? OR d.city LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }
    sql += ' ORDER BY d.updated_at DESC';
    res.json(db.prepare(sql).all(...params));
  });

  router.get('/starting-soon', (req, res) => {
    const isAdmin = req.user.role === 'admin';
    const params = [];
    let sql = `SELECT d.*, u.name as recruiter_name FROM drivers d JOIN users u ON d.recruiter_id = u.id
               WHERE d.start_date BETWEEN date('now') AND date('now', '+14 days')`;
    if (!isAdmin) { sql += ' AND d.recruiter_id = ?'; params.push(req.user.id); }
    sql += ' ORDER BY d.start_date ASC';
    res.json(db.prepare(sql).all(...params));
  });

  router.get('/:id', (req, res) => {
    const driver = db.prepare(`
      SELECT d.*, u.name as recruiter_name, u.email as recruiter_email, u.phone as recruiter_phone, u.avatar_color as recruiter_color
      FROM drivers d JOIN users u ON d.recruiter_id = u.id WHERE d.id = ?
    `).get(Number(req.params.id));
    if (!driver) return res.status(404).json({ error: 'Driver not found' });
    if (req.user.role !== 'admin' && driver.recruiter_id !== req.user.id) return res.status(403).json({ error: 'Access denied' });
    res.json(driver);
  });

  router.post('/', (req, res) => {
    const { name, email, phone, city, state, truck_type, license_class, experience_years, source, salary_expectation, bio, start_date } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const result = db.prepare(`
      INSERT INTO drivers (name, email, phone, city, state, truck_type, license_class, experience_years, source, salary_expectation, bio, start_date, recruiter_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, email || null, phone || null, city || null, state || null, truck_type || null, license_class || null, Number(experience_years) || 0, source || null, salary_expectation || null, bio || null, start_date || null, req.user.id);

    db.prepare('INSERT INTO status_history (driver_id, old_status, new_status, changed_by) VALUES (?, ?, ?, ?)').run(result.lastInsertRowid, null, 'new', req.user.id);
    logActivity(req.user.id, result.lastInsertRowid, 'driver_created', `Driver ${name} added to the system`);

    res.status(201).json(db.prepare('SELECT * FROM drivers WHERE id = ?').get(result.lastInsertRowid));
  });

  router.put('/:id', (req, res) => {
    const id = Number(req.params.id);
    const driver = db.prepare('SELECT * FROM drivers WHERE id = ?').get(id);
    if (!driver) return res.status(404).json({ error: 'Driver not found' });
    if (req.user.role !== 'admin' && driver.recruiter_id !== req.user.id) return res.status(403).json({ error: 'Access denied' });

    const { name, email, phone, city, state, truck_type, license_class, experience_years, source, salary_expectation, bio, start_date } = req.body;
    db.prepare(`
      UPDATE drivers SET name=?, email=?, phone=?, city=?, state=?, truck_type=?, license_class=?,
      experience_years=?, source=?, salary_expectation=?, bio=?, start_date=?, updated_at=datetime('now') WHERE id=?
    `).run(name, email || null, phone || null, city || null, state || null, truck_type || null, license_class || null, Number(experience_years) || 0, source || null, salary_expectation || null, bio || null, start_date || null, id);

    logActivity(req.user.id, id, 'driver_updated', `Driver ${name} profile updated`);
    res.json(db.prepare('SELECT * FROM drivers WHERE id = ?').get(id));
  });

  router.put('/:id/status', (req, res) => {
    const { status, notes } = req.body;
    if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const id = Number(req.params.id);
    const driver = db.prepare('SELECT * FROM drivers WHERE id = ?').get(id);
    if (!driver) return res.status(404).json({ error: 'Driver not found' });
    if (req.user.role !== 'admin' && driver.recruiter_id !== req.user.id) return res.status(403).json({ error: 'Access denied' });

    db.prepare("UPDATE drivers SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
    db.prepare('INSERT INTO status_history (driver_id, old_status, new_status, changed_by, notes) VALUES (?, ?, ?, ?, ?)').run(id, driver.status, status, req.user.id, notes || null);
    logActivity(req.user.id, id, 'status_change', `Status changed: ${driver.status} → ${status}`);
    res.json({ success: true, old_status: driver.status, new_status: status });
  });

  router.delete('/:id', (req, res) => {
    const id = Number(req.params.id);
    const driver = db.prepare('SELECT * FROM drivers WHERE id = ?').get(id);
    if (!driver) return res.status(404).json({ error: 'Driver not found' });
    if (req.user.role !== 'admin' && driver.recruiter_id !== req.user.id) return res.status(403).json({ error: 'Access denied' });

    db.prepare('DELETE FROM status_history WHERE driver_id = ?').run(id);
    db.prepare('DELETE FROM notes WHERE driver_id = ?').run(id);
    db.prepare('DELETE FROM emails WHERE driver_id = ?').run(id);
    db.prepare('DELETE FROM activities WHERE driver_id = ?').run(id);
    db.prepare('DELETE FROM drivers WHERE id = ?').run(id);
    logActivity(req.user.id, null, 'driver_deleted', `Driver ${driver.name} deleted`);
    res.json({ success: true });
  });

  router.get('/:id/history', (req, res) => {
    res.json(db.prepare(`
      SELECT sh.*, u.name as changed_by_name FROM status_history sh
      JOIN users u ON sh.changed_by = u.id WHERE sh.driver_id = ? ORDER BY sh.created_at DESC
    `).all(Number(req.params.id)));
  });

  router.get('/:id/notes', (req, res) => {
    res.json(db.prepare(`
      SELECT n.*, u.name as recruiter_name, u.avatar_color FROM notes n
      JOIN users u ON n.recruiter_id = u.id WHERE n.driver_id = ? ORDER BY n.created_at DESC
    `).all(Number(req.params.id)));
  });

  router.post('/:id/notes', (req, res) => {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'Note text is required' });
    const id = Number(req.params.id);
    const result = db.prepare('INSERT INTO notes (driver_id, recruiter_id, text) VALUES (?, ?, ?)').run(id, req.user.id, text.trim());
    logActivity(req.user.id, id, 'note_added', 'Note added');
    const note = db.prepare('SELECT n.*, u.name as recruiter_name, u.avatar_color FROM notes n JOIN users u ON n.recruiter_id = u.id WHERE n.id = ?').get(result.lastInsertRowid);
    res.status(201).json(note);
  });

  router.delete('/:id/notes/:noteId', (req, res) => {
    const note = db.prepare('SELECT * FROM notes WHERE id = ? AND driver_id = ?').get(Number(req.params.noteId), Number(req.params.id));
    if (!note) return res.status(404).json({ error: 'Note not found' });
    if (req.user.role !== 'admin' && note.recruiter_id !== req.user.id) return res.status(403).json({ error: 'Access denied' });
    db.prepare('DELETE FROM notes WHERE id = ?').run(Number(req.params.noteId));
    res.json({ success: true });
  });

  router.get('/:id/emails', (req, res) => {
    res.json(db.prepare(`
      SELECT e.*, u.name as recruiter_name FROM emails e
      JOIN users u ON e.recruiter_id = u.id WHERE e.driver_id = ? ORDER BY e.sent_at DESC
    `).all(Number(req.params.id)));
  });

  return router;
};
