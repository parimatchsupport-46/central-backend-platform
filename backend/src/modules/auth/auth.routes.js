const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../../config/db');
const { requireAdminAuth } = require('../../middleware/auth');
const { authLimiter } = require('../../middleware/rateLimiter');

const router = express.Router();

// POST /api/admin/auth/login
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await db.query(
      'SELECT id, email, name, password_hash, is_active FROM admins WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    const admin = result.rows[0];
    if (!admin || !admin.is_active) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await db.query('UPDATE admins SET last_login_at = NOW() WHERE id = $1', [admin.id]);
    await db.query(
      'INSERT INTO activity_logs (admin_id, action, ip_address) VALUES ($1, $2, $3)',
      [admin.id, 'ADMIN_LOGIN', req.ip]
    );

    const token = jwt.sign(
      { id: admin.id, email: admin.email, name: admin.name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.cookie('admin_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      admin: { id: admin.id, email: admin.email, name: admin.name }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('admin_token');
  res.json({ message: 'Logged out successfully' });
});

// GET /api/admin/auth/me
router.get('/me', requireAdminAuth, (req, res) => {
  res.json({ admin: req.admin });
});

module.exports = router;
