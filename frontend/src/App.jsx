import { useEffect, useState } from 'react';
import { LayoutDashboard, FolderKanban, KeyRound, Database, LogOut, RefreshCw, Trash2, Plus } from 'lucide-react';
import { apiFetch } from './api/client';
import './styles.css';

function formatBytes(bytes = 0) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function App() {
  const [admin, setAdmin] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const [tab, setTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [projects, setProjects] = useState([]);
  const [newProj, setNewProj] = useState({ name: '', description: '', storage_limit_mb: 500 });

  const [selectedProjId, setSelectedProjId] = useState('');
  const [collections, setCollections] = useState([]);
  const [selectedCollection, setSelectedCollection] = useState('');
  const [records, setRecords] = useState([]);

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
    await apiFetch('/api/admin/projects', {
      method: 'POST',
      body: JSON.stringify(newProj)
    });
    setNewProj({ name: '', description: '', storage_limit_mb: 500 });
    loadDashboardData();
  }

  async function toggleStatus(proj) {
    const nextStatus = proj.status === 'active' ? 'inactive' : 'active';
    await apiFetch(`/api/admin/projects/${proj.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: nextStatus })
    });
    loadDashboardData();
  }

  async function deleteProject(id) {
    if (!confirm('Delete this project and all its data?')) return;
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

  if (checkingAuth) return <div style={{ padding: '2rem' }}>Loading...</div>;

  if (!admin) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <form onSubmit={handleLogin} className="card" style={{ width: '360px' }}>
          <h2 style={{ marginBottom: '1rem' }}>Central Backend Login</h2>
          {authError && <p style={{ color: '#f87171', marginBottom: '0.75rem', fontSize: '0.88rem' }}>{authError}</p>}
          <input className="input" type="email" placeholder="Admin Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input className="input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button className="btn btn-primary" style={{ width: '100%' }}>Sign In</button>
        </form>
      </div>
    );
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">CentralBackend</div>
        <button className={`nav-btn ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>
          <LayoutDashboard size={18} /> Overview
        </button>
        <button className={`nav-btn ${tab === 'projects' ? 'active' : ''}`} onClick={() => setTab('projects')}>
          <FolderKanban size={18} /> Projects
        </button>
        <button className={`nav-btn ${tab === 'apis' ? 'active' : ''}`} onClick={() => setTab('apis')}>
          <KeyRound size={18} /> API Manager
        </button>
        <button className={`nav-btn ${tab === 'database' ? 'active' : ''}`} onClick={() => { setTab('database'); loadCollections(selectedProjId); }}>
          <Database size={18} /> Database
        </button>
        <button className="nav-btn logout-btn" onClick={handleLogout}>
          <LogOut size={18} /> Logout
        </button>
      </aside>

      <main className="main">
        {tab === 'overview' && stats && (
          <>
            <div className="header">
              <h2>Dashboard Overview</h2>
              <button className="btn btn-secondary" onClick={loadDashboardData}><RefreshCw size={14} /> Refresh</button>
            </div>
            <div className="grid">
              <div className="card"><div className="card-label">Total Projects</div><div className="card-value">{stats.total_projects}</div></div>
              <div className="card"><div className="card-label">Active Projects</div><div className="card-value">{stats.active_projects}</div></div>
              <div className="card"><div className="card-label">Storage Used</div><div className="card-value">{formatBytes(stats.total_storage_bytes)}</div></div>
              <div className="card"><div className="card-label">API Requests</div><div className="card-value">{stats.total_api_requests}</div></div>
            </div>
            <div className="card">
              <h3>Recent Activity</h3>
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
            <div className="header"><h2>Project Manager</h2></div>
            <form onSubmit={createProject} className="card" style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ marginBottom: '0.75rem' }}>Create New Project</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 140px auto', gap: '0.75rem' }}>
                <input className="input" placeholder="Project Name" value={newProj.name} onChange={(e) => setNewProj({ ...newProj, name: e.target.value })} required />
                <input className="input" placeholder="Description" value={newProj.description} onChange={(e) => setNewProj({ ...newProj, description: e.target.value })} />
                <input className="input" type="number" placeholder="Limit MB" value={newProj.storage_limit_mb} onChange={(e) => setNewProj({ ...newProj, storage_limit_mb: e.target.value })} />
                <button className="btn btn-primary" style={{ height: '38px' }}><Plus size={16} /> Create</button>
              </div>
            </form>

            <div className="card">
              <table className="table">
                <thead><tr><th>Name</th><th>Project ID</th><th>Status</th><th>Records</th><th>Storage</th><th>Actions</th></tr></thead>
                <tbody>
                  {projects.map((p) => (
                    <tr key={p.id}>
                      <td><strong>{p.name}</strong></td>
                      <td><code>{p.project_code}</code></td>
                      <td><span className={`badge ${p.status === 'active' ? 'badge-active' : 'badge-inactive'}`}>{p.status}</span></td>
                      <td>{p.record_count}</td>
                      <td>{formatBytes(Number(p.used_storage_bytes))} / {formatBytes(Number(p.storage_limit_bytes))}</td>
                      <td style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn btn-secondary" onClick={() => toggleStatus(p)}>
                          {p.status === 'active' ? 'Deactivate' : 'Activate'}
                        </button>
                        <button className="btn btn-danger" onClick={() => deleteProject(p.id)}><Trash2 size={14} /></button>
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
            <div className="header"><h2>API Manager</h2></div>
            <div style={{ display: 'grid', gap: '1rem' }}>
              {projects.map((p) => (
                <div key={p.id} className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <strong>{p.name} ({p.project_code})</strong>
                    <button className="btn btn-secondary" onClick={() => rotateKey(p.id)}>Rotate Public Key</button>
                  </div>
                  <div className="code-box">
                    {`fetch('http://localhost:5000/api/v1/data/contacts', {\n  method: 'POST',\n  headers: {\n    'Content-Type': 'application/json',\n    'x-project-id': '${p.project_code}',\n    'x-api-key': '${p.public_key || ''}'\n  },\n  body: JSON.stringify({ name: 'Test User' })\n});`}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'database' && (
          <>
            <div className="header">
              <h2>Database Manager</h2>
              <select className="input" style={{ width: '260px', marginBottom: 0 }} value={selectedProjId} onChange={(e) => loadCollections(e.target.value)}>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.project_code})</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: '1rem' }}>
              <div className="card">
                <h4 style={{ marginBottom: '0.75rem' }}>Collections</h4>
                {collections.length === 0 && <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>No collections yet</p>}
                {collections.map((c) => (
                  <button key={c.id} className={`nav-btn ${selectedCollection === c.name ? 'active' : ''}`} style={{ width: '100%' }} onClick={() => loadRecords(c.name)}>
                    {c.name} ({c.record_count})
                  </button>
                ))}
              </div>
              <div className="card">
                <h4>Records {selectedCollection ? `- ${selectedCollection}` : ''}</h4>
                <table className="table">
                  <thead><tr><th>ID</th><th>Data</th><th>Created</th></tr></thead>
                  <tbody>
                    {records.map((r) => (
                      <tr key={r.id}>
                        <td><code>{r.id.slice(0, 8)}...</code></td>
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
      </main>
    </div>
  );
}
