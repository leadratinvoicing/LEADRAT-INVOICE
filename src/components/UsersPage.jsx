import { useState } from 'react';
import { useApp } from '../AppContext';
import { DEFAULT_DEPT_PERMISSIONS, DEPARTMENTS } from '../constants';
import { deepClone } from '../utils';
import PermissionsGrid from './PermissionsGrid';

export default function UsersPage({ onView, onEdit, onDelete }) {
  const { users, deptPermissions, saveDeptPermissions, reloadUsers, showToast } = useApp();
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('');
  const [rolesOpen, setRolesOpen] = useState(false);
  const [activeDept, setActiveDept] = useState(DEPARTMENTS[0]);
  const [draftPerms, setDraftPerms] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const s = search.toLowerCase();
  let list = users || [];
  if (s) {
    list = list.filter((u) =>
      (u.name || '').toLowerCase().includes(s) ||
      (u.email || '').toLowerCase().includes(s) ||
      (u.department || '').toLowerCase().includes(s)
    );
  }
  if (dept) list = list.filter((u) => u.department === dept);

  function openRolesPanel() {
    const next = !rolesOpen;
    setRolesOpen(next);
    if (next) {
      setActiveDept(DEPARTMENTS[0]);
      setDraftPerms(deepClone(deptPermissions[DEPARTMENTS[0]] || DEFAULT_DEPT_PERMISSIONS[DEPARTMENTS[0]]));
    }
  }

  function switchDeptTab(d) {
    setActiveDept(d);
    setDraftPerms(deepClone(deptPermissions[d] || DEFAULT_DEPT_PERMISSIONS[d]));
  }

  function togglePerm(modKey, act, checked) {
    setDraftPerms((p) => ({ ...p, [modKey]: { ...(p[modKey] || {}), [act]: checked } }));
  }

  async function saveDefaults() {
    await saveDeptPermissions({ ...deptPermissions, [activeDept]: draftPerms });
    showToast(activeDept + ' default permissions saved');
  }

  async function resetDefaults() {
    if (!confirm('Reset ' + activeDept + ' to built-in defaults?')) return;
    const fresh = deepClone(DEFAULT_DEPT_PERMISSIONS[activeDept]);
    setDraftPerms(fresh);
    await saveDeptPermissions({ ...deptPermissions, [activeDept]: fresh });
    showToast('Reset to built-in defaults');
  }

  async function refresh() {
    setRefreshing(true);
    const before = (users || []).length;
    try {
      const after = (await reloadUsers()).length;
      if (after === before && after === 0) {
        showToast('No users found in storage. If a user just signed up, ask them to refresh, then try again.', 'warn');
      } else if (after === before) {
        showToast('User list is already up to date (' + after + ' user' + (after === 1 ? '' : 's') + ')');
      } else {
        showToast('Loaded ' + after + ' user' + (after === 1 ? '' : 's') + ' (was ' + before + ')');
      }
    } catch (e) {
      showToast('Refresh failed: ' + (e.message || e), 'error');
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="page show">
      <div className="page-header">
        <div>
          <div className="page-title">Users &amp; Permissions</div>
          <div className="page-subtitle">Manage registered users and their access rights</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={refresh} disabled={refreshing} title="Reload latest user list from shared storage">
            🔄 {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <button className="btn btn-secondary" onClick={openRolesPanel}>Manage Role Defaults</button>
        </div>
      </div>

      <div className="filter-bar">
        <input type="text" className="form-input search-input" placeholder="Search by name, email, department..."
          value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="form-input" value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="">All Departments</option>
          {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th><th>Email</th><th>Mobile</th><th>Department</th><th>Status</th><th>Joined</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={7}>
                <div className="empty-state">
                  <div className="empty-state-icon">👥</div>
                  <div className="empty-state-title">No users found</div>
                  <div className="empty-state-text">Users will appear here as they sign up.</div>
                </div>
              </td></tr>
            ) : list.map((u) => {
              const status = u.status || 'active';
              const joined = u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-GB') : '';
              const mobile = ((u.countryCode || '') + ' ' + (u.mobile || '')).trim();
              return (
                <tr key={u.email}>
                  <td>
                    <a onClick={() => onView(u.email)} style={{ color: 'var(--brand-dark)', fontWeight: 600, cursor: 'pointer', textDecoration: 'none' }}>
                      {u.name || ((u.firstName || '') + ' ' + (u.surname || '')).trim() || u.email}
                    </a>
                  </td>
                  <td style={{ fontSize: 12 }}>{u.email || ''}</td>
                  <td style={{ fontSize: 12 }}>{mobile || '-'}</td>
                  <td><span className="badge badge-invoice">{u.department || '-'}</span></td>
                  <td><span className={'badge ' + (status === 'active' ? 'badge-paid' : 'badge-due')}>{status}</span></td>
                  <td style={{ fontSize: 12 }}>{joined}</td>
                  <td>
                    <div className="actions-cell">
                      <button className="icon-btn pdf" onClick={() => onView(u.email)} title="View full details">👁 View</button>
                      <button className="icon-btn edit" onClick={() => onEdit(u.email)} title="Edit user &amp; permissions">✏️ Edit</button>
                      <button className="icon-btn delete" onClick={() => onDelete(u.email)} title="Delete user">🗑</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {rolesOpen && draftPerms && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-title">Default Permissions by Department</div>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>
            These defaults are applied to <strong>new users</strong> at signup. Existing users keep their current permissions unless edited individually.
          </p>
          <div>
            <div className="tabs" style={{ borderBottom: '2px solid var(--border)', marginBottom: 16 }}>
              {DEPARTMENTS.map((d) => (
                <button key={d} className={'tab' + (d === activeDept ? ' active' : '')} onClick={() => switchDeptTab(d)}>{d}</button>
              ))}
            </div>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}>
              Default permissions for new <strong>{activeDept}</strong> users:
            </p>
            <PermissionsGrid perms={draftPerms} onToggle={togglePerm} />
            <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary btn-sm" onClick={resetDefaults}>Reset to Built-in</button>
              <button className="btn btn-primary btn-sm" onClick={saveDefaults}>Save Defaults for {activeDept}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
