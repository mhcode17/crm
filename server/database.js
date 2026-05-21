const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'crm.db');

function normalizeParams(args) {
  if (args.length === 0) return [];
  if (args.length === 1 && Array.isArray(args[0])) return args[0];
  return args;
}

function makeWrapper(sqlDb) {
  let saveTimer = null;

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const data = sqlDb.export();
      fs.writeFileSync(DB_PATH, Buffer.from(data));
    }, 300);
  }

  return {
    prepare(sql) {
      const isInsert = /^\s*INSERT/i.test(sql);
      const isWrite  = /^\s*(INSERT|UPDATE|DELETE)/i.test(sql);
      return {
        run(...args) {
          const params = normalizeParams(args);
          try { sqlDb.run(sql, params); } catch (e) { throw new Error(e.message + '\nSQL: ' + sql); }
          if (isWrite) scheduleSave();
          if (isInsert) {
            const r = sqlDb.exec('SELECT last_insert_rowid()');
            return { lastInsertRowid: r[0]?.values[0][0] || 0 };
          }
          return { changes: 1 };
        },
        get(...args) {
          const params = normalizeParams(args);
          const result = sqlDb.exec(sql, params);
          if (!result[0] || result[0].values.length === 0) return undefined;
          return Object.fromEntries(result[0].columns.map((c, i) => [c, result[0].values[0][i]]));
        },
        all(...args) {
          const params = normalizeParams(args);
          const result = sqlDb.exec(sql, params);
          if (!result[0]) return [];
          return result[0].values.map(row =>
            Object.fromEntries(result[0].columns.map((c, i) => [c, row[i]]))
          );
        }
      };
    },
    runSql(sql) {
      sqlDb.run(sql);
      scheduleSave();
    }
  };
}

