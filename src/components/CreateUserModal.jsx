import { useEffect, useRef, useState } from 'react';
import { useApp } from '../AppContext';
import Modal from './Modal';
import PasswordInput from './PasswordInput';
import {
  BRANCH_ACCESS_OPTIONS, COUNTRIES, DATA_SCOPE_OPTIONS, DEPARTMENTS, EMAIL_DOMAIN
} from '../constants';
import { deepClone, uid, validatePassword } from '../utils';
import { createUserAsAdmin, friendlyAuthError } from '../auth';

/** Something the new user can actually type, that still passes the policy. */
function suggestPassword() {
  const words = ['Leadrat', 'Invoice', 'Welcome', 'Access', 'Billing'];
  const w = words[Math.floor(Math.random() * words.length)];
  return w + '@' + Math.floor(1000 + Math.random() * 9000);
}

/**
 * Admin-side account creation. Firebase signs an account in the moment it is
 * created, so this runs against a throwaway secondary app (see
 * createUserAsAdmin) and the admin's own session is never disturbed.
 */
export default function CreateUserModal({ open, onClose, onCreated }) {
  const { users, roles, getDefaultPermissionsForDept, showToast } = useApp();

  const [firstName, setFirstName] = useState('');
  const [surname, setSurname] = useState('');
  const [username, setUsername] = useState('');
  const [country, setCountry] = useState(COUNTRIES[0].value);
  const [mobile, setMobile] = useState('');
  const [department, setDepartment] = useState(DEPARTMENTS[0]);
  const [roleId, setRoleId] = useState('');
  const [branchAccess, setBranchAccess] = useState('all');
  const [dataScope, setDataScope] = useState('own');
  const [password, setPassword] = useState('');
  const [mustChange, setMustChange] = useState(true);
  const [badField, setBadField] = useState(null);
  const [saving, setSaving] = useState(false);

  const refs = useRef({});
  const bind = (f) => (el) => { refs.current[f] = el; };
  const cls = (f) => 'form-input' + (badField === f ? ' field-error' : '');

  useEffect(() => {
    if (!open) return;
    setFirstName(''); setSurname(''); setUsername(''); setMobile('');
    setCountry(COUNTRIES[0].value);
    setDepartment(DEPARTMENTS[0]);
    setRoleId(roles[0] ? roles[0].id : '');
    setBranchAccess('all');
    setDataScope(roles[0] && roles[0].dataScope ? roles[0].dataScope : 'own');
    setPassword(suggestPassword());
    setMustChange(true);
    setBadField(null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedRole = roles.find((r) => r.id === roleId) || null;
  // A role carries its own scope; only a user with no role picks one directly.
  const scopeFromRole = !!selectedRole && !!selectedRole.dataScope;
  const effectiveScope = scopeFromRole ? selectedRole.dataScope : dataScope;

  const [iso, dial, len] = country.split('|');
  const email = username.trim().toLowerCase() + EMAIL_DOMAIN;

  function fail(field, msg) {
    setBadField(field);
    const el = refs.current[field];
    if (el) el.focus();
    showToast(msg, 'error');
  }

  async function create() {
    if (saving) return;
    const fn = firstName.trim(), sn = surname.trim(), un = username.trim().toLowerCase();
    if (!fn) return fail('cuFirst', 'First name is required');
    if (!sn) return fail('cuSurname', 'Surname is required');
    if (!un) return fail('cuUser', 'Username is required');
    if (!/^[a-z0-9._-]+$/.test(un)) return fail('cuUser', 'Username may only contain letters, numbers, dots, hyphens and underscores');
    if (users.some((u) => (u.email || '').toLowerCase() === email)) {
      return fail('cuUser', email + ' already has a profile');
    }
    const digits = mobile.replace(/\D/g, '');
    if (digits && digits.length !== +len) return fail('cuMobile', 'Mobile must be ' + len + ' digits for ' + iso);
    const pwErr = validatePassword(password);
    if (pwErr) return fail('cuPass', pwErr);

    setSaving(true);
    try {
      // Create the login first — if Firebase rejects it there is no orphan profile.
      const authUid = await createUserAsAdmin(email, password, (fn + ' ' + sn).trim());
      const profile = {
        id: uid(),
        authUid,
        firstName: fn,
        surname: sn,
        name: (fn + ' ' + sn).trim(),
        email,
        countryISO: iso,
        countryCode: dial,
        mobile: digits,
        department,
        roleId: roleId || null,
        permissionsSource: roleId ? 'role' : 'custom',
        permissions: deepClone(getDefaultPermissionsForDept(department)),
        branchAccess,
        dataScope: effectiveScope,
        role: 'user',
        status: 'active',
        authProvider: 'password',
        mustChangePassword: mustChange,
        createdAt: new Date().toISOString(),
        createdByAdmin: true
      };
      await onCreated(profile, password);
    } catch (e) {
      showToast(friendlyAuthError(e), 'error');
    } finally {
      setSaving(false);
    }
  }

  const footer = (
    <>
      <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
      <button className="btn btn-secondary" onClick={() => setPassword(suggestPassword())} disabled={saving}>
        🎲 Suggest Password
      </button>
      <button className="btn btn-primary" onClick={create} disabled={saving}>
        {saving ? 'Creating…' : 'Create User'}
      </button>
    </>
  );

  return (
    <Modal open={open} title="Create User Profile" onClose={onClose} maxWidth={680} footer={footer}>
      <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>
        Creates both the sign-in account and the profile. You stay signed in — the new account is
        registered on a separate connection. Hand the person their username and the initial password below.
      </p>

      <div className="form-grid-2">
        <div className="form-group">
          <label className="form-label">First Name <span className="req">*</span></label>
          <input ref={bind('cuFirst')} type="text" className={cls('cuFirst')}
            value={firstName} onChange={(e) => { setFirstName(e.target.value); setBadField(null); }} />
        </div>
        <div className="form-group">
          <label className="form-label">Surname <span className="req">*</span></label>
          <input ref={bind('cuSurname')} type="text" className={cls('cuSurname')}
            value={surname} onChange={(e) => { setSurname(e.target.value); setBadField(null); }} />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Username <span className="req">*</span></label>
        <div className={'email-row' + (badField === 'cuUser' ? ' field-error' : '')}>
          <input ref={bind('cuUser')} type="text" className="email-user" placeholder="firstname.surname"
            value={username}
            onChange={(e) => { setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '')); setBadField(null); }} />
          <div className="email-suffix">{EMAIL_DOMAIN}</div>
        </div>
        <div className="password-hint">They sign in with <strong>{email}</strong></div>
      </div>

      <div className="form-grid-2">
        <div className="form-group">
          <label className="form-label">Country</label>
          <select className="form-input" value={country} onChange={(e) => setCountry(e.target.value)}>
            {COUNTRIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Mobile</label>
          <input ref={bind('cuMobile')} type="tel" className={cls('cuMobile')} placeholder={len + ' digits (optional)'}
            value={mobile} onChange={(e) => { setMobile(e.target.value.replace(/\D/g, '').slice(0, +len)); setBadField(null); }} />
        </div>
      </div>

      <hr className="section-divider" />
      <div className="card-title">Access</div>
      <div className="form-grid-2">
        <div className="form-group">
          <label className="form-label">Department</label>
          <select className="form-input" value={department} onChange={(e) => setDepartment(e.target.value)}>
            {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <div className="password-hint">Org structure only — permissions come from the role.</div>
        </div>
        <div className="form-group">
          <label className="form-label">Role</label>
          <select className="form-input" value={roleId} onChange={(e) => {
            setRoleId(e.target.value);
            const r = roles.find((x) => x.id === e.target.value);
            if (r && r.dataScope) setDataScope(r.dataScope);
          }}>
            <option value="">-- No role (use department defaults) --</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          {selectedRole && selectedRole.description && (
            <div className="password-hint">{selectedRole.description}</div>
          )}
        </div>
        <div className="form-group">
          <label className="form-label">Branch Access</label>
          <select className="form-input" value={branchAccess} onChange={(e) => setBranchAccess(e.target.value)}>
            {BRANCH_ACCESS_OPTIONS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Data Scope</label>
          <select className="form-input" value={effectiveScope} disabled={scopeFromRole}
            style={scopeFromRole ? { background: '#F3F4F6', cursor: 'not-allowed' } : undefined}
            onChange={(e) => setDataScope(e.target.value)}>
            {DATA_SCOPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <div className="password-hint">
            {scopeFromRole
              ? 'Set by the "' + selectedRole.name + '" role.'
              : 'Controls how much of their branches they see.'}
          </div>
        </div>
      </div>

      <hr className="section-divider" />
      <div className="card-title">Initial Password</div>
      <div className="form-group">
        <label className="form-label">Password <span className="req">*</span></label>
        <PasswordInput
          className={badField === 'cuPass' ? 'field-error' : ''} value={password}
          autoComplete="new-password"
          onChange={(v) => { setPassword(v); setBadField(null); }}
        />
        <div className="password-hint">
          8+ characters with an uppercase letter, a number and a symbol. Share it with the user directly —
          it is not shown again after this modal closes.
        </div>
      </div>
      <div className="checkbox-row">
        <input id="cuMustChange" type="checkbox" checked={mustChange} onChange={(e) => setMustChange(e.target.checked)} />
        <label htmlFor="cuMustChange">Require them to change this password at first sign-in</label>
      </div>
    </Modal>
  );
}
