const express = require('express');
const db = require('../../config/db');
const { requireAdminAuth } = require('../../middleware/auth');

const router = express.Router();
router.use(requireAdminAuth);

// GET /api/admin/logs/api
router.get('/api', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT l.id, l.method, l.endpoint, l.status_code, l.ip_address, l.duration_ms, l.created_at,
              p.name AS project_name, p.project_code
       FROM api_logs l
       LEFT JOIN projects p ON p.id = l.project_id
       ORDER BY l.created_at DESC LIMIT 100`
    );
    res.json({ logs: result.rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/logs/activity
router.get('/activity', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT a.id, a.action, a.details, a.ip_address, a.created_at,
              adm.email AS admin_email, p.name AS project_name
       FROM activity_logs a
       LEFT JOIN admins adm ON adm.id = a.admin_id
       LEFT JOIN projects p ON p.id = a.project_id
       ORDER BY a.created_at DESC LIMIT 100`
    );
    res.json({ logs: result.rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
