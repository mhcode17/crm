require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const app = express();
const PORT = process.env.PORT || 3001;
const isProd = process.env.NODE_ENV === 'production';

app.use(cors({
  origin: isProd ? false : (process.env.CLIENT_URL || 'http://localhost:5173'),
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

async function startServer() {
  const db = await require('./database');

  app.use('/api/auth',    require('./routes/auth')(db));
  app.use('/api/drivers', require('./routes/drivers')(db));
  app.use('/api/emails',  require('./routes/emails')(db));
  app.use('/api/stats',   require('./routes/stats')(db));
  app.use('/api/users',   require('./routes/users')(db));
  app.use('/api/leads',   require('./routes/leads')(db));

  app.use('/api/sms',   require('./routes/sms')(db));

  // Public — no auth required
  app.use('/api/apply', require('./routes/apply')(db));
  app.use('/uploads', express.static(uploadsDir));
  app.get('/api/health',  (_, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

  // In production: serve built React app from client/dist
  const clientDist = path.join(__dirname, '../client/dist');
  if (isProd && fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (_, res) => res.sendFile(path.join(clientDist, 'index.html')));
    console.log(`📁 Serving React app from ${clientDist}`);
  }

  app.listen(PORT, () => {
    console.log(`\n🚀 TruckRecruit CRM running on http://localhost:${PORT}`);
    console.log(`🌍 Mode: ${isProd ? 'PRODUCTION' : 'DEVELOPMENT'}`);
    console.log(`📧 Email: ${process.env.EMAIL_MOCK !== 'false' ? 'MOCK (console)' : 'SMTP'}\n`);
  });
}

startServer().catch(err => { console.error('Startup error:', err); process.exit(1); });