async function initDb() {
  const SQL = await initSqlJs();
  const fileData = fs.existsSync(DB_PATH) ? fs.readFileSync(DB_PATH) : undefined;
  const sqlDb = fileData ? new SQL.Database(fileData) : new SQL.Database();
  const db = makeWrapper(sqlDb);

  // ── Migrations for existing databases ──────────────────────────────
  const migrations = [
    'ALTER TABLE users ADD COLUMN points INTEGER DEFAULT 100',
    'ALTER TABLE drivers ADD COLUMN lead_id INTEGER',
    'ALTER TABLE sms_messages ADD COLUMN contact_name TEXT',
    'ALTER TABLE sms_messages ADD COLUMN media_urls TEXT',
    'ALTER TABLE driver_files ADD COLUMN label TEXT',
    'ALTER TABLE lead_documents ADD COLUMN label TEXT',
    `CREATE TABLE IF NOT EXISTS driver_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      driver_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT,
      mime_type TEXT,
      uploaded_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (driver_id) REFERENCES drivers(id),
      FOREIGN KEY (uploaded_by) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS sms_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      driver_id INTEGER,
      phone_to TEXT,
      phone_from TEXT,
      contact_name TEXT,
      direction TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT DEFAULT 'sent',
      twilio_sid TEXT,
      recruiter_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (driver_id) REFERENCES drivers(id),
      FOREIGN KEY (recruiter_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS sms_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      body TEXT NOT NULL,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS lead_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT,
      mime_type TEXT,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lead_id) REFERENCES leads(id)
    )`,
  ];
  migrations.forEach(m => { try { sqlDb.run(m); } catch (e) { /* already applied */ } });
  // Ensure existing users have points
  sqlDb.run("UPDATE users SET points = 100 WHERE points IS NULL");

  const schema = [
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'recruiter',
      phone TEXT,
      avatar_color TEXT DEFAULT '#3b82f6',
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS drivers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      city TEXT,
      state TEXT,
      status TEXT DEFAULT 'new',
      recruiter_id INTEGER NOT NULL,
      start_date DATE,
      truck_type TEXT,
      license_class TEXT,
      experience_years INTEGER DEFAULT 0,
      source TEXT,
      salary_expectation TEXT,
      bio TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      driver_id INTEGER NOT NULL,
      old_status TEXT,
      new_status TEXT NOT NULL,
      changed_by INTEGER NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      driver_id INTEGER NOT NULL,
      recruiter_id INTEGER NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      template_used TEXT,
      status TEXT DEFAULT 'sent',
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      driver_id INTEGER NOT NULL,
      recruiter_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recruiter_id INTEGER,
      driver_id INTEGER,
      action TEXT NOT NULL,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS email_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      city TEXT,
      state TEXT,
      truck_type TEXT,
      license_class TEXT,
      experience_years INTEGER DEFAULT 0,
      notes TEXT,
      source TEXT DEFAULT 'Facebook',
      status TEXT DEFAULT 'available',
      claimed_by INTEGER,
      claimed_at DATETIME,
      completed_at DATETIME,
      overdue_deducted INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (claimed_by) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS lead_transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL,
      from_recruiter_id INTEGER NOT NULL,
      to_recruiter_id INTEGER NOT NULL,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lead_id) REFERENCES leads(id),
      FOREIGN KEY (from_recruiter_id) REFERENCES users(id),
      FOREIGN KEY (to_recruiter_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS point_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recruiter_id INTEGER NOT NULL,
      lead_id INTEGER,
      action TEXT NOT NULL,
      points_change INTEGER NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (recruiter_id) REFERENCES users(id),
      FOREIGN KEY (lead_id) REFERENCES leads(id)
    )`
  ];

  schema.forEach(s => sqlDb.run(s));

  // Seed SMS templates if empty
  const smsTemplateCount = db.prepare('SELECT COUNT(*) as c FROM sms_templates').get().c;
  if (smsTemplateCount === 0) {
    const smsTpl = db.prepare('INSERT INTO sms_templates (name, body, created_by) VALUES (?, ?, ?)');
    const firstAdmin = db.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").get();
    const adminId = firstAdmin?.id || 1;
    smsTpl.run('Apply Invite', 'Hi {name}! We have great trucking opportunities waiting for you. Apply now: {apply_link} – {recruiter_name}', adminId);
    smsTpl.run('Follow Up', "Hi {name}, this is {recruiter_name}! Still interested in driving with us? Reply YES and we'll connect right away 🚛", adminId);
    smsTpl.run('Interview Invite', "Hi {name}! You've been selected for an interview. Please reply with your availability. – {recruiter_name}", adminId);
    smsTpl.run('Quick Check-In', "Hi {name}, just checking in! Any questions about the position? We'd love to have you on our team. – {recruiter_name}", adminId);
    smsTpl.run('Documents Reminder', 'Hi {name}, please bring your CDL and DOT medical card to our next meeting. – {recruiter_name}', adminId);
    smsTpl.run('Offer Confirmation', 'Hi {name}! Great news – we have an offer for you. Please call {recruiter_name} at {recruiter_phone} to discuss details.', adminId);
    const d2 = db.prepare("SELECT * FROM users WHERE 1=0"); // dummy to trigger save
    void d2;
  }

  // Seed leads for existing DBs that don't have them yet
  const leadCount = db.prepare('SELECT COUNT(*) as c FROM leads').get().c;
  if (leadCount === 0) {
    const firstNames = ['James','Robert','Michael','David','Chris','Daniel','Matthew','Anthony','Mark','Paul','Jason','Ryan','Kevin','Brian','Eric','Steven','Gary','Timothy','Jose','Larry','Jeffrey','Frank','Scott','Eric','Raymond','Gregory','Samuel','Patrick','Alexander','Jack','Dennis','Jerry','Tyler','Aaron','Jose','Adam','Nathan','Henry','Douglas','Peter','Zachary','Kyle','Ethan','Walter','Harold','Arthur','Sean','Carl','Albert','Joe'];
    const lastNames  = ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez','Hernandez','Lopez','Gonzalez','Wilson','Anderson','Thomas','Taylor','Moore','Jackson','Martin','Lee','Perez','Thompson','White','Harris','Sanchez','Clark','Ramirez','Lewis','Robinson','Walker','Young','Allen','King','Wright','Scott','Torres','Nguyen','Hill','Adams','Baker','Nelson','Carter','Mitchell','Roberts','Turner','Phillips','Campbell','Parker'];
    const cities = [['Houston','TX'],['Dallas','TX'],['Phoenix','AZ'],['San Antonio','TX'],['Los Angeles','CA'],['Chicago','IL'],['Jacksonville','FL'],['Columbus','OH'],['Charlotte','NC'],['Indianapolis','IN'],['Denver','CO'],['Seattle','WA'],['Nashville','TN'],['Oklahoma City','OK'],['El Paso','TX'],['Atlanta','GA'],['Memphis','TN'],['Louisville','KY'],['Portland','OR'],['Las Vegas','NV']];
    const trucks  = ['Semi Truck','Refrigerated','Box Truck','Flatbed','Tanker','Car Hauler'];
    const classes = ['CDL-A','CDL-A','CDL-A','CDL-B'];
    const leadSql = 'INSERT INTO leads (name, phone, city, state, truck_type, license_class, experience_years, source, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
    for (let i = 0; i < 50; i++) {
      const fn = firstNames[i % firstNames.length];
      const ln = lastNames[(i * 7) % lastNames.length];
      const [city, state] = cities[i % cities.length];
      const truck = trucks[i % trucks.length];
      const cls   = classes[i % classes.length];
      const exp   = (i % 12) + 1;
      const phone = `+1-555-${String(200 + i).padStart(3,'0')}-${String(1000 + i * 3).padStart(4,'0')}`;
      db.prepare(leadSql).run(`${fn} ${ln}`, phone, city, state, truck, cls, exp, 'Facebook', 'available');
    }
    const d2 = sqlDb.export();
    fs.writeFileSync(DB_PATH, Buffer.from(d2));
    console.log('Seeded 50 Facebook leads');
  }

  const count = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if (count === 0) {
    const ins = (sql, ...p) => db.prepare(sql).run(...p);

    const adminId = ins(
      'INSERT INTO users (name, email, password_hash, role, phone, avatar_color) VALUES (?, ?, ?, ?, ?, ?)',
      'Admin Manager', 'admin@crm.com', bcrypt.hashSync('admin123', 10), 'admin', '+1-555-010-0001', '#dc2626'
    ).lastInsertRowid;

    const sarahId = ins(
      'INSERT INTO users (name, email, password_hash, role, phone, avatar_color) VALUES (?, ?, ?, ?, ?, ?)',
      'Sarah Johnson', 'sarah@crm.com', bcrypt.hashSync('pass123', 10), 'recruiter', '+1-555-010-0002', '#3b82f6'
    ).lastInsertRowid;

    const mikeId = ins(
      'INSERT INTO users (name, email, password_hash, role, phone, avatar_color) VALUES (?, ?, ?, ?, ?, ?)',
      'Mike Davis', 'mike@crm.com', bcrypt.hashSync('pass123', 10), 'recruiter', '+1-555-010-0003', '#10b981'
    ).lastInsertRowid;

    const annaId = ins(
      'INSERT INTO users (name, email, password_hash, role, phone, avatar_color) VALUES (?, ?, ?, ?, ?, ?)',
      'Anna Peterson', 'anna@crm.com', bcrypt.hashSync('pass123', 10), 'recruiter', '+1-555-010-0004', '#f59e0b'
    ).lastInsertRowid;

    const driverSql = 'INSERT INTO drivers (name, email, phone, city, state, status, recruiter_id, truck_type, license_class, experience_years, source, start_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';

    const drivers = [
      ['John Smith',    'john.s@email.com',   '+1-555-100-1001', 'Dallas',      'TX', 'active',    sarahId, 'Semi Truck',   'CDL-A', 5, 'Indeed',      '2024-01-15'],
      ['Carlos Rivera', 'c.riv@email.com',    '+1-555-100-1002', 'Houston',     'TX', 'training',  sarahId, 'Box Truck',    'CDL-B', 2, 'Referral',    null],
      ['Alex Wolf',     'a.wolf@email.com',   '+1-555-100-1003', 'Denver',      'CO', 'documents', mikeId,  'Semi Truck',   'CDL-A', 8, 'LinkedIn',    null],
      ['Robert Brown',  'r.brown@email.com',  '+1-555-100-1004', 'Chicago',     'IL', 'interview', mikeId,  'Refrigerated', 'CDL-A', 3, 'Indeed',      null],
      ['Michael Foster','m.foster@email.com', '+1-555-100-1005', 'Los Angeles', 'CA', 'contacted', sarahId, 'Semi Truck',   'CDL-A', 6, 'Facebook',    null],
      ['David Novak',   'd.nov@email.com',    '+1-555-100-1006', 'Atlanta',     'GA', 'new',       mikeId,  'Tanker',       'CDL-A', 4, 'Cold Call',   null],
      ['Sergei Orlov',  's.orl@email.com',    '+1-555-100-1007', 'Phoenix',     'AZ', 'active',    annaId,  'Refrigerated', 'CDL-A', 7, 'Referral',    '2024-02-01'],
      ['Kevin Taylor',  'k.tay@email.com',    '+1-555-100-1008', 'Portland',    'OR', 'rejected',  mikeId,  'Box Truck',    'CDL-B', 1, 'Indeed',      null],
      ['Andrew Fields', 'a.fields@email.com', '+1-555-100-1009', 'Nashville',   'TN', 'active',    annaId,  'Semi Truck',   'CDL-A', 9, 'Referral',    '2024-03-10'],
      ['Paul Morris',   'p.mor@email.com',    '+1-555-100-1010', 'Seattle',     'WA', 'interview', sarahId, 'Semi Truck',   'CDL-A', 2, 'Indeed',      null],
      ['Nick Pope',     'n.pope@email.com',   '+1-555-100-1011', 'Miami',       'FL', 'contacted', annaId,  'Box Truck',    'CDL-B', 5, 'LinkedIn',    null],
      ['Victor Hawk',   'v.hawk@email.com',   '+1-555-100-1012', 'San Antonio', 'TX', 'new',       sarahId, 'Semi Truck',   'CDL-A', 3, 'Cold Call',   null],
    ];

    drivers.forEach(d => ins(driverSql, ...d));

    const tplSql = 'INSERT INTO email_templates (name, subject, body, category, created_by) VALUES (?, ?, ?, ?, ?)';

    ins(tplSql, 'Welcome Email', 'We are glad to connect with you, {name}!',
      'Hi {name},\n\nMy name is {recruiter_name} and I am a recruiter at {company}. We specialize in placing professional truck drivers and are always looking for talented individuals.\n\nI would love to discuss potential opportunities with you and share the great benefits we offer.\n\nFeel free to reach out anytime!\n\nBest regards,\n{recruiter_name}\n{recruiter_phone}',
      'welcome', adminId);

    ins(tplSql, 'Interview Invitation', 'Interview Invitation — {name}',
      'Hi {name},\n\nWe have reviewed your profile and are pleased to invite you for an interview.\n\nDetails:\n• Date: [enter date]\n• Time: [enter time]\n• Format: [in-person / video call]\n\nPlease confirm your attendance by replying to this email or calling me.\n\nBest regards,\n{recruiter_name}\n{recruiter_phone}',
      'interview', adminId);

    ins(tplSql, 'Documents Request', 'Required Documents for Onboarding',
      'Hi {name},\n\nCongratulations on passing your interview! To proceed with onboarding, we need the following documents:\n\n✓ Government-issued ID\n✓ Driver\'s license (CDL)\n✓ Medical certificate (DOT physical)\n✓ Employment history / references\n✓ Social Security card\n\nPlease prepare originals and copies.\n\nBest regards,\n{recruiter_name}\n{recruiter_phone}',
      'documents', adminId);

    ins(tplSql, 'Training Schedule', 'Training Information — Start Date',
      'Hi {name},\n\nWe are happy to inform you that your training will begin on [enter date].\n\nProgram overview:\n• Company orientation\n• Safety briefing\n• Route training\n• Supervised driving practice\n\nSee you soon!\n\nBest regards,\n{recruiter_name}\n{recruiter_phone}',
      'training', adminId);

    ins(tplSql, 'Job Offer', 'Official Job Offer — {name}',
      'Hi {name},\n\nWe are pleased to extend you an official job offer for the position of Truck Driver.\n\nOffer details:\n• Pay rate: [enter rate]\n• Schedule: [enter schedule]\n• Routes: [enter routes]\n• Start date: [enter date]\n• Additional benefits: [enter benefits]\n\nPlease confirm your acceptance within 3 business days.\n\nWe look forward to having you on the team!\n\nBest regards,\n{recruiter_name}\n{recruiter_phone}',
      'offer', adminId);

    ins(tplSql, 'Call Reminder', 'Reminder: Scheduled Call',
      'Hi {name},\n\nThis is a friendly reminder about our scheduled call on [date and time].\n\nIf the time does not work for you, please let me know and we will find another slot.\n\nBest regards,\n{recruiter_name}\n{recruiter_phone}',
      'reminder', adminId);

    ['John Smith', 'Alex Wolf', 'Sergei Orlov'].forEach((name, i) => {
      ins('INSERT INTO activities (recruiter_id, driver_id, action, details) VALUES (?, ?, ?, ?)',
        [sarahId, mikeId, annaId][i], i + 1, 'status_change', `Driver ${name} activated`);
    });

    // ── Seed 50 Facebook leads ───────────────────────────────────────
    const firstNames = ['James','Robert','Michael','David','Chris','Daniel','Matthew','Anthony','Mark','Paul','Jason','Ryan','Kevin','Brian','Eric','Steven','Gary','Timothy','Jose','Larry','Jeffrey','Frank','Scott','Eric','Raymond','Gregory','Samuel','Patrick','Alexander','Jack','Dennis','Jerry','Tyler','Aaron','Jose','Adam','Nathan','Henry','Douglas','Peter','Zachary','Kyle','Ethan','Walter','Harold','Arthur','Sean','Carl','Albert','Joe'];
    const lastNames  = ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez','Hernandez','Lopez','Gonzalez','Wilson','Anderson','Thomas','Taylor','Moore','Jackson','Martin','Lee','Perez','Thompson','White','Harris','Sanchez','Clark','Ramirez','Lewis','Robinson','Walker','Young','Allen','King','Wright','Scott','Torres','Nguyen','Hill','Adams','Baker','Nelson','Carter','Mitchell','Perez','Roberts','Turner','Phillips','Campbell','Parker'];
    const cities = [
      ['Houston','TX'],['Dallas','TX'],['Phoenix','AZ'],['San Antonio','TX'],['Los Angeles','CA'],
      ['Chicago','IL'],['Jacksonville','FL'],['Columbus','OH'],['Charlotte','NC'],['Indianapolis','IN'],
      ['Denver','CO'],['Seattle','WA'],['Nashville','TN'],['Oklahoma City','OK'],['El Paso','TX'],
      ['Atlanta','GA'],['Memphis','TN'],['Louisville','KY'],['Portland','OR'],['Las Vegas','NV'],
    ];
    const trucks  = ['Semi Truck','Refrigerated','Box Truck','Flatbed','Tanker','Car Hauler'];
    const classes = ['CDL-A','CDL-A','CDL-A','CDL-B'];
    const leadSql = 'INSERT INTO leads (name, phone, city, state, truck_type, license_class, experience_years, source, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
    for (let i = 0; i < 50; i++) {
      const fn = firstNames[i % firstNames.length];
      const ln = lastNames[(i * 7) % lastNames.length];
      const [city, state] = cities[i % cities.length];
      const truck = trucks[i % trucks.length];
      const cls   = classes[i % classes.length];
      const exp   = (i % 12) + 1;
      const phone = `+1-555-${String(200 + i).padStart(3,'0')}-${String(1000 + i * 3).padStart(4,'0')}`;
      ins(leadSql, `${fn} ${ln}`, phone, city, state, truck, cls, exp, 'Facebook', 'available');
    }

    const data = sqlDb.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
    console.log('Database initialized with seed data (including 50 Facebook leads)');
  }

  process.on('exit', () => {
    const data = sqlDb.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  });

  return db;
}

module.exports = initDb();
