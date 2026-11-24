import { useEffect, useState } from 'react';
import {
  ViewGrid, Folder, Key, Database, HardDrive, Archive,
  Activity, SunLight, HalfMoon, LogOut, Refresh, Trash, Plus, Copy
} from 'iconoir-react';
import { apiFetch } from './api/client';
import './styles.css';

function formatBytes(bytes = 0) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('cb_theme') || 'light');
  const [admin, setAdmin] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const [tab, setTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [projects, setProjects] = useState([]);
  const [search, setSearch] = useState('');
  const [newProj, setNewProj] = useState({ name: '', description: '', storage_limit_mb: 500 });

  const [selectedProjId, setSelectedProjId] = useState('');
  const [collections, setCollections] = useState([]);
  const [selectedCollection, setSelectedCollection] = useState('');
  const [records, setRecords] = useState([]);
  const [files, setFiles] = useState([]);
  const [backups, setBackups] = useState([]);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('cb_theme', theme);
  }, [theme]);

  useEffect(() => {
    apiFetch('/api/admin/auth/me')
      .then((res) => setAdmin(res.admin))
      .catch(() => setAdmin(null))
      .finally(() => setCheckingAuth(false));
  }, []);

  useEffect(() => {
    if (admin) loadDashboardData();
  }, [admin]);

  async function loadDashboardData() {
    const [s, p] = await Promise.all([
      apiFetch('/api/admin/projects/overview/stats'),
      apiFetch('/api/admin/projects')
    ]);
    setStats(s);
    setProjects(p.projects);
    if (p.projects.length > 0 && !selectedProjId) {
      setSelectedProjId(p.projects[0].id);
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    setAuthError('');
    try {
      const res = await apiFetch('/api/admin/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      setAdmin(res.admin);
    } catch (err) {
      setAuthError(err.message);
    }
  }

  async function handleLogout() {
    await apiFetch('/api/admin/auth/logout', { method: 'POST' });
    setAdmin(null);
  }

  async function createProject(e) {
    e.preventDefault();
    await apiFetch('/api/admin/projects', { method: 'POST', body: JSON.stringify(newProj) });
    setNewProj({ name: '', description: '', storage_limit_mb: 500 });
    loadDashboardData();
  }

  async function toggleStatus(proj) {
    const status = proj.status === 'active' ? 'inactive' : 'active';
    await apiFetch(`/api/admin/projects/${proj.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    loadDashboardData();
  }

  async function deleteProject(id) {
    if (!confirm('Delete this project?')) return;
    await apiFetch(`/api/admin/projects/${id}`, { method: 'DELETE' });
    loadDashboardData();
  }

  async function rotateKey(id) {
    await apiFetch(`/api/admin/projects/${id}/rotate-key`, { method: 'POST' });
    loadDashboardData();
  }

  async function loadCollections(projectId) {
    setSelectedProjId(projectId);
    setSelectedCollection('');
    setRecords([]);
    if (!projectId) return;
    const res = await apiFetch(`/api/admin/database/${projectId}/collections`);
    setCollections(res.collections);
  }

  async function loadRecords(colName) {
    setSelectedCollection(colName);
    const res = await apiFetch(`/api/admin/database/${selectedProjId}/collections/${colName}/records`);
    setRecords(res.records);
  }

  async function loadFiles(projectId) {
    setSelectedProjId(projectId);
    if (!projectId) return;
    const res = await apiFetch(`/api/admin/storage/${projectId}`);
    setFiles(res.files);
  }

  async function deleteFile(fileId) {
    await apiFetch(`/api/admin/storage/${selectedProjId}/${fileId}`, { method: 'DELETE' });
    loadFiles(selectedProjId);
  }

  async function loadBackups() {
    const res = await apiFetch('/api/admin/backups');
    setBackups(res.backups);
  }

  async function createBackup() {
    await apiFetch('/api/admin/backups/create', { method: 'POST' });
    loadBackups();
  }

  async function restoreBackup(id) {
    await apiFetch(`/api/admin/backups/${id}/restore`, { method: 'POST' });
    loadBackups();
  }

  async function loadLogs() {
    const res = await apiFetch('/api/admin/logs/api');
    setLogs(res.logs);
  }

  if (checkingAuth) return <div style={{ padding: '2rem' }}>Loading...</div>;

  if (!admin) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '1rem' }}>
        <form onSubmit={handleLogin} className="card" style={{ width: '360px' }}>
          <h2 style={{ marginBottom: '1rem' }}>CentralBackend</h2>
          {authError && <p style={{ color: 'var(--danger)', marginBottom: '0.75rem', fontSize: '0.85rem' }}>{authError}</p>}
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <input className="input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <input className="input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <button className="btn btn-primary" style={{ justifyContent: 'center' }}>Sign In</button>
          </div>
        </form>
      </div>
    );
  }

  const filteredProjects = projects.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <span className="icon-pill bg-blue"><ViewGrid width={16} height={16} /></span>
          CentralBackend
        </div>
        <button className={`nav-btn ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>
          <span className="icon-pill bg-blue"><ViewGrid width={15} height={15} /></span> Overview
        </button>
        <button className={`nav-btn ${tab === 'projects' ? 'active' : ''}`} onClick={() => setTab('projects')}>
          <span className="icon-pill bg-orange"><Folder width={15} height={15} /></span> Projects
        </button>
        <button className={`nav-btn ${tab === 'apis' ? 'active' : ''}`} onClick={() => setTab('apis')}>
          <span className="icon-pill bg-purple"><Key width={15} height={15} /></span> APIs
        </button>
        <button className={`nav-btn ${tab === 'database' ? 'active' : ''}`} onClick={() => { setTab('database'); loadCollections(selectedProjId); }}>
          <span className="icon-pill bg-green"><Database width={15} height={15} /></span> Database
        </button>
        <button className={`nav-btn ${tab === 'storage' ? 'active' : ''}`} onClick={() => { setTab('storage'); loadFiles(selectedProjId); }}>
          <span className="icon-pill bg-teal"><HardDrive width={15} height={15} /></span> Storage
        </button>
        <button className={`nav-btn ${tab === 'backups' ? 'active' : ''}`} onClick={() => { setTab('backups'); loadBackups(); }}>
          <span className="icon-pill bg-orange"><Archive width={15} height={15} /></span> Backups
        </button>
        <button className={`nav-btn ${tab === 'logs' ? 'active' : ''}`} onClick={() => { setTab('logs'); loadLogs(); }}>
          <span className="icon-pill bg-red"><Activity width={15} height={15} /></span> Logs
        </button>

        <div className="sidebar-footer">
          <button className="nav-btn" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
            {theme === 'light' ? <HalfMoon width={16} height={16} /> : <SunLight width={16} height={16} />}
            {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
          </button>
          <button className="nav-btn" style={{ color: 'var(--danger)' }} onClick={handleLogout}>
            <LogOut width={16} height={16} /> Logout
          </button>
        </div>
      </aside>

      <main className="main">
        {tab === 'overview' && stats && (
          <>
            <div className="header">
              <h2>Overview</h2>
              <button className="btn btn-secondary" onClick={loadDashboardData}><Refresh width={15} height={15} /> Refresh</button>
            </div>
            <div className="grid">
              <div className="card">
                <div className="kpi-top"><span className="card-label">Projects</span><span className="icon-pill bg-blue"><Folder width={15} height={15} /></span></div>
                <div className="card-value">{stats.total_projects}</div>
              </div>
              <div className="card">
                <div className="kpi-top"><span className="card-label">Active</span><span className="icon-pill bg-green"><Activity width={15} height={15} /></span></div>
                <div className="card-value">{stats.active_projects}</div>
              </div>
              <div className="card">
                <div className="kpi-top"><span className="card-label">Storage</span><span className="icon-pill bg-teal"><HardDrive width={15} height={15} /></span></div>
                <div className="card-value">{formatBytes(stats.total_storage_bytes)}</div>
              </div>
              <div className="card">
                <div className="kpi-top"><span className="card-label">API Calls</span><span className="icon-pill bg-purple"><Key width={15} height={15} /></span></div>
                <div className="card-value">{stats.total_api_requests}</div>
              </div>
            </div>
            <div className="card table-wrap">
              <table className="table">
                <thead><tr><th>Action</th><th>IP</th><th>Time</th></tr></thead>
                <tbody>
                  {stats.recent_activities.map((a) => (
                    <tr key={a.id}>
                      <td>{a.action}</td>
                      <td>{a.ip_address}</td>
                      <td>{new Date(a.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === 'projects' && (
          <>
            <div className="header">
              <h2>Projects</h2>
              <input className="input" style={{ width: '220px' }} placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <form onSubmit={createProject} className="card" style={{ marginBottom: '1.25rem', display: 'grid', gridTemplateColumns: '1fr 1fr 120px auto', gap: '0.75rem' }}>
              <input className="input" placeholder="Name" value={newProj.name} onChange={(e) => setNewProj({ ...newProj, name: e.target.value })} required />
              <input className="input" placeholder="Description" value={newProj.description} onChange={(e) => setNewProj({ ...newProj, description: e.target.value })} />
              <input className="input" type="number" placeholder="MB" value={newProj.storage_limit_mb} onChange={(e) => setNewProj({ ...newProj, storage_limit_mb: e.target.value })} />
              <button className="btn btn-primary"><Plus width={16} height={16} /> Create</button>
            </form>
            <div className="card table-wrap">
              <table className="table">
                <thead><tr><th>Name</th><th>ID</th><th>Status</th><th>Records</th><th>Storage</th><th>Actions</th></tr></thead>
                <tbody>
                  {filteredProjects.map((p) => (
                    <tr key={p.id}>
                      <td><strong>{p.name}</strong></td>
                      <td><code>{p.project_code}</code></td>
                      <td><span className={`badge ${p.status === 'active' ? 'badge-active' : 'badge-inactive'}`}>{p.status}</span></td>
                      <td>{p.record_count}</td>
                      <td>{formatBytes(Number(p.used_storage_bytes))} / {formatBytes(Number(p.storage_limit_bytes))}</td>
                      <td style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn btn-secondary" onClick={() => toggleStatus(p)}>{p.status === 'active' ? 'Pause' : 'Enable'}</button>
                        <button className="btn btn-danger" onClick={() => deleteProject(p.id)}><Trash width={15} height={15} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === 'apis' && (
          <>
            <div className="header"><h2>APIs</h2></div>
            <div style={{ display: 'grid', gap: '1rem' }}>
              {projects.map((p) => {
                const snippet = `fetch('${window.location.origin}/api/v1/data/contacts', {\n  method: 'POST',\n  headers: {\n    'Content-Type': 'application/json',\n    'x-project-id': '${p.project_code}',\n    'x-api-key': '${p.public_key || ''}'\n  },\n  body: JSON.stringify({ name: 'User' })\n});`;
                return (
                  <div key={p.id} className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <strong>{p.name} ({p.project_code})</strong>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn btn-secondary" onClick={() => navigator.clipboard.writeText(snippet)}><Copy width={14} height={14} /> Copy</button>
                        <button className="btn btn-primary" onClick={() => rotateKey(p.id)}>Rotate Key</button>
                      </div>
                    </div>
                    <div className="code-box">{snippet}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {tab === 'database' && (
          <>
            <div className="header">
              <h2>Database</h2>
              <select className="input" style={{ width: '240px' }} value={selectedProjId} onChange={(e) => loadCollections(e.target.value)}>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '1rem' }}>
              <div className="card">
                {collections.map((c) => (
                  <button key={c.id} className={`nav-btn ${selectedCollection === c.name ? 'active' : ''}`} style={{ width: '100%' }} onClick={() => loadRecords(c.name)}>
                    {c.name} ({c.record_count})
                  </button>
                ))}
              </div>
              <div className="card table-wrap">
                <table className="table">
                  <thead><tr><th>ID</th><th>Data</th><th>Created</th></tr></thead>
                  <tbody>
                    {records.map((r) => (
                      <tr key={r.id}>
                        <td><code>{r.id.slice(0, 8)}</code></td>
                        <td><code>{JSON.stringify(r.data)}</code></td>
                        <td>{new Date(r.created_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {tab === 'storage' && (
          <>
            <div className="header">
              <h2>Storage</h2>
              <select className="input" style={{ width: '240px' }} value={selectedProjId} onChange={(e) => loadFiles(e.target.value)}>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="card table-wrap">
              <table className="table">
                <thead><tr><th>File</th><th>Type</th><th>Size</th><th>Uploaded</th><th>Action</th></tr></thead>
                <tbody>
                  {files.map((f) => (
                    <tr key={f.id}>
                      <td>{f.original_name}</td>
                      <td>{f.mime_type}</td>
                      <td>{formatBytes(Number(f.size_bytes))}</td>
                      <td>{new Date(f.created_at).toLocaleString()}</td>
                      <td><button className="btn btn-danger" onClick={() => deleteFile(f.id)}><Trash width={14} height={14} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === 'backups' && (
          <>
            <div className="header">
              <h2>Backups</h2>
              <button className="btn btn-primary" onClick={createBackup}><Plus width={15} height={15} /> Create Backup</button>
            </div>
            <div className="card table-wrap">
              <table className="table">
                <thead><tr><th>Type</th><th>Size</th><th>Status</th><th>Created</th><th>Action</th></tr></thead>
                <tbody>
                  {backups.map((b) => (
                    <tr key={b.id}>
                      <td>{b.backup_type}</td>
                      <td>{formatBytes(Number(b.size_bytes))}</td>
                      <td><span className="badge badge-active">{b.status}</span></td>
                      <td>{new Date(b.created_at).toLocaleString()}</td>
                      <td><button className="btn btn-secondary" onClick={() => restoreBackup(b.id)}>Restore</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === 'logs' && (
          <>
            <div className="header">
              <h2>API Logs</h2>
              <button className="btn btn-secondary" onClick={loadLogs}><Refresh width={15} height={15} /> Refresh</button>
            </div>
            <div className="card table-wrap">
              <table className="table">
                <thead><tr><th>Project</th><th>Method</th><th>Endpoint</th><th>Status</th><th>Time</th></tr></thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id}>
                      <td>{l.project_name || '-'}</td>
                      <td><strong>{l.method}</strong></td>
                      <td><code>{l.endpoint}</code></td>
                      <td>{l.status_code}</td>
                      <td>{new Date(l.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
