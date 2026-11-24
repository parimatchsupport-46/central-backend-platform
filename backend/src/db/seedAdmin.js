require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../config/db');

async function seedAdmin() {
  const email = (process.env.ADMIN_EMAIL || 'admin@centralbackend.local').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
  const name = process.env.ADMIN_NAME || 'Super Admin';

  const existing = await db.query('SELECT id FROM admins WHERE email = $1', [email]);
  if (existing.rows.length > 0) {
    console.log(`Admin already exists: ${email}`);
    process.exit(0);
  }

  const hash = await bcrypt.hash(password, 12);
  await db.query(
    'INSERT INTO admins (email, password_hash, name) VALUES ($1, $2, $3)',
    [email, hash, name]
  );
  console.log(`Super Admin created: ${email}`);
  process.exit(0);
}

seedAdmin().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
