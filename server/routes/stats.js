const express = require('express');
const { authMiddleware } = require('../middleware/auth');

module.exports = function (db) {
  const router = express.Router();
  router.use(authMiddleware);

  router.get('/dashboard', (req, res) => {
    const isAdmin = req.user.role === 'admin';
    const params = isAdmin ? [] : [req.user.id];
    const w = isAdmin ? '' : 'WHERE d.recruiter_id = ?';
    const wa = isAdmin ? '' : 'WHERE a.recruiter_id = ?';

    const totals = db.prepare(`
      SELECT COUNT(*) as total,
        SUM(CASE WHEN status='active'    THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status='new'       THEN 1 ELSE 0 END) as new_leads,
        SUM(CASE WHEN status='interview' THEN 1 ELSE 0 END) as interviews,
        SUM(CASE WHEN status='training'  THEN 1 ELSE 0 END) as in_training,
        SUM(CASE WHEN status='documents' THEN 1 ELSE 0 END) as documents,
        SUM(CASE WHEN status='rejected'  THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN status='contacted' THEN 1 ELSE 0 END) as contacted
      FROM drivers d ${w}
    `).get(...params);

    const pipeline = db.prepare(`SELECT status, COUNT(*) as count FROM drivers d ${w} GROUP BY status`).all(...params);

    const recentActivity = db.prepare(`
      SELECT a.*, u.name as recruiter_name, d.name as driver_name
      FROM activities a
      LEFT JOIN users u ON a.recruiter_id = u.id
      LEFT JOIN drivers d ON a.driver_id = d.id
      ${wa} ORDER BY a.created_at DESC LIMIT 10
    `).all(...params);

    const startSoonParams = isAdmin ? [] : [req.user.id];
    const startingSoon = db.prepare(`
      SELECT d.*, u.name as recruiter_name FROM drivers d JOIN users u ON d.recruiter_id = u.id
      WHERE d.start_date BETWEEN date('now') AND date('now', '+14 days')
      ${isAdmin ? '' : 'AND d.recruiter_id = ?'} ORDER BY d.start_date ASC LIMIT 5
    `).all(...startSoonParams);

    const emailsThisMonth = db.prepare(`
      SELECT COUNT(*) as count FROM emails e
      ${isAdmin ? '' : 'WHERE e.recruiter_id = ?'}
    `).get(...params); // simplified - all time count for now

    const wMonth = isAdmin ? "WHERE d.created_at >= date('now', '-6 months')" : "WHERE d.recruiter_id = ? AND d.created_at >= date('now', '-6 months')";
    const monthlyData = db.prepare(`
      SELECT strftime('%Y-%m', d.created_at) as month, COUNT(*) as count
      FROM drivers d ${wMonth}
      GROUP BY month ORDER BY month ASC
    `).all(...params);

    res.json({ totals, pipeline, recentActivity, startingSoon, emailsThisMonth, monthlyData });
  });

  router.get('/recruiters', (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Нет доступа' });
    const recruiters = db.prepare(`
      SELECT u.id, u.name, u.email, u.avatar_color,
        COUNT(d.id) as total_drivers,
        SUM(CASE WHEN d.status='active'  THEN 1 ELSE 0 END) as active_drivers,
        SUM(CASE WHEN d.status='new'     THEN 1 ELSE 0 END) as new_leads,
        SUM(CASE WHEN d.status='rejected'THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN d.created_at >= date('now', '-30 days') THEN 1 ELSE 0 END) as this_month
      FROM users u LEFT JOIN drivers d ON d.recruiter_id = u.id
      WHERE u.role = 'recruiter' AND u.is_active = 1
      GROUP BY u.id ORDER BY total_drivers DESC
    `).all();
    res.json(recruiters);
  });

  router.get('/pipeline', (req, res) => {
    const isAdmin = req.user.role === 'admin';
    const params = isAdmin ? [] : [req.user.id];
    const w = isAdmin ? '' : 'WHERE d.recruiter_id = ?';

    const byStatus = db.prepare(`SELECT d.status, COUNT(*) as count FROM drivers d ${w} GROUP BY d.status`).all(...params);
    const conversionRate = db.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) as converted FROM drivers d ${w}`).get(...params);
    res.json({ byStatus, conversionRate });
  });

  return router;
};
