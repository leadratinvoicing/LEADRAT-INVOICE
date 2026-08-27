import { useEffect, useState } from 'react';
import { useApp } from '../AppContext';
import Modal from './Modal';
import PermissionsGrid from './PermissionsGrid';
import { BRANCH_ACCESS_OPTIONS, DATA_SCOPE_OPTIONS, DEPARTMENTS } from '../constants';
import { deepClone } from '../utils';
import { friendlyAuthError, sendResetEmail } from '../auth';

export default function UserModal({ open, user, onClose, onSave }) {
  const { getDefaultPermissionsForDept, roles, showToast } = useApp();

  const [firstName, setFirstName] = useState('');
  const [surname, setSurname] = useState('');
  const [mobile, setMobile] = useState('');
  const [department, setDepartment] = useState('Sales');
  const [status, setStatus] = useState('active');
  const [branchAccess, setBranchAccess] = useState('all');
  const [roleId, setRoleId] = useState('');
  const [permissionsSource, setPermissionsSource] = useState('custom');
  const [dataScope, setDataScope] = useState('all');
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [perms, setPerms] = useState({});
  const [saving, setSaving] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    setFirstName(user.firstName || '');
    setSurname(user.surname || '');
    setMobile(user.mobile || '');
    setDepartment(user.department || 'Sales');
    setStatus(user.status || 'active');
    setBranchAccess(user.branchAccess || 'all');
    setRoleId(user.roleId || '');
    setPermissionsSource(user.roleId && user.permissionsSource !== 'custom' ? 'role' : 'custom');
    setDataScope(user.dataScope === 'own' ? 'own' : 'all');
    setMustChangePassword(!!user.mustChangePassword);
    setPerms(deepClone(user.permissions || getDefaultPermissionsForDept(user.department || 'Sales')));
  }, [open, user, getDefaultPermissionsForDept]);

  if (!user) return null;

  const selectedRole = roles.find((r) => r.id === roleId) || null;
  // A role in force owns the grid and the scope; "custom" hands both back.
  const usingRole = permissionsSource === 'role' && !!selectedRole;
  const shownPerms = usingRole ? (selectedRole.permissions || {}) : perms;
  const shownScope = usingRole && selectedRole.dataScope ? selectedRole.dataScope : dataScope;

  const togglePerm = (modKey, act, checked) =>
    setPerms((p) => ({ ...p, [modKey]: { ...(p[modKey] || {}), [act]: checked } }));

  function applyDeptDefaults() {
    setPerms(getDefaultPermissionsForDept(department));
    setPermissionsSource('custom');
    showToast('Loaded default permissions for ' + department);
  }

  /** Switching to custom starts from whatever the user can do right now. */
  function detachFromRole() {
    if (selectedRole) setPerms(deepClone(selectedRole.permissions || {}));
    setPermissionsSource('custom');
  }

  async function sendReset() {
    setSendingReset(true);
    try {
      await sendResetEmail(user.email);
      showToast('Password reset email sent to ' + user.email);
    } catch (e) {
      showToast(friendlyAuthError(e), 'error');
    } finally {
      setSendingReset(false);
    }
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      const fn = firstName.trim() || user.firstName;
      const sn = surname.trim() || user.surname;
      await onSave({
        ...user,
        firstName: fn,
        surname: sn,
        name: ((fn || '') + ' ' + (sn || '')).trim(),
        mobile: mobile.trim(),
        department,
        status,
        branchAccess,
        roleId: roleId || null,
        permissionsSource: usingRole ? 'role' : 'custom',
        // The stored grid stays as a snapshot even while a role is in force, so
        // detaching later leaves the user with the access they had.
        permissions: usingRole ? deepClone(selectedRole.permissions || {}) : perms,
        dataScope: shownScope,
        mustChangePassword,
        updatedAt: new Date().toISOString()
      });
    } finally {
      setSaving(false);
    }
  }

  const footer = (
    <>
      <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
      <button className="btn btn-secondary" onClick={applyDeptDefaults}>Apply Department Defaults</button>
      <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save User'}</button>
    </>
  );

  return (
    <Modal open={open} title={'Edit User: ' + (user.name || user.email)} onClose={onClose} maxWidth={680} footer={footer}>
      <div className="form-grid-2">
        <div className="form-group">
          <label className="form-label">First Name</label>
          <input type="text" className="form-input" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Surname</label>
          <input type="text" className="form-input" value={surname} onChange={(e) => setSurname(e.target.value)} />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Email</label>
        <input type="email" className="form-input" value={user.email || ''} disabled readOnly />
      </div>
      <div className="form-grid-2">
        <div className="form-group">
          <label className="form-label">Country Code</label>
          <input type="text" className="form-input" value={user.countryCode || '+91'} disabled readOnly />
        </div>
        <div className="form-group">
          <label className="form-label">Mobile</label>
          <input type="text" className="form-input" value={mobile} onChange={(e) => setMobile(e.target.value)} />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Department</label>
        <select className="form-input" value={department} onChange={(e) => setDepartment(e.target.value)}>
          {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Status</label>
        <select className="form-input" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      <hr className="section-divider" />
      <div className="card-title">Visibility</div>
      <div className="form-grid-2">
        <div className="form-group">
          <label className="form-label">Allowed Branch(es)</label>
          <select className="form-input" value={branchAccess} onChange={(e) => setBranchAccess(e.target.value)}>
            {BRANCH_ACCESS_OPTIONS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
          </select>
          <div className="password-hint">Admins always reach every branch regardless of this setting.</div>
        </div>
        <div className="form-group">
          <label className="form-label">Data Scope</label>
          <select className="form-input" value={shownScope} disabled={usingRole && !!selectedRole.dataScope}
            style={usingRole && selectedRole.dataScope ? { background: '#F3F4F6', cursor: 'not-allowed' } : undefined}
            onChange={(e) => setDataScope(e.target.value)}>
            {DATA_SCOPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <div className="password-hint">
            {usingRole && selectedRole.dataScope
              ? 'Set by the "' + selectedRole.name + '" role.'
              : shownScope === 'own'
              ? 'Sees only the invoices, proformas and clients they raised or were assigned.'
              : 'Sees everything in the branches above.'}
          </div>
        </div>
      </div>

      <hr className="section-divider" />
      <div className="card-title">Role &amp; Permissions</div>
      <div className="form-group">
        <label className="form-label">Role</label>
        <select className="form-input" value={roleId} onChange={(e) => {
          const id = e.target.value;
          setRoleId(id);
          if (id) {
            const r = roles.find((x) => x.id === id);
            setPermissionsSource('role');
            if (r && r.dataScope) setDataScope(r.dataScope);
          } else {
            setPermissionsSource('custom');
          }
        }}>
          <option value="">-- No role (custom permissions) --</option>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        {selectedRole && selectedRole.description && (
          <div className="password-hint">{selectedRole.description}</div>
        )}
      </div>

      {selectedRole && (
        <div className="checkbox-row" style={{ marginBottom: 12 }}>
          <input
            id="umCustomPerms" type="checkbox" checked={permissionsSource === 'custom'}
            onChange={(e) => (e.target.checked ? detachFromRole() : setPermissionsSource('role'))}
          />
          <label htmlFor="umCustomPerms">Override the role with custom permissions for this user</label>
        </div>
      )}

      <p style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 12 }}>
        {usingRole
          ? 'These come from the "' + selectedRole.name + '" role and update whenever it is edited. Tick the box above to hand-tune them for this person.'
          : 'Enable the modules this user can access, and the actions they can perform within each.'}
      </p>
      <div style={usingRole ? { opacity: 0.65, pointerEvents: 'none' } : undefined}>
        <PermissionsGrid perms={shownPerms} onToggle={togglePerm} />
      </div>

      <hr className="section-divider" />
      <div className="card-title">Password</div>
      {user.authProvider === 'google' ? (
        <p style={{ fontSize: 10, color: 'var(--muted)' }}>
          This account signs in with Google — there is no password to manage here.
        </p>
      ) : (
        <>
          <p style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 10 }}>
            Firebase holds passwords, and its browser SDK cannot set one for another account — that needs a
            server. Either send a reset link, or require a change at the user&apos;s next sign-in.
          </p>
          <button className="btn btn-secondary" onClick={sendReset} disabled={sendingReset}>
            {sendingReset ? 'Sending…' : '✉ Send Password Reset Email'}
          </button>
          <div className="checkbox-row" style={{ marginTop: 12 }}>
            <input id="umMustChange" type="checkbox" checked={mustChangePassword}
              onChange={(e) => setMustChangePassword(e.target.checked)} />
            <label htmlFor="umMustChange">Require a password change at next sign-in</label>
          </div>
        </>
      )}
    </Modal>
  );
}
