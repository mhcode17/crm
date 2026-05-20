const express = require('express');
const { authMiddleware, adminOnly } = require('../middleware/auth');

const MAX_ACTIVE_LEADS = 10; // max active leads per recruiter

module.exports = function (db) {
  const router = express.Router();
  router.use(authMiddleware);

  // ── Helpers ─────────────────────────────────────────────────────────

  function addPoints(recruiter_id, lead_id, action, points, description) {
    db.prepare('UPDATE users SET points = MAX(0, points + ?) WHERE id = ?').run(points, recruiter_id);
    db.prepare('INSERT INTO point_history (recruiter_id, lead_id, action, points_change, description) VALUES (?, ?, ?, ?, ?)').run(recruiter_id, lead_id || null, action, points, description);
  }

  function activeLeadCount(recruiter_id) {
    return db.prepare("SELECT COUNT(*) as c FROM leads WHERE claimed_by = ? AND status = 'claimed'").get(recruiter_id).c;
  }

  function checkOverdue(recruiter_id) {
    // Deduct 1 point for each lead active > 30 days (once per lead)
    const overdue = db.prepare(`
      SELECT id, name FROM leads
      WHERE claimed_by = ? AND status = 'claimed' AND overdue_deducted = 0
        AND claimed_at <= datetime('now', '-30 days')
    `).all(recruiter_id);
    overdue.forEach(lead => {
      addPoints(recruiter_id, lead.id, 'overdue', -1, `Lead "${lead.name}" overdue (30+ days)`);
      db.prepare('UPDATE leads SET overdue_deducted = 1 WHERE id = ?').run(lead.id);
    });
    return overdue.length;
  }

  // ── GET /api/leads/pool — available leads (contacts intentionally hidden) ─
  router.get('/pool', (req, res) => {
    const { search, source } = req.query;
    // phone and email are excluded — visible only after claiming
    let sql = `
      SELECT l.id, l.name, l.city, l.state, l.truck_type, l.license_class,
             l.experience_years, l.source, l.status, l.notes, l.created_at,
             COUNT(d.id) as doc_count
      FROM leads l
      LEFT JOIN lead_documents d ON d.lead_id = l.id
      WHERE l.status = 'available'
    `;
    const params = [];
    if (source) { sql += ` AND l.source = ?`; params.push(source); }
    if (search) {
      sql += ` AND (l.name LIKE ? OR l.city LIKE ? OR l.truck_type LIKE ?)`;
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    sql += ` GROUP BY l.id ORDER BY l.created_at DESC`;
    res.json(db.prepare(sql).all(...params));
  });

  // ── GET /api/leads/my — current recruiter's claimed leads ──────────
  router.get('/my', (req, res) => {
    const rid = req.user.id;
    checkOverdue(rid);
    const leads = db.prepare(`
      SELECT * FROM leads WHERE claimed_by = ? AND status IN ('claimed')
      ORDER BY claimed_at DESC
    `).all(rid);
    res.json(leads);
  });

  // ── GET /api/leads/all — admin sees everything ─────────────────────
  router.get('/all', (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    const { source } = req.query;
    const params = [];
    let sql = `
      SELECT l.*, u.name as recruiter_name, u.avatar_color as recruiter_color,
        COUNT(d.id) as doc_count
      FROM leads l
      LEFT JOIN users u ON l.claimed_by = u.id
      LEFT JOIN lead_documents d ON d.lead_id = l.id
      WHERE 1=1
    `;
    if (source) { sql += ` AND l.source = ?`; params.push(source); }
    sql += ` GROUP BY l.id ORDER BY l.created_at DESC`;
    res.json(db.prepare(sql).all(...params));
  });

  // ── GET /api/leads/stats — slot usage for current recruiter ────────
  router.get('/stats', (req, res) => {
    const rid = req.user.id;
    const active = activeLeadCount(rid);
    const user = db.prepare('SELECT points FROM users WHERE id = ?').get(rid);
    res.json({ active, max: MAX_ACTIVE_LEADS, slots_left: MAX_ACTIVE_LEADS - active, points: user?.points ?? 0 });
  });

  // ── POST /api/leads/:id/claim — claim a lead → creates a Driver ───
  router.post('/:id/claim', (req, res) => {
    const id = Number(req.params.id);
    const rid = req.user.id;

    const lead = db.prepare("SELECT * FROM leads WHERE id = ? AND status = 'available'").get(id);
    if (!lead) return res.status(404).json({ error: 'Lead not found or already claimed' });

    const active = activeLeadCount(rid);
    if (active >= MAX_ACTIVE_LEADS) {
      return res.status(400).json({ error: `You have reached the limit of ${MAX_ACTIVE_LEADS} active leads. Complete or reject an existing lead to free a slot.` });
    }

    // Mark lead as claimed
    db.prepare(`UPDATE leads SET status='claimed', claimed_by=?, claimed_at=datetime('now'), overdue_deducted=0 WHERE id=?`).run(rid, id);

    // Create Driver from lead (contacts now visible to recruiter)
    const driverResult = db.prepare(`
      INSERT INTO drivers (name, email, phone, city, state, truck_type, license_class, experience_years, source, recruiter_id, lead_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(lead.name, lead.email || null, lead.phone || null, lead.city || null, lead.state || null, lead.truck_type || null, lead.license_class || null, lead.experience_years || 0, lead.source || 'Facebook', rid, id);

    const driverId = driverResult.lastInsertRowid;
    db.prepare('INSERT INTO status_history (driver_id, old_status, new_status, changed_by) VALUES (?, ?, ?, ?)').run(driverId, null, 'new', rid);
    db.prepare('INSERT INTO activities (recruiter_id, driver_id, action, details) VALUES (?, ?, ?, ?)').run(rid, driverId, 'lead_claimed', `Facebook lead "${lead.name}" claimed — driver profile created`);

    const driver = db.prepare('SELECT * FROM drivers WHERE id = ?').get(driverId);
    res.json({ lead: db.prepare('SELECT * FROM leads WHERE id = ?').get(id), driver });
  });

  // ── POST /api/leads/:id/transfer — transfer to another recruiter ───
  router.post('/:id/transfer', (req, res) => {
    const id = Number(req.params.id);
    const { to_recruiter_id, reason } = req.body;
    const rid = req.user.id;

    if (!to_recruiter_id) return res.status(400).json({ error: 'Target recruiter is required' });
    if (Number(to_recruiter_id) === rid) return res.status(400).json({ error: 'Cannot transfer to yourself' });

    const lead = db.prepare("SELECT * FROM leads WHERE id = ? AND claimed_by = ? AND status = 'claimed'").get(id, rid);
    if (!lead) return res.status(404).json({ error: 'Lead not found or not yours' });

    const toId = Number(to_recruiter_id);
    const targetActive = activeLeadCount(toId);
    if (targetActive >= MAX_ACTIVE_LEADS) {
      return res.status(400).json({ error: 'Target recruiter has reached their active lead limit' });
    }

    const target = db.prepare('SELECT name FROM users WHERE id = ? AND is_active = 1').get(toId);
    if (!target) return res.status(404).json({ error: 'Recruiter not found' });

    db.prepare(`UPDATE leads SET claimed_by=?, claimed_at=datetime('now'), overdue_deducted=0 WHERE id=?`).run(toId, id);
    // Also transfer the driver record ownership
    db.prepare('UPDATE drivers SET recruiter_id=? WHERE lead_id=? AND recruiter_id=?').run(toId, id, rid);
    db.prepare('INSERT INTO lead_transfers (lead_id, from_recruiter_id, to_recruiter_id, reason) VALUES (?, ?, ?, ?)').run(id, rid, toId, reason || null);

    addPoints(rid, id, 'transfer_out', -2, `Transferred lead "${lead.name}" to ${target.name}`);
    db.prepare('INSERT INTO activities (recruiter_id, driver_id, action, details) VALUES (?, ?, ?, ?)').run(rid, null, 'lead_transferred', `Lead "${lead.name}" transferred to ${target.name} (-2 pts)`);

    res.json({ success: true, points_deducted: 2 });
  });

  // ── PUT /api/leads/:id/complete — successful deal ──────────────────
  router.put('/:id/complete', (req, res) => {
    const id = Number(req.params.id);
    const rid = req.user.id;
    const isAdmin = req.user.role === 'admin';

    const lead = db.prepare("SELECT * FROM leads WHERE id = ?").get(id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (!isAdmin && lead.claimed_by !== rid) return res.status(403).json({ error: 'Access denied' });
    if (lead.status !== 'claimed') return res.status(400).json({ error: 'Lead is not active' });

    db.prepare(`UPDATE leads SET status='completed', completed_at=datetime('now') WHERE id=?`).run(id);
    addPoints(lead.claimed_by, id, 'complete', +10, `Successfully converted lead "${lead.name}" (+10 pts)`);
    db.prepare('INSERT INTO activities (recruiter_id, driver_id, action, details) VALUES (?, ?, ?, ?)').run(lead.claimed_by, null, 'lead_completed', `Lead "${lead.name}" completed successfully (+10 pts)`);

    res.json({ success: true, points_gained: 10 });
  });

  // ── PUT /api/leads/:id/reject — failed deal ────────────────────────
  router.put('/:id/reject', (req, res) => {
    const id = Number(req.params.id);
    const rid = req.user.id;
    const isAdmin = req.user.role === 'admin';

    const lead = db.prepare("SELECT * FROM leads WHERE id = ?").get(id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (!isAdmin && lead.claimed_by !== rid) return res.status(403).json({ error: 'Access denied' });
    if (lead.status !== 'claimed') return res.status(400).json({ error: 'Lead is not active' });

    db.prepare(`UPDATE leads SET status='rejected', completed_at=datetime('now') WHERE id=?`).run(id);
    addPoints(lead.claimed_by, id, 'reject', -3, `Lead "${lead.name}" rejected (-3 pts)`);
    db.prepare('INSERT INTO activities (recruiter_id, driver_id, action, details) VALUES (?, ?, ?, ?)').run(lead.claimed_by, null, 'lead_rejected', `Lead "${lead.name}" rejected (-3 pts)`);

    res.json({ success: true, points_deducted: 3 });
  });

  // ── GET /api/leads/leaderboard — all recruiters ranked by points ───
  router.get('/leaderboard', (req, res) => {
    const board = db.prepare(`
      SELECT u.id, u.name, u.avatar_color, u.points,
        (SELECT COUNT(*) FROM leads WHERE claimed_by=u.id AND status='completed') as completed,
        (SELECT COUNT(*) FROM leads WHERE claimed_by=u.id AND status='rejected')  as rejected,
        (SELECT COUNT(*) FROM leads WHERE claimed_by=u.id AND status='claimed')   as active,
        (SELECT COUNT(*) FROM lead_transfers WHERE from_recruiter_id=u.id)        as transfers_out,
        COALESCE((SELECT SUM(CASE WHEN points_change>0 THEN points_change ELSE 0 END) FROM point_history WHERE recruiter_id=u.id), 0) as points_earned,
        COALESCE((SELECT SUM(CASE WHEN points_change<0 THEN points_change ELSE 0 END) FROM point_history WHERE recruiter_id=u.id), 0) as points_lost
      FROM users u
      WHERE u.role = 'recruiter' AND u.is_active = 1
      ORDER BY u.points DESC
    `).all();
    res.json(board);
  });

  // ── GET /api/leads/point-history — current user's point history ────
  router.get('/point-history', (req, res) => {
    const history = db.prepare(`
      SELECT ph.*, l.name as lead_name
      FROM point_history ph
      LEFT JOIN leads l ON ph.lead_id = l.id
      WHERE ph.recruiter_id = ?
      ORDER BY ph.created_at DESC LIMIT 50
    `).all(req.user.id);
    res.json(history);
  });

  // ── POST /api/leads — admin adds a single lead ─────────────────────
  router.post('/', (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { name, phone, email, city, state, truck_type, license_class, experience_years, notes, source } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const result = db.prepare(`
      INSERT INTO leads (name, phone, email, city, state, truck_type, license_class, experience_years, notes, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, phone || null, email || null, city || null, state || null, truck_type || null, license_class || null, Number(experience_years) || 0, notes || null, source || 'Facebook');
    res.status(201).json(db.prepare('SELECT * FROM leads WHERE id = ?').get(result.lastInsertRowid));
  });

  // ── DELETE /api/leads/:id — admin removes lead ─────────────────────
  router.delete('/:id', adminOnly, (req, res) => {
    db.prepare('DELETE FROM lead_transfers WHERE lead_id = ?').run(Number(req.params.id));
    db.prepare('DELETE FROM point_history WHERE lead_id = ?').run(Number(req.params.id));
    db.prepare('DELETE FROM leads WHERE id = ?').run(Number(req.params.id));
    res.json({ success: true });
  });

  // ── GET /api/leads/recruiters — list of recruiters for transfer modal
  router.get('/recruiters', (req, res) => {
    const rid = req.user.id;
    const recruiters = db.prepare(`
      SELECT u.id, u.name, u.avatar_color, u.points,
        (SELECT COUNT(*) FROM leads WHERE claimed_by=u.id AND status='claimed') as active_leads
      FROM users u
      WHERE u.role='recruiter' AND u.is_active=1 AND u.id != ?
      ORDER BY u.name
    `).all(rid);
    res.json(recruiters);
  });

  return router;
};
