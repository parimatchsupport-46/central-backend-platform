const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('../../config/db');
const { requireProjectAccess } = require('../../middleware/projectIsolation');
const { requireAdminAuth } = require('../../middleware/auth');

const publicStorageRouter = express.Router();
const adminStorageRouter = express.Router();

const ALLOWED_MIMES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
  'text/plain', 'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const baseDir = path.resolve(process.env.LOCAL_STORAGE_PATH || './storage');
    const projDir = path.join(baseDir, req.project.project_code);
    fs.mkdirSync(projDir, { recursive: true });
    cb(null, projDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: (Number(process.env.MAX_FILE_SIZE_MB) || 10) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIMES.has(file.mimetype)) {
      return cb(Object.assign(new Error('File type not allowed'), { status: 400 }));
    }
    cb(null, true);
  }
});

// ================= PUBLIC CLIENT STORAGE (/api/v1/storage) =================
publicStorageRouter.use(requireProjectAccess);

publicStorageRouter.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // Check project storage quota
    const usageRes = await db.query(
      'SELECT COALESCE(SUM(size_bytes), 0)::bigint AS used FROM files WHERE project_id = $1',
      [req.project.id]
    );
    const used = Number(usageRes.rows[0].used);
    if (used + req.file.size > req.project.storage_limit_bytes) {
      fs.unlinkSync(req.file.path);
      return res.status(413).json({ error: 'Project storage quota exceeded' });
    }

    const inserted = await db.query(
      `INSERT INTO files (project_id, original_name, stored_name, mime_type, size_bytes, storage_driver, storage_path)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, original_name, mime_type, size_bytes, created_at`,
      [req.project.id, req.file.originalname, req.file.filename, req.file.mimetype, req.file.size, 'local', req.file.path]
    );

    res.status(201).json({ file: inserted.rows[0] });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    next(err);
  }
});

publicStorageRouter.get('/:fileId', async (req, res, next) => {
  try {
    const fileRes = await db.query(
      'SELECT * FROM files WHERE id = $1 AND project_id = $2',
      [req.params.fileId, req.project.id]
    );
    const file = fileRes.rows[0];
    if (!file || !fs.existsSync(file.storage_path)) {
      return res.status(404).json({ error: 'File not found' });
    }
    res.sendFile(path.resolve(file.storage_path));
  } catch (err) {
    next(err);
  }
});

// ================= ADMIN STORAGE MANAGER (/api/admin/storage) =================
adminStorageRouter.use(requireAdminAuth);

adminStorageRouter.get('/:projectId', async (req, res, next) => {
  try {
    const files = await db.query(
      'SELECT id, original_name, mime_type, size_bytes, created_at FROM files WHERE project_id = $1 ORDER BY created_at DESC',
      [req.params.projectId]
    );
    res.json({ files: files.rows });
  } catch (err) {
    next(err);
  }
});

adminStorageRouter.delete('/:projectId/:fileId', async (req, res, next) => {
  try {
    const fileRes = await db.query(
      'DELETE FROM files WHERE id = $1 AND project_id = $2 RETURNING storage_path',
      [req.params.fileId, req.params.projectId]
    );
    if (!fileRes.rows[0]) return res.status(404).json({ error: 'File not found' });
    if (fs.existsSync(fileRes.rows[0].storage_path)) {
      fs.unlinkSync(fileRes.rows[0].storage_path);
    }
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

module.exports = { publicStorageRouter, adminStorageRouter };
