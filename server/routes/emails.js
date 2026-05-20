const express = require('express');
const nodemailer = require('nodemailer');
const { authMiddleware } = require('../middleware/auth');

function applyVars(text, vars) {
  return Object.entries(vars).reduce((t, [k, v]) => t.split(`{${k}}`).join(v || ''), text);
}

module.exports = function (db) {
  const router = express.Router();
  router.use(authMiddleware);

  function getTransporter() {
    if (process.env.EMAIL_MOCK !== 'false') return null;
    return nodemailer.createTransporter({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_PORT || '587'),
      secure: false,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });
  }

  router.get('/templates', (_, res) => {
    res.json(db.prepare('SELECT * FROM email_templates ORDER BY category, name').all());
  });

  router.post('/templates', (req, res) => {
    const { name, subject, body, category } = req.body;
    if (!name || !subject || !body) return res.status(400).json({ error: 'Please fill in all fields' });
    const result = db.prepare('INSERT INTO email_templates (name, subject, body, category, created_by) VALUES (?, ?, ?, ?, ?)').run(name, subject, body, category || 'general', req.user.id);
    res.status(201).json(db.prepare('SELECT * FROM email_templates WHERE id = ?').get(result.lastInsertRowid));
  });

  router.delete('/templates/:id', (req, res) => {
    db.prepare('DELETE FROM email_templates WHERE id = ?').run(Number(req.params.id));
    res.json({ success: true });
  });

  router.get('/', (req, res) => {
    const { driver_id } = req.query;
    const isAdmin = req.user.role === 'admin';
    const params = [];
    let sql = `SELECT e.*, d.name as driver_name, d.email as driver_email, u.name as recruiter_name
               FROM emails e JOIN drivers d ON e.driver_id = d.id JOIN users u ON e.recruiter_id = u.id WHERE 1=1`;
    if (!isAdmin) { sql += ' AND e.recruiter_id = ?'; params.push(req.user.id); }
    if (driver_id) { sql += ' AND e.driver_id = ?'; params.push(Number(driver_id)); }
    sql += ' ORDER BY e.sent_at DESC LIMIT 200';
    res.json(db.prepare(sql).all(...params));
  });

  router.post('/send', async (req, res) => {
    const { driver_id, subject, body, template_used } = req.body;
    if (!driver_id || !subject || !body) return res.status(400).json({ error: 'Please fill in all fields' });

    const driver = db.prepare('SELECT * FROM drivers WHERE id = ?').get(Number(driver_id));
    if (!driver) return res.status(404).json({ error: 'Driver not found' });

    const recruiter = db.prepare('SELECT name, email, phone FROM users WHERE id = ?').get(req.user.id);

    const vars = {
      name: driver.name,
      recruiter_name: recruiter.name,
      recruiter_email: recruiter.email,
      recruiter_phone: recruiter.phone || '',
      company: process.env.EMAIL_COMPANY_NAME || 'TruckRecruit CRM'
    };

    const finalSubject = applyVars(subject, vars);
    const finalBody = applyVars(body, vars);

    const transporter = getTransporter();
    if (transporter && driver.email) {
      try {
        await transporter.sendMail({
          from: `"${recruiter.name}" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
          to: driver.email,
          subject: finalSubject,
          text: finalBody
        });
      } catch (err) {
        return res.status(500).json({ error: 'Send error: ' + err.message });
      }
    } else {
      console.log('\n--- MOCK EMAIL ---');
      console.log(`To: ${driver.name} <${driver.email || 'no-email'}>`);
      console.log(`Subject: ${finalSubject}`);
      console.log(`Body:\n${finalBody}`);
      console.log('--- END EMAIL ---\n');
    }

    const result = db.prepare('INSERT INTO emails (driver_id, recruiter_id, subject, body, template_used) VALUES (?, ?, ?, ?, ?)').run(Number(driver_id), req.user.id, finalSubject, finalBody, template_used || null);
    db.prepare('INSERT INTO activities (recruiter_id, driver_id, action, details) VALUES (?, ?, ?, ?)').run(req.user.id, Number(driver_id), 'email_sent', `Email sent: ${finalSubject}`);

    const email = db.prepare('SELECT * FROM emails WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ ...email, mock: !transporter });
  });

  return router;
};
