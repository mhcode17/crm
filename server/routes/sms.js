const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { authMiddleware } = require('../middleware/auth');

// Download Twilio media file with Basic Auth and save locally
function downloadTwilioMedia(mediaUrl, contentType, accountSid, authToken, uploadsDir) {
  return new Promise((resolve, reject) => {
    const ext = { 'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/png': '.png',
      'image/gif': '.gif', 'image/webp': '.webp', 'image/heic': '.heic' }[contentType] || '.jpg';
    const filename = `mms-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
    const destPath = path.join(uploadsDir, filename);
    const auth = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    function fetch(url) {
      const mod = url.startsWith('https') ? https : http;
      const req = mod.get(url, { headers: { Authorization: auth } }, res => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return fetch(res.headers.location);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        const file = fs.createWriteStream(destPath);
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve(filename)));
        file.on('error', reject);
      });
      req.on('error', reject);
    }
    fetch(mediaUrl);
  });
}

const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (_, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random()*1e6)}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => cb(null, /image\/(jpeg|jpg|png|gif|webp)/i.test(file.mimetype)),
});

module.exports = function (db) {
  const router = express.Router();

  const MOCK = process.env.SMS_MOCK !== 'false';
  const TWILIO_FROM = process.env.TWILIO_PHONE_NUMBER || '';
  const APP_URL = process.env.APP_URL || 'http://localhost:5173';

  let twilio = null;
  if (!MOCK && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    try {
      twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      console.log('✅ Twilio client initialized');
    } catch (e) {
      console.warn('⚠️  Twilio init failed:', e.message);
    }
  }

  function applyVars(text, vars) {
    return Object.entries(vars).reduce((t, [k, v]) => t.split(`{${k}}`).join(v || ''), text);
  }

  // ── GET /api/sms/conversations ─────────────────────────────────────
  // Recruiter sees ONLY their own conversations. Admin sees all.
  router.get('/conversations', authMiddleware, (req, res) => {
    const rid = req.user.id;
    const isAdmin = req.user.role === 'admin';

    // 1. Driver-based conversations (recruiter must have participated)
    const driverParams = isAdmin ? [] : [rid];
    const driverWhere = isAdmin
      ? ''
      : `AND EXISTS (SELECT 1 FROM sms_messages sm2 WHERE sm2.driver_id = d.id AND sm2.recruiter_id = ?)`;

    const driverConvos = db.prepare(`
      SELECT d.id as driver_id, d.name, d.phone,
        u.name as recruiter_name, u.avatar_color as recruiter_color,
        (SELECT body FROM sms_messages WHERE driver_id = d.id ORDER BY created_at DESC LIMIT 1) as last_body,
        (SELECT direction FROM sms_messages WHERE driver_id = d.id ORDER BY created_at DESC LIMIT 1) as last_direction,
        (SELECT created_at FROM sms_messages WHERE driver_id = d.id ORDER BY created_at DESC LIMIT 1) as last_at,
        (SELECT COUNT(*) FROM sms_messages WHERE driver_id = d.id AND direction = 'inbound') as inbound_count
      FROM drivers d
      JOIN users u ON d.recruiter_id = u.id
      WHERE d.phone IS NOT NULL ${driverWhere}
    `).all(...driverParams);

    // 2. Standalone conversations (driver_id IS NULL — sent to unknown numbers)
    const standaloneParams = isAdmin ? [] : [rid];
    const standaloneWhere = isAdmin ? '' : 'AND sm.recruiter_id = ?';

    const standalone = db.prepare(`
      SELECT
        NULL as driver_id,
        COALESCE(MAX(sm.contact_name), sm.phone_to) as name,
        sm.phone_to as phone,
        u.name as recruiter_name, u.avatar_color as recruiter_color,
        MAX(sm.body) as last_body,
        MAX(sm.direction) as last_direction,
        MAX(sm.created_at) as last_at,
        SUM(CASE WHEN sm.direction='inbound' THEN 1 ELSE 0 END) as inbound_count
      FROM sms_messages sm
      JOIN users u ON sm.recruiter_id = u.id
      WHERE sm.driver_id IS NULL AND sm.phone_to IS NOT NULL ${standaloneWhere}
      GROUP BY sm.phone_to, sm.recruiter_id
    `).all(...standaloneParams);

    // Merge and sort by last_at (most recent first)
    const all = [...driverConvos, ...standalone].sort((a, b) => {
      if (!a.last_at && !b.last_at) return 0;
      if (!a.last_at) return 1;
      if (!b.last_at) return -1;
      return b.last_at.localeCompare(a.last_at);
    });

    res.json(all);
  });

  // ── GET /api/sms/messages/driver/:id ──────────────────────────────
  router.get('/messages/driver/:driverId', authMiddleware, (req, res) => {
    const id = Number(req.params.driverId);
    const driver = db.prepare('SELECT * FROM drivers WHERE id = ?').get(id);
    if (!driver) return res.status(404).json({ error: 'Driver not found' });

    // Allow if admin OR recruiter participated in this conversation
    if (req.user.role !== 'admin') {
      const participated = db.prepare('SELECT 1 FROM sms_messages WHERE driver_id = ? AND recruiter_id = ? LIMIT 1').get(id, req.user.id);
      if (!participated) return res.status(403).json({ error: 'Access denied' });
    }

    const messages = db.prepare(`
      SELECT m.*, u.name as recruiter_name
      FROM sms_messages m
      LEFT JOIN users u ON m.recruiter_id = u.id
      WHERE m.driver_id = ?
      ORDER BY m.created_at ASC
    `).all(id);
    res.json(messages);
  });

  // ── GET /api/sms/messages/phone/:phone ────────────────────────────
  // For standalone conversations (driver_id IS NULL)
  router.get('/messages/phone/:phone', authMiddleware, (req, res) => {
    const phone = decodeURIComponent(req.params.phone);
    const isAdmin = req.user.role === 'admin';
    const params = isAdmin ? [phone, phone] : [phone, phone, req.user.id];
    const where = isAdmin ? '' : 'AND (m.recruiter_id = ? OR m.direction = \'inbound\')';

    const messages = db.prepare(`
      SELECT m.*, u.name as recruiter_name
      FROM sms_messages m
      LEFT JOIN users u ON m.recruiter_id = u.id
      WHERE (m.phone_to = ? OR m.phone_from = ?) AND m.driver_id IS NULL ${where}
      ORDER BY m.created_at ASC
    `).all(...params);
    res.json(messages);
  });

  // ── POST /api/sms/send ─────────────────────────────────────────────
  router.post('/send', authMiddleware, async (req, res) => {
    const { driver_id, phone: rawPhone, name: rawName, body, media_url } = req.body;
    if (!body?.trim()) return res.status(400).json({ error: 'Message body is required' });
    if (!driver_id && !rawPhone) return res.status(400).json({ error: 'Provide driver_id or phone number' });

    let driver = null;
    let toPhone = rawPhone?.trim();
    let recipientName = rawName?.trim() || toPhone;

    if (driver_id) {
      driver = db.prepare('SELECT * FROM drivers WHERE id = ?').get(Number(driver_id));
      if (!driver) return res.status(404).json({ error: 'Driver not found' });
      if (!driver.phone) return res.status(400).json({ error: 'Driver has no phone number' });
      if (req.user.role !== 'admin' && driver.recruiter_id !== req.user.id) return res.status(403).json({ error: 'Access denied' });
      toPhone = driver.phone;
      recipientName = driver.name;
    } else {
      // Try to match existing driver by phone
      driver = db.prepare('SELECT * FROM drivers WHERE phone = ?').get(toPhone) || null;
      if (!driver) {
        // Also try normalised match (strip non-digits)
        const digits = toPhone.replace(/\D/g, '');
        driver = db.prepare('SELECT * FROM drivers WHERE replace(replace(replace(replace(phone, " ",""), "-",""), "(",""), ")","") LIKE ?').get(`%${digits}`) || null;
      }
    }

    if (!toPhone) return res.status(400).json({ error: 'No phone number' });

    const recruiter = db.prepare('SELECT name, phone FROM users WHERE id = ?').get(req.user.id);
    const vars = {
      name: recipientName,
      recruiter_name: recruiter.name,
      recruiter_phone: recruiter.phone || '',
      apply_link: `${APP_URL}/apply`,
    };
    const finalBody = applyVars(body.trim(), vars);

    // Save to DB first — history is preserved even if Twilio delivery fails
    const result = db.prepare(`
      INSERT INTO sms_messages (driver_id, phone_to, contact_name, direction, body, status, twilio_sid, recruiter_id, media_urls)
      VALUES (?, ?, ?, 'outbound', ?, 'queued', NULL, ?, ?)
    `).run(driver?.id || null, toPhone, driver ? null : recipientName, finalBody, req.user.id, media_url ? JSON.stringify([media_url]) : null);

    const msgId = result.lastInsertRowid;
    let status = 'sent';
    let twilioSid = null;
    let twilioError = null;

    if (twilio) {
      try {
        const params = { body: finalBody, from: TWILIO_FROM, to: toPhone };
        if (media_url) params.mediaUrl = [media_url];
        const msg = await twilio.messages.create(params);
        twilioSid = msg.sid;
        status = msg.status;
      } catch (err) {
        status = 'failed';
        twilioError = err.message;
        console.warn(`⚠️  Twilio send failed to ${toPhone}: ${err.message}`);
      }
    } else {
      console.log('\n--- MOCK SMS ---');
      console.log(`To: ${toPhone} (${recipientName})`);
      console.log(`Body: ${finalBody}`);
      console.log('--- END SMS ---\n');
    }

    // Update status and sid
    db.prepare('UPDATE sms_messages SET status = ?, twilio_sid = ? WHERE id = ?').run(status, twilioSid, msgId);

    if (driver?.id) {
      db.prepare('INSERT INTO activities (recruiter_id, driver_id, action, details) VALUES (?, ?, ?, ?)')
        .run(req.user.id, driver.id, 'sms_sent', `SMS ${status === 'failed' ? 'failed' : 'sent'} to ${recipientName}`);
    }

    const msg = db.prepare(`
      SELECT m.*, u.name as recruiter_name FROM sms_messages m
      LEFT JOIN users u ON m.recruiter_id = u.id WHERE m.id = ?
    `).get(msgId);

    const response = { ...msg, recipient_name: recipientName, mock: !twilio };
    if (twilioError) response.warning = `Saved but not delivered: ${twilioError}`;
    res.status(201).json(response);
  });

  // ── GET /api/sms/media — proxy Twilio media (no auth required for img tags) ──
  // Downloads from Twilio using server credentials, saves locally, then redirects
  router.get('/media', async (req, res) => {
    const { url } = req.query;
    if (!url || !url.includes('api.twilio.com')) return res.status(400).send('Invalid URL');
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return res.status(503).send('No credentials');

    try {
      // Download from Twilio + save locally
      const filename = await downloadTwilioMedia(
        url, 'image/jpeg',
        process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN,
        uploadsDir
      );
      const localPath = path.join(uploadsDir, filename);

      // Update DB: replace Twilio URL with local URL in all messages
      const localUrl = `/uploads/${filename}`;
      const msgs = db.prepare("SELECT id, media_urls FROM sms_messages WHERE media_urls LIKE '%api.twilio.com%'").all();
      msgs.forEach(m => {
        try {
          const urls = JSON.parse(m.media_urls);
          const updated = urls.map(u => u === url ? localUrl : u);
          db.prepare('UPDATE sms_messages SET media_urls = ? WHERE id = ?').run(JSON.stringify(updated), m.id);
        } catch { /* skip */ }
      });

      // Serve the file directly
      res.sendFile(localPath);
    } catch (e) {
      // Fallback: stream directly from Twilio
      const auth = 'Basic ' + Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
      function proxyFetch(target) {
        const mod = target.startsWith('https') ? https : http;
        mod.get(target, { headers: { Authorization: auth } }, remote => {
          if (remote.statusCode === 301 || remote.statusCode === 302) return proxyFetch(remote.headers.location);
          res.set('Content-Type', remote.headers['content-type'] || 'image/jpeg');
          remote.pipe(res);
        }).on('error', () => res.status(502).send('Fetch failed'));
      }
      proxyFetch(url);
    }
  });

  // ── POST /api/sms/upload — upload photo for MMS ───────────────────
  router.post('/upload', authMiddleware, upload.single('media'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No image file provided' });
    const url = `${APP_URL}/uploads/${req.file.filename}`;
    res.json({ url, filename: req.file.filename });
  });

  // ── POST /api/sms/webhook — Twilio inbound (SMS + MMS) ─────────────
  router.post('/webhook', async (req, res) => {
    // Respond to Twilio immediately — must reply within 15 seconds
    res.set('Content-Type', 'text/xml').send('<Response></Response>');

    const { From, Body, MessageSid, NumMedia } = req.body || {};
    if (!From) return;

    const driver = db.prepare('SELECT id FROM drivers WHERE phone = ?').get(From);
    const numMedia = parseInt(NumMedia || 0);

    // Download each media file from Twilio → save locally
    const localUrls = [];
    for (let i = 0; i < numMedia; i++) {
      const twilioUrl = req.body[`MediaUrl${i}`];
      const contentType = req.body[`MediaContentType${i}`] || 'image/jpeg';
      if (!twilioUrl) continue;

      if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        try {
          const filename = await downloadTwilioMedia(
            twilioUrl, contentType,
            process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN,
            uploadsDir
          );
          localUrls.push(`/uploads/${filename}`);
          console.log(`📥 MMS photo saved: ${filename}`);
        } catch (e) {
          console.warn(`⚠️  Failed to download MMS media: ${e.message}`);
          localUrls.push(twilioUrl); // fallback: store original URL
        }
      } else {
        localUrls.push(twilioUrl);
      }
    }

    db.prepare(`
      INSERT INTO sms_messages (driver_id, phone_from, phone_to, direction, body, status, twilio_sid, media_urls)
      VALUES (?, ?, ?, 'inbound', ?, 'received', ?, ?)
    `).run(
      driver?.id || null, From, TWILIO_FROM,
      Body || '', MessageSid || null,
      localUrls.length ? JSON.stringify(localUrls) : null
    );

    console.log(`📥 Inbound ${localUrls.length ? 'MMS' : 'SMS'} from ${From}: ${Body || ''} ${localUrls.length ? `[${localUrls.length} photo(s)]` : ''}`);
  });

  // ── Templates ──────────────────────────────────────────────────────
  router.get('/templates', authMiddleware, (_, res) => {
    res.json(db.prepare('SELECT * FROM sms_templates ORDER BY id').all());
  });

  router.post('/templates', authMiddleware, (req, res) => {
    const { name, body } = req.body;
    if (!name || !body) return res.status(400).json({ error: 'Name and body required' });
    const result = db.prepare('INSERT INTO sms_templates (name, body, created_by) VALUES (?, ?, ?)').run(name, body, req.user.id);
    res.status(201).json(db.prepare('SELECT * FROM sms_templates WHERE id = ?').get(result.lastInsertRowid));
  });

  router.delete('/templates/:id', authMiddleware, (req, res) => {
    db.prepare('DELETE FROM sms_templates WHERE id = ?').run(Number(req.params.id));
    res.json({ success: true });
  });

  // ── Status ─────────────────────────────────────────────────────────
  router.get('/status', authMiddleware, (_, res) => {
    res.json({ mock: !twilio, twilio_number: TWILIO_FROM || null, apply_link: `${APP_URL}/apply` });
  });

  return router;
};
