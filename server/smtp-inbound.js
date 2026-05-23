const { SMTPServer } = require('smtp-server');
const { simpleParser } = require('mailparser');

module.exports = function startSmtpInbound(db) {
  const DOMAIN = process.env.EMAIL_SENDING_DOMAIN || 'contact.oneprimefleet.com';

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
          const body     = mail.text   || mail.html?.replace(/<[^>]+>/g, '') || '';

          const username = toAddr.split('@')[0];

          // Find recruiter by matching the username part of their profile email
          const recruiter = db.prepare(
            `SELECT * FROM users WHERE lower(substr(email, 1, instr(email,'@')-1)) = ?`
          ).get(username);

          if (!recruiter) {
            console.log(`[SMTP] No recruiter found for username: ${username}`);
            return callback();
          }

          // Find driver by their email address
          const driver = db.prepare(
            `SELECT * FROM drivers WHERE lower(email) = ?`
          ).get(fromAddr);

          if (!driver) {
            console.log(`[SMTP] Inbound from unknown driver: ${fromAddr} — ignored`);
            return callback();
          }

          db.prepare(
            `INSERT INTO emails (driver_id, recruiter_id, subject, body, direction, sent_at)
             VALUES (?, ?, ?, ?, 'inbound', CURRENT_TIMESTAMP)`
          ).run(driver.id, recruiter.id, subject, body.trim());

          console.log(`[SMTP] Inbound email saved: ${fromAddr} → ${toAddr} | "${subject}"`);
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
