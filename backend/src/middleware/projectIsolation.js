const db = require('../config/db');

async function requireProjectAccess(req, res, next) {
  const start = Date.now();
  const projectCode = req.headers['x-project-id'];
  const apiKey = req.headers['x-api-key'];

  if (!projectCode || !apiKey) {
    return res.status(401).json({ error: 'Missing x-project-id or x-api-key header' });
  }

  try {
    const result = await db.query(
      `SELECT p.id, p.project_code, p.name, p.status, p.storage_limit_bytes, p.api_rate_limit_per_min,
              k.id AS key_id, k.is_active AS key_active
       FROM projects p
       JOIN api_keys k ON k.project_id = p.id
       WHERE p.project_code = $1 AND k.public_key = $2`,
      [projectCode, apiKey]
    );

    const row = result.rows[0];
    if (!row || !row.key_active) {
      return res.status(403).json({ error: 'Invalid or inactive project credentials' });
    }

    if (row.status !== 'active') {
      return res.status(403).json({ error: `Project is currently ${row.status}` });
    }

    req.project = {
      id: row.id,
      project_code: row.project_code,
      name: row.name,
      storage_limit_bytes: Number(row.storage_limit_bytes),
      api_rate_limit_per_min: row.api_rate_limit_per_min
    };

    // Update API key usage asynchronously
    db.query(
      'UPDATE api_keys SET request_count = request_count + 1, last_used_at = NOW() WHERE id = $1',
      [row.key_id]
    ).catch(() => {});

    // Log API request on response finish
    res.on('finish', () => {
      const duration = Date.now() - start;
      db.query(
        'INSERT INTO api_logs (project_id, method, endpoint, status_code, ip_address, duration_ms) VALUES ($1, $2, $3, $4, $5, $6)',
        [row.id, req.method, req.originalUrl, res.statusCode, req.ip, duration]
      ).catch(() => {});
    });

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireProjectAccess };
