const express = require('express');
const https = require('https');
const multer = require('multer');
const path = require('path');
const { authMiddleware } = require('../middleware/auth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB per file
  fileFilter(_, file, cb) {
    const allowed = /\.(jpg|jpeg|png|gif|pdf|doc|docx|xls|xlsx)$/i;
    cb(null, allowed.test(file.originalname));
  }
});

function applyVars(text, vars) {
  return Object.entries(vars).reduce((t, [k, v]) => t.split(`{${k}}`).join(v || ''), text);
}

function buildFromAddress(recruiterEmail) {
  const domain = process.env.EMAIL_SENDING_DOMAIN || 'contact.oneprimefleet.com';
  if (!recruiterEmail) return `noreply@${domain}`;
  return `${recruiterEmail.split('@')[0]}@${domain}`;
}

function buildHtml(body, recruiterName, recruiterPhone, recruiterEmail) {
  const escaped = body
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; background:#f4f4f4; margin:0; padding:0; }
  .wrap { max-width:600px; margin:30px auto; background:#fff; border-radius:8px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,.08); }
  .header { background:#2563EB; padding:20px 30px; }
  .header span { color:#fff; font-size:18px; font-weight:700; }
  .body { padding:30px; color:#333; font-size:15px; line-height:1.7; }
  .footer { background:#f9f9f9; border-top:1px solid #eee; padding:16px 30px; font-size:12px; color:#888; }
</style></head>
<body>
  <div class="wrap">
    <div class="header"><span>One Prime Fleet</span></div>
    <div class="body">${escaped}</div>
    <div class="footer">
      ${recruiterName} — One Prime Fleet<br>
      ${recruiterPhone ? `Phone: ${recruiterPhone}<br>` : ''}
      ${recruiterEmail ? `Email: ${recruiterEmail}` : ''}
    </div>
  </div>
</body></html>`;
}

function sendViaResend(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: 'api.resend.com',
      path: '/emails',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(JSON.parse(data));
        else reject(new Error(`Resend API error ${res.statusCode}: ${data}`));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = function (db) {
  const router = express.Router();
  router.use(authMiddleware);

  const isLive = () => process.env.EMAIL_MOCK !== 'false' ? false : !!process.env.RESEND_API_KEY;

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

  // Conversation list
  router.get('/conversations', (req, res) => {
    const isAdmin = req.user.role === 'admin';
    let sql, params = [];
    if (isAdmin) {
      sql = `
        SELECT d.id as driver_id, d.name as driver_name, d.email as driver_email,
          u.name as recruiter_name, u.email as recruiter_email, u.avatar_color as recruiter_color,
          e.subject as last_subject, e.body as last_body, e.sent_at as last_at,
          COUNT(e2.id) as email_count
        FROM drivers d
        JOIN (SELECT driver_id, MAX(sent_at) as max_at FROM emails GROUP BY driver_id) latest ON latest.driver_id = d.id
        JOIN emails e ON e.driver_id = d.id AND e.sent_at = latest.max_at
        JOIN users u ON e.recruiter_id = u.id
        LEFT JOIN emails e2 ON e2.driver_id = d.id
        GROUP BY d.id ORDER BY latest.max_at DESC`;
    } else {
      sql = `
        SELECT d.id as driver_id, d.name as driver_name, d.email as driver_email,
          u.name as recruiter_name, u.email as recruiter_email, u.avatar_color as recruiter_color,
          e.subject as last_subject, e.body as last_body, e.sent_at as last_at,
          COUNT(e2.id) as email_count
        FROM drivers d
        JOIN (SELECT driver_id, MAX(sent_at) as max_at FROM emails WHERE recruiter_id = ? GROUP BY driver_id) latest ON latest.driver_id = d.id
        JOIN emails e ON e.driver_id = d.id AND e.sent_at = latest.max_at AND e.recruiter_id = ?
        JOIN users u ON e.recruiter_id = u.id
        LEFT JOIN emails e2 ON e2.driver_id = d.id AND e2.recruiter_id = ?
        GROUP BY d.id ORDER BY latest.max_at DESC`;
      params = [req.user.id, req.user.id, req.user.id];
    }
    try { res.json(db.prepare(sql).all(...params)); } catch (e) { res.json([]); }
  });

  // Email thread
  router.get('/', (req, res) => {
    const { driver_id } = req.query;
    const isAdmin = req.user.role === 'admin';
    const params = [];
    let sql = `SELECT e.*, d.name as driver_name, d.email as driver_email,
                      u.name as recruiter_name, u.email as recruiter_from_email, u.avatar_color as recruiter_color
               FROM emails e JOIN drivers d ON e.driver_id = d.id JOIN users u ON e.recruiter_id = u.id WHERE 1=1`;
    if (!isAdmin) { sql += ' AND e.recruiter_id = ?'; params.push(req.user.id); }
    if (driver_id) { sql += ' AND e.driver_id = ?'; params.push(Number(driver_id)); }
    sql += ' ORDER BY e.sent_at ASC LIMIT 500';
    res.json(db.prepare(sql).all(...params));
  });

  // Send email with optional file attachments
  router.post('/send', upload.array('attachments', 10), async (req, res) => {
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
      company: 'One Prime Fleet'
    };

    const finalSubject = applyVars(subject, vars);
    const finalBody    = applyVars(body, vars);
    const fromAddress  = buildFromAddress(recruiter.email);

    // Build attachments list
    const attachments = (req.files || []).map(f => ({
      filename: f.originalname,
      content:  f.buffer.toString('base64')
    }));

    if (isLive() && driver.email) {
      try {
        await sendViaResend({
          from:       `${recruiter.name} — One Prime Fleet <${fromAddress}>`,
          reply_to:   fromAddress,
          to:         [driver.email],
          subject:    finalSubject,
          text:       finalBody,
          html:       buildHtml(finalBody, recruiter.name, recruiter.phone, recruiter.email),
          ...(attachments.length > 0 && { attachments })
        });
      } catch (err) {
        return res.status(500).json({ error: 'Send error: ' + err.message });
      }
    } else {
      console.log(`\n--- MOCK EMAIL ---`);
      console.log(`From: ${recruiter.name} <${fromAddress}>`);
      console.log(`To: ${driver.name} <${driver.email || 'no-email'}>`);
      console.log(`Subject: ${finalSubject}`);
      console.log(`Attachments: ${attachments.map(a => a.filename).join(', ') || 'none'}`);
      console.log(`Body:\n${finalBody}\n--- END ---\n`);
    }

    const attachmentNames = attachments.map(a => a.filename).join(', ') || null;
    const result = db.prepare(
      'INSERT INTO emails (driver_id, recruiter_id, subject, body, template_used, attachments) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(Number(driver_id), req.user.id, finalSubject, finalBody, template_used || null, attachmentNames);

    db.prepare('INSERT INTO activities (recruiter_id, driver_id, action, details) VALUES (?, ?, ?, ?)').run(req.user.id, Number(driver_id), 'email_sent', `Email sent: ${finalSubject}`);

    const email = db.prepare(`SELECT e.*, u.name as recruiter_name, u.email as recruiter_from_email, u.avatar_color as recruiter_color
                               FROM emails e JOIN users u ON e.recruiter_id = u.id WHERE e.id = ?`).get(result.lastInsertRowid);
    res.status(201).json({ ...email, mock: !isLive() });
  });

  return router;
};
