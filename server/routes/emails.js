const express = require('express');
const nodemailer = require('nodemailer');
const { authMiddleware } = require('../middleware/auth');

function applyVars(text, vars) {
  return Object.entries(vars).reduce((t, [k, v]) => t.split(`{${k}}`).join(v || ''), text);
}

// Build a verified FROM address using the sending domain
// e.g. marcus@oneprimefleet.com → marcus@contact.oneprimefleet.com
function buildFromAddress(recruiterEmail) {
  const sendingDomain = process.env.EMAIL_SENDING_DOMAIN || 'contact.oneprimefleet.com';
  if (!recruiterEmail) return `noreply@${sendingDomain}`;
  const username = recruiterEmail.split('@')[0];
  return `${username}@${sendingDomain}`;
}

module.exports = function (db) {
  const router = express.Router();
  router.use(authMiddleware);

  function getTransporter() {
    if (process.env.EMAIL_MOCK !== 'false') return null;
    return nodemailer.createTransport({
      host: 'smtp.resend.com',
      port: 465,
      secure: true,
      auth: {
        user: 'resend',
        pass: process.env.RESEND_API_KEY
      }
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

  // Conversation list — one entry per driver (latest email)
  router.get('/conversations', (req, res) => {
    const isAdmin = req.user.role === 'admin';
    let sql, params = [];

    if (isAdmin) {
      sql = `
        SELECT
          d.id as driver_id,
          d.name as driver_name,
          d.email as driver_email,
          u.name as recruiter_name,
          u.email as recruiter_email,
          u.avatar_color as recruiter_color,
          e.subject as last_subject,
          e.body as last_body,
          e.sent_at as last_at,
          COUNT(e2.id) as email_count
        FROM drivers d
        JOIN (
          SELECT driver_id, MAX(sent_at) as max_at
          FROM emails
          GROUP BY driver_id
        ) latest ON latest.driver_id = d.id
        JOIN emails e ON e.driver_id = d.id AND e.sent_at = latest.max_at
        JOIN users u ON e.recruiter_id = u.id
        LEFT JOIN emails e2 ON e2.driver_id = d.id
        GROUP BY d.id
        ORDER BY latest.max_at DESC
      `;
    } else {
      sql = `
        SELECT
          d.id as driver_id,
          d.name as driver_name,
          d.email as driver_email,
          u.name as recruiter_name,
          u.email as recruiter_email,
          u.avatar_color as recruiter_color,
          e.subject as last_subject,
          e.body as last_body,
          e.sent_at as last_at,
          COUNT(e2.id) as email_count
        FROM drivers d
        JOIN (
          SELECT driver_id, MAX(sent_at) as max_at
          FROM emails
          WHERE recruiter_id = ?
          GROUP BY driver_id
        ) latest ON latest.driver_id = d.id
        JOIN emails e ON e.driver_id = d.id AND e.sent_at = latest.max_at AND e.recruiter_id = ?
        JOIN users u ON e.recruiter_id = u.id
        LEFT JOIN emails e2 ON e2.driver_id = d.id AND e2.recruiter_id = ?
        GROUP BY d.id
        ORDER BY latest.max_at DESC
      `;
      params = [req.user.id, req.user.id, req.user.id];
    }

    try {
      res.json(db.prepare(sql).all(...params));
    } catch (e) {
      res.json([]);
    }
  });

  // Email thread for a driver
  router.get('/', (req, res) => {
    const { driver_id } = req.query;
    const isAdmin = req.user.role === 'admin';
    const params = [];
    let sql = `SELECT e.*, d.name as driver_name, d.email as driver_email,
                      u.name as recruiter_name, u.email as recruiter_from_email, u.avatar_color as recruiter_color
               FROM emails e
               JOIN drivers d ON e.driver_id = d.id
               JOIN users u ON e.recruiter_id = u.id
               WHERE 1=1`;
    if (!isAdmin) { sql += ' AND e.recruiter_id = ?'; params.push(req.user.id); }
    if (driver_id) { sql += ' AND e.driver_id = ?'; params.push(Number(driver_id)); }
    sql += ' ORDER BY e.sent_at ASC LIMIT 500';
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
      recruiter_email: recruiter.email || '',
      recruiter_phone: recruiter.phone || '',
      company: process.env.EMAIL_COMPANY_NAME || 'One Prime Fleet'
    };

    const finalSubject = applyVars(subject, vars);
    const finalBody = applyVars(body, vars);

    const transporter = getTransporter();
    if (transporter && driver.email) {
      const fromAddress = buildFromAddress(recruiter.email);
      try {
        await transporter.sendMail({
          from: `"${recruiter.name} — One Prime Fleet" <${fromAddress}>`,
          replyTo: recruiter.email || fromAddress,
          to: `"${driver.name}" <${driver.email}>`,
          subject: finalSubject,
          text: finalBody
        });
      } catch (err) {
        return res.status(500).json({ error: 'Send error: ' + err.message });
      }
    } else {
      console.log('\n--- MOCK EMAIL ---');
      console.log(`From: ${recruiter.name} <${buildFromAddress(recruiter.email)}>`);
      console.log(`ReplyTo: ${recruiter.email}`);
      console.log(`To: ${driver.name} <${driver.email || 'no-email'}>`);
      console.log(`Subject: ${finalSubject}`);
      console.log(`Body:\n${finalBody}`);
      console.log('--- END EMAIL ---\n');
    }

    const result = db.prepare('INSERT INTO emails (driver_id, recruiter_id, subject, body, template_used) VALUES (?, ?, ?, ?, ?)').run(Number(driver_id), req.user.id, finalSubject, finalBody, template_used || null);
    db.prepare('INSERT INTO activities (recruiter_id, driver_id, action, details) VALUES (?, ?, ?, ?)').run(req.user.id, Number(driver_id), 'email_sent', `Email sent: ${finalSubject}`);

    const email = db.prepare(`SELECT e.*, u.name as recruiter_name, u.email as recruiter_from_email, u.avatar_color as recruiter_color
                               FROM emails e JOIN users u ON e.recruiter_id = u.id WHERE e.id = ?`).get(result.lastInsertRowid);
    res.status(201).json({ ...email, mock: !transporter });
  });

  return router;
};
