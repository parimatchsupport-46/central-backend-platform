const express = require('express');
const db = require('../../config/db');
const { requireProjectAccess } = require('../../middleware/projectIsolation');
const { requireAdminAuth } = require('../../middleware/auth');

const publicDataRouter = express.Router();
const adminDataRouter = express.Router();

// Helper: Get or create collection for a specific project_id
async function getOrCreateCollection(projectId, collectionName) {
  const cleanName = collectionName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (!cleanName) throw Object.assign(new Error('Invalid collection name'), { status: 400 });

  const existing = await db.query(
    'SELECT id, name FROM project_collections WHERE project_id = $1 AND name = $2',
    [projectId, cleanName]
  );
  if (existing.rows[0]) return existing.rows[0];

  const created = await db.query(
    'INSERT INTO project_collections (project_id, name) VALUES ($1, $2) RETURNING id, name',
    [projectId, cleanName]
  );
  return created.rows[0];
}

// ================= PUBLIC CLIENT APIs (/api/v1/data/:collection) =================
publicDataRouter.use(requireProjectAccess);

publicDataRouter.get('/:collection', async (req, res, next) => {
  try {
    const col = await db.query(
      'SELECT id FROM project_collections WHERE project_id = $1 AND name = $2',
      [req.project.id, req.params.collection]
    );
    if (!col.rows[0]) return res.json({ records: [] });

    const records = await db.query(
      'SELECT id, data, created_at, updated_at FROM project_records WHERE project_id = $1 AND collection_id = $2 ORDER BY created_at DESC LIMIT 100',
      [req.project.id, col.rows[0].id]
    );
    res.json({ records: records.rows });
  } catch (err) {
    next(err);
  }
});

publicDataRouter.post('/:collection', async (req, res, next) => {
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Request body must be a JSON object' });
    }
    const col = await getOrCreateCollection(req.project.id, req.params.collection);
    const inserted = await db.query(
      'INSERT INTO project_records (project_id, collection_id, data) VALUES ($1, $2, $3) RETURNING id, data, created_at',
      [req.project.id, col.id, req.body]
    );
    res.status(201).json({ record: inserted.rows[0] });
  } catch (err) {
    next(err);
  }
});

publicDataRouter.patch('/:collection/:recordId', async (req, res, next) => {
  try {
    const updated = await db.query(
      `UPDATE project_records
       SET data = data || $1::jsonb, updated_at = NOW()
       WHERE id = $2 AND project_id = $3
       RETURNING id, data, updated_at`,
      [JSON.stringify(req.body), req.params.recordId, req.project.id]
    );
    if (!updated.rows[0]) return res.status(404).json({ error: 'Record not found' });
    res.json({ record: updated.rows[0] });
  } catch (err) {
    next(err);
  }
});

publicDataRouter.delete('/:collection/:recordId', async (req, res, next) => {
  try {
    const deleted = await db.query(
      'DELETE FROM project_records WHERE id = $1 AND project_id = $2 RETURNING id',
      [req.params.recordId, req.project.id]
    );
    if (!deleted.rows[0]) return res.status(404).json({ error: 'Record not found' });
    res.json({ deleted: true, id: deleted.rows[0].id });
  } catch (err) {
    next(err);
  }
});

// ================= ADMIN DATABASE MANAGER APIs (/api/admin/database) =================
adminDataRouter.use(requireAdminAuth);

adminDataRouter.get('/:projectId/collections', async (req, res, next) => {
  try {
    const cols = await db.query(
      `SELECT c.id, c.name, c.created_at, COUNT(r.id)::int AS record_count
       FROM project_collections c
       LEFT JOIN project_records r ON r.collection_id = c.id
       WHERE c.project_id = $1
       GROUP BY c.id ORDER BY c.name ASC`,
      [req.params.projectId]
    );
    res.json({ collections: cols.rows });
  } catch (err) {
    next(err);
  }
});

adminDataRouter.get('/:projectId/collections/:collectionName/records', async (req, res, next) => {
  try {
    const records = await db.query(
      `SELECT r.id, r.data, r.created_at, r.updated_at
       FROM project_records r
       JOIN project_collections c ON c.id = r.collection_id
       WHERE r.project_id = $1 AND c.name = $2
       ORDER BY r.created_at DESC LIMIT 200`,
      [req.params.projectId, req.params.collectionName]
    );
    res.json({ records: records.rows });
  } catch (err) {
    next(err);
  }
});

adminDataRouter.delete('/:projectId/records/:recordId', async (req, res, next) => {
  try {
    const deleted = await db.query(
      'DELETE FROM project_records WHERE id = $1 AND project_id = $2 RETURNING id',
      [req.params.recordId, req.params.projectId]
    );
    if (!deleted.rows[0]) return res.status(404).json({ error: 'Record not found' });
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

module.exports = { publicDataRouter, adminDataRouter };
