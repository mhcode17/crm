const express = require('express');
const bcrypt = require('bcryptjs');
const { authMiddleware, adminOnly } = require('../middleware/auth');

module.exports = function (db) {
  const router = express.Router();
  router.use(authMiddleware, adminOnly);

  router.get('/', (_, res) => {
    res.json(db.prepare(`
      SELECT u.id, u.name, u.email, u.role, u.phone, u.avatar_color, u.is_active, u.created_at,
        COUNT(d.id) as driver_count
      FROM users u LEFT JOIN drivers d ON d.recruiter_id = u.id
      GROUP BY u.id ORDER BY u.created_at DESC
    `).all());
  });

  router.get('/:id', (req, res) => {
    const user = db.prepare('SELECT id, name, email, role, phone, avatar_color, is_active, created_at FROM users WHERE id = ?').get(Number(req.params.id));
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  });

  router.put('/:id', (req, res) => {
    const { name, email, phone, role, avatar_color, is_active } = req.body;
    db.prepare('UPDATE users SET name=?, email=?, phone=?, role=?, avatar_color=?, is_active=? WHERE id=?').run(name, email, phone || null, role, avatar_color || '#3b82f6', is_active ? 1 : 0, Number(req.params.id));
    res.json(db.prepare('SELECT id, name, email, role, phone, avatar_color, is_active FROM users WHERE id = ?').get(Number(req.params.id)));
  });

  router.put('/:id/password', (req, res) => {
    const { password } = req.body;
    if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), Number(req.params.id));
    res.json({ success: true });
  });

  router.delete('/:id', (req, res) => {
    if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account' });
    db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(Number(req.params.id));
    res.json({ success: true });
  });

  return router;
};
