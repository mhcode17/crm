const { SMTPServer } = require('smtp-server');
const { simpleParser } = require('mailparser');
const path = require('path');
const fs = require('fs');

module.exports = function startSmtpInbound(db) {
  const DOMAIN = process.env.EMAIL_SENDING_DOMAIN || 'contact.oneprimefleet.com';
  const emailFilesDir = path.join(__dirname, 'uploads/email_files');
  if (!fs.existsSync(emailFilesDir)) fs.mkdirSync(emailFilesDir, { recursive: true });

  const server = new SMTPServer({
    authOptional: true,
    disabledCommands: ['AUTH'],
    banner: 'One Prime Fleet Inbound Mail',

    onRcptTo(address, session, callback) {
      if (address.address.toLowerCase().endsWith(`@${DOMAIN}`)) return callback();
      const err = new Error('Mailbox not found');
      err.responseCode = 550;
      return callback(err);
    },

    onData(stream, session, callback) {
      simpleParser(stream, (err, mail) => {
        if (err) { console.error('[SMTP] Parse error:', err.message); return callback(); }

        try {
          const toAddr   = (session.envelope.rcptTo[0]?.address || '').toLowerCase();
          const fromAddr = (mail.from?.value[0]?.address || '').toLowerCase();
          const subject  = mail.subject || '(no subject)';
          const body     = mail.text || mail.html?.replace(/<[^>]+>/g, '') || '';

          const username = toAddr.split('@')[0];

          const recruiter = db.prepare(
            `SELECT * FROM users WHERE lower(substr(email, 1, instr(email,'@')-1)) = ?`
          ).get(username);

          if (!recruiter) {
            console.log(`[SMTP] No recruiter found for username: ${username}`);
            return callback();
          }

          const driver = db.prepare(
            `SELECT * FROM drivers WHERE lower(email) = ?`
          ).get(fromAddr);

          if (!driver) {
            console.log(`[SMTP] Inbound from unknown driver: ${fromAddr} — ignored`);
            return callback();
          }

          // Save image/file attachments (skip tiny signature images < 2 KB)
          const savedFiles = [];
          for (const att of (mail.attachments || [])) {
            if (!att.content || att.content.length < 2048) continue;
            const mime = att.contentType || 'application/octet-stream';
            const isImage = mime.startsWith('image/');
            const isDoc = /\/(pdf|msword|vnd\.(openxml|ms-excel))/.test(mime);
            if (!isImage && !isDoc) continue;

            const ext = path.extname(att.filename || '') || (isImage ? '.jpg' : '.bin');
            const savedName = `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
            fs.writeFileSync(path.join(emailFilesDir, savedName), att.content);
            savedFiles.push({
              filename: att.filename || savedName,
              path: `/uploads/email_files/${savedName}`,
              mime,
            });
          }

          const attachmentsJson = savedFiles.length > 0 ? JSON.stringify(savedFiles) : null;

          db.prepare(
            `INSERT INTO emails (driver_id, recruiter_id, subject, body, direction, attachments, sent_at)
             VALUES (?, ?, ?, ?, 'inbound', ?, CURRENT_TIMESTAMP)`
          ).run(driver.id, recruiter.id, subject, body.trim(), attachmentsJson);

          console.log(`[SMTP] Saved inbound: ${fromAddr} → ${toAddr} | "${subject}" | ${savedFiles.length} file(s)`);
        } catch (e) {
          console.error('[SMTP] DB error:', e.message);
        }

        callback();
      });
    },

    onError(err) {
      console.error('[SMTP] Server error:', err.message);
    }
  });

  server.listen(25, '0.0.0.0', () => {
    console.log(`[SMTP] Inbound server listening on port 25 for @${DOMAIN}`);
  });

  server.on('error', err => {
    console.error('[SMTP] Failed to start:', err.message);
  });

  return server;
};
