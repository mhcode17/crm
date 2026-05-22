const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, unique + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB per file
  fileFilter: (_, file, cb) => {
    const allowed = /jpeg|jpg|png|pdf|heic/i;
    cb(null, allowed.test(path.extname(file.originalname)));
  },
});

module.exports = function (db) {
  const router = express.Router();

  function parseForm(req, res, next) {
    const ct = req.headers['content-type'] || '';
    if (ct.includes('multipart/form-data')) {
      upload.array('documents', 5)(req, res, next);
    } else {
      next(); // already parsed by express.urlencoded / express.json
    }
  }

  // Public: POST /api/apply — no auth required
  router.post('/', parseForm, (req, res) => {
    const { name, email, phone, city, state, truck_type, license_class, experience_years, cdl_number, message, source } = req.body;

    if (!name?.trim() || !phone?.trim()) {
      return res.status(400).json({ error: 'Name and phone are required' });
    }

    // Use provided source if valid, otherwise default to Organic
    const VALID_SOURCES = ['Facebook', 'Indeed', 'Organic', 'LinkedIn', 'Referral', 'Other'];
    const leadSource = VALID_SOURCES.includes(source) ? source : 'Organic';

    const result = db.prepare(`
      INSERT INTO leads (name, email, phone, city, state, truck_type, license_class, experience_years, notes, source, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available')
    `).run(
      name.trim(),
      email?.trim() || null,
      phone.trim(),
      city?.trim() || null,
      state?.trim() || null,
      truck_type || null,
      license_class || null,
      parseInt(experience_years) || 0,
      [cdl_number ? `CDL#: ${cdl_number}` : '', message].filter(Boolean).join('\n') || null,
      leadSource
    );

    const leadId = result.lastInsertRowid;

    // Save document references
    if (req.files?.length) {
      const insDoc = db.prepare('INSERT INTO lead_documents (lead_id, filename, original_name, mime_type) VALUES (?, ?, ?, ?)');
      req.files.forEach(f => insDoc.run(leadId, f.filename, f.originalname, f.mimetype));
    }

    res.status(201).json({
      success: true,
      reference: `ORG-${String(leadId).padStart(5, '0')}`,
      lead_id: leadId,
      documents_uploaded: req.files?.length || 0,
    });
  });

  // Get documents for a lead (requires auth — handled in leads routes)
  router.get('/documents/:leadId', (req, res) => {
    const docs = db.prepare('SELECT * FROM lead_documents WHERE lead_id = ?').all(Number(req.params.leadId));
    res.json(docs);
  });

  // Download a document file
  router.get('/file/:filename', (req, res) => {
    const filePath = path.join(uploadsDir, req.params.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
    res.sendFile(filePath);
  });

  return router;
};
