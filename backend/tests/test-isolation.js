// Automated Local Integration & Isolation Test (Step 9)
// Run: node tests/test-isolation.js (while backend is running on localhost:5000)

const BASE = 'http://localhost:5000';

async function runTests() {
  console.log('--- Starting Step 9 Local Integration Tests ---');

  // 1. Health Check
  const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
  if (health.status !== 'ok') throw new Error('Health check failed');
  console.log('[PASS] 1. Health Check');

  // 2. Admin Login
  const loginRes = await fetch(`${BASE}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.ADMIN_EMAIL || 'admin@centralbackend.local',
      password: process.env.ADMIN_PASSWORD || 'ChangeMe123!'
    })
  });
  if (!loginRes.ok) throw new Error('Admin login failed');
  const cookie = loginRes.headers.get('set-cookie');
  console.log('[PASS] 2. Admin Login');

  // 3. Create Project A & Project B
  const projA = await fetch(`${BASE}/api/admin/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ name: 'Test Project A', storage_limit_mb: 100 })
  }).then((r) => r.json());

  const projB = await fetch(`${BASE}/api/admin/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ name: 'Test Project B', storage_limit_mb: 100 })
  }).then((r) => r.json());
  console.log('[PASS] 3. Created Project A & Project B');

  // 4. Write data to Project A
  const postA = await fetch(`${BASE}/api/v1/data/leads`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-project-id': projA.project.project_code,
      'x-api-key': projA.project.public_key
    },
    body: JSON.stringify({ name: 'Secret Lead A' })
  });
  if (!postA.ok) throw new Error('Project A data insert failed');
  console.log('[PASS] 4. Inserted data into Project A');

  // 5. Verify Project B CANNOT see Project A's data
  const getB = await fetch(`${BASE}/api/v1/data/leads`, {
    headers: {
      'x-project-id': projB.project.project_code,
      'x-api-key': projB.project.public_key
    }
  }).then((r) => r.json());

  if (getB.records.length !== 0) {
    throw new Error('ISOLATION BREACH: Project B saw Project A data!');
  }
  console.log('[PASS] 5. Strict Project Isolation Verified (Project B has 0 records)');

  // 6. Backup & Restore Test
  const backup = await fetch(`${BASE}/api/admin/backups/create`, {
    method: 'POST',
    headers: { Cookie: cookie }
  }).then((r) => r.json());

  const restore = await fetch(`${BASE}/api/admin/backups/${backup.backup.id}/restore`, {
    method: 'POST',
    headers: { Cookie: cookie }
  }).then((r) => r.json());

  if (!restore.restored) throw new Error('Backup restore failed');
  console.log(`[PASS] 6. Backup & Restore Verified (${restore.records_restored} records)`);

  console.log('--- ALL STEP 9 TESTS PASSED! ---');
}

runTests().catch((err) => {
  console.error('[FAIL]', err.message);
  process.exit(1);
});
