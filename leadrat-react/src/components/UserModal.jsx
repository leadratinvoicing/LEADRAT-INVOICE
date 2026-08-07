import { useEffect, useState } from 'react';
import { useApp } from '../AppContext';
import Modal from './Modal';
import PermissionsGrid from './PermissionsGrid';
import { DEPARTMENTS } from '../constants';
import { deepClone } from '../utils';
import { friendlyAuthError, sendResetEmail } from '../auth';

export default function UserModal({ open, user, onClose, onSave }) {
  const { getDefaultPermissionsForDept, showToast } = useApp();

  const [firstName, setFirstName] = useState('');
  const [surname, setSurname] = useState('');
  const [mobile, setMobile] = useState('');
  const [department, setDepartment] = useState('Sales');
  const [status, setStatus] = useState('active');
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
    setPerms(deepClone(user.permissions || getDefaultPermissionsForDept(user.department || 'Sales')));
  }, [open, user, getDefaultPermissionsForDept]);

  if (!user) return null;

  const togglePerm = (modKey, act, checked) =>
    setPerms((p) => ({ ...p, [modKey]: { ...(p[modKey] || {}), [act]: checked } }));

  function applyDeptDefaults() {
    setPerms(getDefaultPermissionsForDept(department));
    showToast('Loaded default permissions for ' + department);
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
        permissions: perms,
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
      <div className="card-title">Module Access &amp; Permissions</div>
      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
        Enable modules this user can access, and the actions they can perform within each.
      </p>
      <PermissionsGrid perms={perms} onToggle={togglePerm} />

      <div style={{ marginTop: 12, padding: 10, background: 'var(--brand-light)', borderRadius: 6, fontSize: 12, color: 'var(--brand-dark)' }}>
        💡 Click <strong>&quot;Apply Department Defaults&quot;</strong> below to reset this user&apos;s permissions to their department&apos;s standard set.
      </div>

      <hr className="section-divider" />
      <div className="card-title">Reset Password</div>
      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
        Passwords are held by Firebase Authentication, so they can&apos;t be set directly from here.
        Send this user a reset link and they choose their own new password.
      </p>
      <button className="btn btn-secondary" onClick={sendReset} disabled={sendingReset || user.authProvider === 'google'}>
        {sendingReset ? 'Sending…' : '✉ Send Password Reset Email'}
      </button>
      {user.authProvider === 'google' && (
        <div className="password-hint">This account signs in with Google — it has no password to reset.</div>
      )}
    </Modal>
  );
}
