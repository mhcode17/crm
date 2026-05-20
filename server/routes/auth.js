const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authMiddleware, adminOnly } = require('../middleware/auth');

const SECRET = process.env.JWT_SECRET || 'secret_key';

module.exports = function (db) {
  const router = express.Router();

  router.post('/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Please enter email and password' });

    const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(email.toLowerCase().trim());
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone, avatar_color: user.avatar_color }
    });
  });

  router.get('/me', authMiddleware, (req, res) => {
    const user = db.prepare('SELECT id, name, email, role, phone, avatar_color, created_at FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  });

  router.put('/me', authMiddleware, (req, res) => {
    const { name, phone } = req.body;
    db.prepare('UPDATE users SET name = ?, phone = ? WHERE id = ?').run(name, phone || null, req.user.id);
    const updated = db.prepare('SELECT id, name, email, role, phone, avatar_color FROM users WHERE id = ?').get(req.user.id);
    res.json(updated);
  });

  router.put('/me/password', authMiddleware, (req, res) => {
    const { current_password, new_password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!bcrypt.compareSync(current_password, user.password_hash)) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }
    if (!new_password || new_password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(new_password, 10), req.user.id);
    res.json({ success: true });
  });

  router.post('/register', authMiddleware, adminOnly, (req, res) => {
    const { name, email, password, role = 'recruiter', phone, avatar_color } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Please fill in all required fields' });

    const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (exists) return res.status(409).json({ error: 'This email is already in use' });

    const result = db.prepare(
      'INSERT INTO users (name, email, password_hash, role, phone, avatar_color) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(name, email.toLowerCase(), bcrypt.hashSync(password, 10), role, phone || null, avatar_color || '#3b82f6');

    const user = db.prepare('SELECT id, name, email, role, phone, avatar_color FROM users WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(user);
  });

  return router;
};
