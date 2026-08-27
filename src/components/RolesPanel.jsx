import { useEffect, useState } from 'react';
import { useApp } from '../AppContext';
import { DATA_SCOPE_OPTIONS, DEFAULT_DEPT_PERMISSIONS, PERMISSION_MODULES } from '../constants';
import { deepClone, uid } from '../utils';
import PermissionsGrid from './PermissionsGrid';

/** A brand-new role starts locked down — permissions are granted deliberately. */
function blankPermissions() {
  const p = {};
  for (const mod of PERMISSION_MODULES) {
    p[mod.key] = {};
    for (const act of mod.actions) p[mod.key][act] = false;
  }
  p.settings = { view: true, editProfile: true, changePassword: true };
  return p;
}

/**
 * Admin-managed roles. A role is a named permission set plus a default data
 * scope; assigning one to a user replaces the per-user checkbox grid, so a
 * change here reaches everyone holding that role.
 */
export default function RolesPanel({ onClose }) {
  const { roles, saveRoles, users, saveUsers, showToast, refreshSessionUser } = useApp();

  const [activeId, setActiveId] = useState(roles[0] ? roles[0].id : null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  const active = roles.find((r) => r.id === activeId) || null;

  useEffect(() => {
    if (active) setDraft(deepClone(active));
    else setDraft(null);
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Follow the list when the selected role is created or deleted elsewhere.
  useEffect(() => {
    if (!roles.some((r) => r.id === activeId)) setActiveId(roles[0] ? roles[0].id : null);
  }, [roles]); // eslint-disable-line react-hooks/exhaustive-deps

  const holders = (roleId) => users.filter((u) => u.roleId === roleId);
  const dirty = !!(draft && active && JSON.stringify(draft) !== JSON.stringify(active));

  const togglePerm = (modKey, act, checked) =>
    setDraft((d) => ({ ...d, permissions: { ...d.permissions, [modKey]: { ...(d.permissions[modKey] || {}), [act]: checked } } }));

  async function addRole() {
    const name = (prompt('Name the new role (e.g. "Regional Manager"):') || '').trim();
    if (!name) return;
    if (roles.some((r) => r.name.toLowerCase() === name.toLowerCase())) {
      return showToast('A role called "' + name + '" already exists', 'error');
    }
    const role = {
      id: uid(),
      name,
      description: '',
      dataScope: 'own',
      permissions: blankPermissions(),
      createdAt: new Date().toISOString()
    };
    await saveRoles([...roles, role]);
    setActiveId(role.id);
    showToast('Role "' + name + '" created — set its permissions below');
  }

  async function duplicateRole() {
    if (!active) return;
    const copy = {
      ...deepClone(active),
      id: uid(),
      name: active.name + ' (copy)',
      createdAt: new Date().toISOString()
    };
    await saveRoles([...roles, copy]);
    setActiveId(copy.id);
    showToast('Duplicated as "' + copy.name + '"');
  }

  async function deleteRole() {
    if (!active) return;
    const assigned = holders(active.id);
    const warning = assigned.length
      ? '\n\n' + assigned.length + ' user' + (assigned.length === 1 ? '' : 's') +
        ' hold this role (' + assigned.map((u) => u.name || u.email).join(', ') +
        '). They will keep the permissions they have now, but lose the link to this role.'
      : '';
    if (!confirm('Delete the role "' + active.name + '"?' + warning)) return;

    // Freeze each holder's current permissions onto their own profile first, so
    // deleting a role never silently widens or removes someone's access.
    if (assigned.length) {
      const frozen = new Set(assigned.map((u) => u.email));
      await saveUsers(users.map((u) => (frozen.has(u.email)
        ? { ...u, roleId: null, permissionsSource: 'custom', permissions: deepClone(active.permissions), dataScope: active.dataScope, updatedAt: new Date().toISOString() }
        : u)));
    }
    await saveRoles(roles.filter((r) => r.id !== active.id));
    refreshSessionUser();
    showToast('Role deleted');
  }

  async function save() {
    if (!draft || saving) return;
    const name = (draft.name || '').trim();
    if (!name) return showToast('Role name is required', 'error');
    if (roles.some((r) => r.id !== draft.id && r.name.toLowerCase() === name.toLowerCase())) {
      return showToast('Another role is already called "' + name + '"', 'error');
    }
    setSaving(true);
    try {
      await saveRoles(roles.map((r) => (r.id === draft.id ? { ...draft, name, updatedAt: new Date().toISOString() } : r)));
      refreshSessionUser();
      const n = holders(draft.id).length;
      showToast('Saved "' + name + '"' + (n ? ' — applied to ' + n + ' user' + (n === 1 ? '' : 's') : ''));
    } finally {
      setSaving(false);
    }
  }

  function loadDeptPreset(dept) {
    if (!dept) return;
    setDraft((d) => ({ ...d, permissions: deepClone(DEFAULT_DEPT_PERMISSIONS[dept]) }));
    showToast('Loaded the ' + dept + ' permission set — review and save');
  }

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <div className="card-title" style={{ marginBottom: 0 }}>Roles &amp; Permissions</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary btn-sm" onClick={addRole}>+ New Role</button>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Close</button>
        </div>
      </div>
      <p style={{ fontSize: 10.8, color: 'var(--muted)', marginBottom: 14 }}>
        A role is a named permission set plus a data scope. Assign one to a user and this becomes their
        access — edit the role and every holder updates with it. Departments stay as they are, for org structure.
      </p>

      {roles.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🎭</div>
          <div className="empty-state-title">No roles defined yet</div>
          <div className="empty-state-text">Create one to start managing permissions in groups.</div>
        </div>
      ) : (
        <>
          <div className="tabs">
            {roles.map((r) => {
              const n = holders(r.id).length;
              return (
                <button key={r.id} className={'tab' + (r.id === activeId ? ' active' : '')} onClick={() => setActiveId(r.id)}>
                  {r.name}{n > 0 && <span style={{ opacity: 0.65, fontSize: 9.1 }}> · {n}</span>}
                </button>
              );
            })}
          </div>

          {draft && (
            <>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Role Name <span className="req">*</span></label>
                  <input type="text" className="form-input" value={draft.name}
                    onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Data Scope</label>
                  <select className="form-input" value={draft.dataScope || 'all'}
                    onChange={(e) => setDraft((d) => ({ ...d, dataScope: e.target.value }))}>
                    {DATA_SCOPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <div className="password-hint">
                    &quot;Own + assigned&quot; hides every invoice, proforma and client this user did not raise or receive.
                  </div>
                </div>
                <div className="form-group form-grid-full">
                  <label className="form-label">Description</label>
                  <input type="text" className="form-input" placeholder="What this role is for (optional)"
                    value={draft.description || ''}
                    onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Start From a Department Preset</label>
                  <select className="form-input" value="" onChange={(e) => loadDeptPreset(e.target.value)}>
                    <option value="">-- Copy an existing set --</option>
                    {Object.keys(DEFAULT_DEPT_PERMISSIONS).map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>

              <PermissionsGrid perms={draft.permissions || {}} onToggle={togglePerm} />

              <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                  {holders(draft.id).length === 0
                    ? 'No users hold this role yet.'
                    : 'Held by ' + holders(draft.id).map((u) => u.name || u.email).join(', ')}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary btn-sm" onClick={duplicateRole}>Duplicate</button>
                  <button className="btn btn-danger btn-sm" onClick={deleteRole}>Delete Role</button>
                  <button className="btn btn-primary btn-sm" onClick={save} disabled={saving || !dirty}>
                    {saving ? 'Saving…' : dirty ? 'Save Changes' : 'Saved'}
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
