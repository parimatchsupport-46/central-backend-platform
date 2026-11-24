const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../../config/db');
const { requireAdminAuth } = require('../../middleware/auth');

const router = express.Router();
router.use(requireAdminAuth);

// GET /api/admin/backups
router.get('/', async (req, res, next) => {
  try {
    const result = await db.query('SELECT * FROM backups ORDER BY created_at DESC LIMIT 50');
    res.json({ backups: result.rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/backups/create
router.post('/create', async (req, res, next) => {
  try {
    const backupDir = path.resolve(process.env.LOCAL_BACKUP_PATH || './backups');
    fs.mkdirSync(backupDir, { recursive: true });

    const [projects, collections, records] = await Promise.all([
      db.query('SELECT * FROM projects'),
      db.query('SELECT * FROM project_collections'),
      db.query('SELECT * FROM project_records')
    ]);

    const snapshot = {
      created_at: new Date().toISOString(),
      projects: projects.rows,
      collections: collections.rows,
      records: records.rows
    };

    const fileName = `backup-${Date.now()}.json`;
    const filePath = path.join(backupDir, fileName);
    fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2));
    const stats = fs.statSync(filePath);

    const inserted = await db.query(
      `INSERT INTO backups (backup_type, file_path, size_bytes, status)
       VALUES ('database', $1, $2, 'completed') RETURNING *`,
      [filePath, stats.size]
    );

    await db.query(
      'INSERT INTO activity_logs (admin_id, action, details, ip_address) VALUES ($1, $2, $3, $4)',
      [req.admin.id, 'BACKUP_CREATED', JSON.stringify({ fileName }), req.ip]
    );

    res.status(201).json({ backup: inserted.rows[0] });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/backups/:id/restore
router.post('/:id/restore', async (req, res, next) => {
  const client = await db.pool.connect();
  try {
    const bRes = await client.query('SELECT * FROM backups WHERE id = $1', [req.params.id]);
    const backup = bRes.rows[0];
    if (!backup || !fs.existsSync(backup.file_path)) {
      return res.status(404).json({ error: 'Backup file not found' });
    }

    const snapshot = JSON.parse(fs.readFileSync(backup.file_path, 'utf-8'));

    await client.query('BEGIN');
    for (const r of snapshot.records || []) {
      await client.query(
        `INSERT INTO project_records (id, project_id, collection_id, data, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
        [r.id, r.project_id, r.collection_id, r.data, r.created_at, r.updated_at]
      );
    }
    await client.query("UPDATE backups SET status = 'restored' WHERE id = $1", [backup.id]);
    await client.query('COMMIT');

    res.json({ restored: true, records_restored: (snapshot.records || []).length });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
