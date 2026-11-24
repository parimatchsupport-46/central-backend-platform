const express = require('express');
const crypto = require('crypto');
const db = require('../../config/db');
const { requireAdminAuth } = require('../../middleware/auth');

const router = express.Router();
router.use(requireAdminAuth);

function generateProjectCode() {
  return 'prj_' + crypto.randomBytes(5).toString('hex');
}

function generatePublicKey() {
  return 'pk_live_' + crypto.randomBytes(16).toString('hex');
}

// GET /api/admin/projects/overview/stats
router.get('/overview/stats', async (req, res, next) => {
  try {
    const [projectsRes, filesRes, apiRes, activityRes] = await Promise.all([
      db.query(`
        SELECT
          COUNT(*)::int AS total_projects,
          COUNT(*) FILTER (WHERE status = 'active')::int AS active_projects
        FROM projects
      `),
      db.query(`
        SELECT
          COUNT(*)::int AS total_files,
          COALESCE(SUM(size_bytes), 0)::bigint AS total_storage_bytes
        FROM files
      `),
      db.query(`SELECT COALESCE(SUM(request_count), 0)::bigint AS total_api_requests FROM api_keys`),
      db.query(`
        SELECT id, action, details, ip_address, created_at
        FROM activity_logs
        ORDER BY created_at DESC LIMIT 10
      `)
    ]);

    res.json({
      total_projects: projectsRes.rows[0].total_projects,
      active_projects: projectsRes.rows[0].active_projects,
      total_files: filesRes.rows[0].total_files,
      total_storage_bytes: Number(filesRes.rows[0].total_storage_bytes),
      total_api_requests: Number(apiRes.rows[0].total_api_requests),
      recent_activities: activityRes.rows
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/projects
router.get('/', async (req, res, next) => {
  try {
    const result = await db.query(`
      SELECT
        p.*,
        k.public_key,
        k.request_count,
        COALESCE(f.used_bytes, 0)::bigint AS used_storage_bytes,
        COALESCE(f.file_count, 0)::int AS file_count,
        COALESCE(r.record_count, 0)::int AS record_count
      FROM projects p
      LEFT JOIN LATERAL (
        SELECT public_key, request_count
        FROM api_keys
        WHERE project_id = p.id AND is_active = TRUE
        ORDER BY created_at DESC LIMIT 1
      ) k ON TRUE
      LEFT JOIN LATERAL (
        SELECT SUM(size_bytes) AS used_bytes, COUNT(*) AS file_count
        FROM files WHERE project_id = p.id
      ) f ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS record_count
        FROM project_records WHERE project_id = p.id
      ) r ON TRUE
      ORDER BY p.created_at DESC
    `);

    res.json({ projects: result.rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/projects
router.post('/', async (req, res, next) => {
  const client = await db.pool.connect();
  try {
    const { name, description, storage_limit_mb = 500, api_rate_limit_per_min = 120 } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    const projectCode = generateProjectCode();
    const publicKey = generatePublicKey();
    const storageLimitBytes = Number(storage_limit_mb) * 1024 * 1024;

    await client.query('BEGIN');
    const projRes = await client.query(
      `INSERT INTO projects (project_code, name, description, storage_limit_bytes, api_rate_limit_per_min)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [projectCode, name.trim(), description || '', storageLimitBytes, api_rate_limit_per_min]
    );
    const project = projRes.rows[0];

    await client.query(
      'INSERT INTO api_keys (project_id, public_key) VALUES ($1, $2)',
      [project.id, publicKey]
    );

    await client.query(
      'INSERT INTO activity_logs (admin_id, project_id, action, details, ip_address) VALUES ($1, $2, $3, $4, $5)',
      [req.admin.id, project.id, 'PROJECT_CREATED', JSON.stringify({ name: project.name }), req.ip]
    );

    await client.query('COMMIT');
    res.status(201).json({ project: { ...project, public_key: publicKey } });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// PATCH /api/admin/projects/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const { name, description, status, storage_limit_mb, api_rate_limit_per_min } = req.body;
    const storageBytes = storage_limit_mb !== undefined ? Number(storage_limit_mb) * 1024 * 1024 : null;

    const updated = await db.query(
      `UPDATE projects SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        status = COALESCE($3, status),
        storage_limit_bytes = COALESCE($4, storage_limit_bytes),
        api_rate_limit_per_min = COALESCE($5, api_rate_limit_per_min),
        updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [name, description, status, storageBytes, api_rate_limit_per_min, req.params.id]
    );

    if (!updated.rows[0]) return res.status(404).json({ error: 'Project not found' });
    res.json({ project: updated.rows[0] });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/projects/:id/rotate-key
router.post('/:id/rotate-key', async (req, res, next) => {
  try {
    const newKey = generatePublicKey();
    await db.query('UPDATE api_keys SET is_active = FALSE WHERE project_id = $1', [req.params.id]);
    await db.query('INSERT INTO api_keys (project_id, public_key) VALUES ($1, $2)', [req.params.id, newKey]);
    res.json({ public_key: newKey });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/projects/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const deleted = await db.query('DELETE FROM projects WHERE id = $1 RETURNING id, name', [req.params.id]);
    if (!deleted.rows[0]) return res.status(404).json({ error: 'Project not found' });
    res.json({ deleted: true, id: deleted.rows[0].id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
