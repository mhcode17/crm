const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authMiddleware } = require('../middleware/auth');

const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (_, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random()*1e6)}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_, file, cb) => cb(null, /image\/(jpeg|jpg|png|gif|webp|heic)/i.test(file.mimetype)),
});

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
    const { name, email, phone, city, state, truck_type, license_class, endorsements, experience_years, source, salary_expectation, bio, start_date } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const result = db.prepare(`
      INSERT INTO drivers (name, email, phone, city, state, truck_type, license_class, endorsements, experience_years, source, salary_expectation, bio, start_date, recruiter_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, email || null, phone || null, city || null, state || null, truck_type || null, license_class || null, endorsements || null, Number(experience_years) || 0, source || null, salary_expectation || null, bio || null, start_date || null, req.user.id);

    db.prepare('INSERT INTO status_history (driver_id, old_status, new_status, changed_by) VALUES (?, ?, ?, ?)').run(result.lastInsertRowid, null, 'new', req.user.id);
    logActivity(req.user.id, result.lastInsertRowid, 'driver_created', `Driver ${name} added to the system`);

    res.status(201).json(db.prepare('SELECT * FROM drivers WHERE id = ?').get(result.lastInsertRowid));
  });

  router.put('/:id', (req, res) => {
    const id = Number(req.params.id);
    const driver = db.prepare('SELECT * FROM drivers WHERE id = ?').get(id);
    if (!driver) return res.status(404).json({ error: 'Driver not found' });
    if (req.user.role !== 'admin' && driver.recruiter_id !== req.user.id) return res.status(403).json({ error: 'Access denied' });

    const { name, email, phone, city, state, truck_type, license_class, endorsements, experience_years, source, salary_expectation, bio, start_date } = req.body;
    db.prepare(`
      UPDATE drivers SET name=?, email=?, phone=?, city=?, state=?, truck_type=?, license_class=?, endorsements=?,
      experience_years=?, source=?, salary_expectation=?, bio=?, start_date=?, updated_at=datetime('now') WHERE id=?
    `).run(name, email || null, phone || null, city || null, state || null, truck_type || null, license_class || null, endorsements || null, Number(experience_years) || 0, source || null, salary_expectation || null, bio || null, start_date || null, id);

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

  // ── GET /api/drivers/:id/files ─────────────────────────────────────
  // Returns application docs (from lead_documents) + manually uploaded files
  router.get('/:id/files', (req, res) => {
    const id = Number(req.params.id);
    const driver = db.prepare('SELECT lead_id FROM drivers WHERE id = ?').get(id);
    if (!driver) return res.status(404).json({ error: 'Driver not found' });

    // Files from the apply form (linked via lead_id)
    const appFiles = driver.lead_id
      ? db.prepare('SELECT id, filename, original_name, mime_type, label, uploaded_at as created_at FROM lead_documents WHERE lead_id = ? ORDER BY uploaded_at DESC').all(driver.lead_id)
        .map(f => ({ ...f, source: 'application' }))
      : [];

    // Manually uploaded files
    const manualFiles = db.prepare(`
      SELECT df.id, df.filename, df.original_name, df.mime_type, df.label, df.created_at,
        u.name as uploaded_by_name
      FROM driver_files df
      LEFT JOIN users u ON df.uploaded_by = u.id
      WHERE df.driver_id = ?
      ORDER BY df.created_at DESC
    `).all(id).map(f => ({ ...f, source: 'manual' }));

    res.json([...appFiles, ...manualFiles]);
  });

  // ── POST /api/drivers/:id/files/from-sms — save SMS photo to driver files ─
  router.post('/:id/files/from-sms', (req, res) => {
    const { url, label } = req.body;
    const id = Number(req.params.id);
    if (!url) return res.status(400).json({ error: 'URL is required' });

    const driver = db.prepare('SELECT id FROM drivers WHERE id = ?').get(id);
    if (!driver) return res.status(404).json({ error: 'Driver not found' });

    // Extract filename from local /uploads/ URL
    let filename;
    if (url.startsWith('/uploads/')) {
      filename = url.replace('/uploads/', '');
    } else {
      return res.status(400).json({ error: 'Only local /uploads/ URLs are supported' });
    }

    const filePath = path.join(uploadsDir, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on server' });

    // Avoid duplicates
    const existing = db.prepare('SELECT id FROM driver_files WHERE driver_id = ? AND filename = ?').get(id, filename);
    if (existing) {
      // Update label if provided
      if (label) db.prepare('UPDATE driver_files SET label = ? WHERE id = ?').run(label, existing.id);
      return res.json({ success: true, id: existing.id, updated: true });
    }

    const result = db.prepare(`
      INSERT INTO driver_files (driver_id, filename, original_name, mime_type, label, uploaded_by)
      VALUES (?, ?, ?, 'image/jpeg', ?, ?)
    `).run(id, filename, filename, label || null, req.user.id);

    logActivity(req.user.id, id, 'file_uploaded', `Photo saved from SMS${label ? ': ' + label : ''}`);
    res.status(201).json({ success: true, id: result.lastInsertRowid });
  });

  // ── POST /api/drivers/:id/files ────────────────────────────────────
  router.post('/:id/files', upload.single('file'), (req, res) => {
    const id = Number(req.params.id);
    if (!req.file) return res.status(400).json({ error: 'No image file provided' });

    const driver = db.prepare('SELECT id FROM drivers WHERE id = ?').get(id);
    if (!driver) return res.status(404).json({ error: 'Driver not found' });

    const label = req.body?.label || null;
    const result = db.prepare(`
      INSERT INTO driver_files (driver_id, filename, original_name, mime_type, label, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, req.file.filename, req.file.originalname, req.file.mimetype, label, req.user.id);

    logActivity(req.user.id, id, 'file_uploaded', `Photo uploaded: ${req.file.originalname}`);

    res.status(201).json({
      id: result.lastInsertRowid,
      filename: req.file.filename,
      original_name: req.file.originalname,
      mime_type: req.file.mimetype,
      label: label,
      source: 'manual',
      created_at: new Date().toISOString(),
    });
  });

  // ── PATCH /api/drivers/:id/files/:fileId — update label ───────────
  // source=manual → driver_files, source=application → lead_documents
  router.patch('/:id/files/:fileId', (req, res) => {
    const fileId = Number(req.params.fileId);
    const { label, source } = req.body;

    if (source === 'application') {
      // Update label in lead_documents
      const file = db.prepare('SELECT id FROM lead_documents WHERE id = ?').get(fileId);
      if (!file) return res.status(404).json({ error: 'File not found' });
      db.prepare('UPDATE lead_documents SET label = ? WHERE id = ?').run(label || null, fileId);
    } else {
      // Update label in driver_files
      const file = db.prepare('SELECT * FROM driver_files WHERE id = ? AND driver_id = ?').get(fileId, Number(req.params.id));
      if (!file) return res.status(404).json({ error: 'File not found' });
      db.prepare('UPDATE driver_files SET label = ? WHERE id = ?').run(label || null, fileId);
    }
    res.json({ success: true });
  });

  // ── DELETE /api/drivers/:id/files/:fileId ──────────────────────────
  router.delete('/:id/files/:fileId', (req, res) => {
    const fileId = Number(req.params.fileId);
    const file = db.prepare('SELECT * FROM driver_files WHERE id = ? AND driver_id = ?').get(fileId, Number(req.params.id));
    if (!file) return res.status(404).json({ error: 'File not found' });
    if (req.user.role !== 'admin' && file.uploaded_by !== req.user.id) return res.status(403).json({ error: 'Access denied' });

    // Delete physical file
    const filePath = path.join(uploadsDir, file.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    db.prepare('DELETE FROM driver_files WHERE id = ?').run(fileId);
    res.json({ success: true });
  });

  return router;
};
