import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../AppContext';
import Store from '../store';
import { LOGO_DATA_URI } from '../logo';
import { COUNTRIES, DEPARTMENTS, EMAIL_DOMAIN, MINIMAL_PERMISSIONS } from '../constants';
import { deepClone, isValidEmail, validatePassword } from '../utils';
import {
  friendlyAuthError, signInAsAnonymousAdmin, signInWithEmail, signInWithGoogle,
  signOutFirebase, signUpWithEmail
} from '../auth';
import PasswordInput from './PasswordInput';
import GoogleButton from './GoogleButton';
import { buildRestorePrompt, parseBackupFile } from '../backupOps';

const SIGNUP_FIELDS = ['signupFirstName', 'signupSurname', 'signupEmail', 'signupMobile', 'signupDepartment', 'signupPass', 'signupPass2'];

export default function AuthScreen() {
  const {
    stateRef, reloadUsers, reloadInvoices, reloadClients, saveUsers, enterApp,
    adminPass, signupInProgress, restoreBackup, showToast
  } = useApp();

  const [mode, setMode] = useState('signin'); // signin | signup | admin
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [badField, setBadField] = useState(null);

  const [signinUser, setSigninUser] = useState('');
  const [signinPass, setSigninPass] = useState('');

  const [firstName, setFirstName] = useState('');
  const [surname, setSurname] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [country, setCountry] = useState(COUNTRIES[0].value);
  const [mobile, setMobile] = useState('');
  const [department, setDepartment] = useState('');
  const [signupPass, setSignupPass] = useState('');
  const [signupPass2, setSignupPass2] = useState('');

  const [adminUser, setAdminUser] = useState('Admin');
  const [adminPassInput, setAdminPassInput] = useState('');

  const fieldRefs = useRef({});
  const errorTimer = useRef(null);
  const successTimer = useRef(null);
  const backupFileRef = useRef(null);

  const mobileLen = parseInt(country.split('|')[2], 10) || 10;

  // Trim the number when switching to a country with a shorter format.
  useEffect(() => {
    setMobile((m) => (m.length > mobileLen ? m.substring(0, mobileLen) : m));
  }, [mobileLen]);

  const showError = useCallback((msg) => {
    setSuccess('');
    setError(msg);
    clearTimeout(errorTimer.current);
    // Longer messages need more reading time. ~80 chars/sec is comfortable.
    const ms = Math.min(15000, Math.max(4000, msg.length * 80));
    errorTimer.current = setTimeout(() => setError(''), ms);
  }, []);

  const showSuccess = useCallback((msg) => {
    setError('');
    setSuccess(msg);
    clearTimeout(successTimer.current);
    successTimer.current = setTimeout(() => setSuccess(''), 4000);
  }, []);

  const fail = useCallback((field, msg) => {
    setBadField(field);
    showError(msg);
    const el = fieldRefs.current[field];
    if (el) {
      el.focus();
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return false;
  }, [showError]);

  const cls = (field) => 'form-input' + (badField === field ? ' field-error' : '');
  const rowCls = (field) => 'email-row' + (badField === field ? ' field-error' : '');
  const bind = (field) => (el) => { fieldRefs.current[field] = el; };

  function switchAuthMode(next) {
    setMode(next);
    setBadField(null);
    setError('');
    setSuccess('');
  }

  /* ============================================================
     SIGN UP — Firebase email/password account + profile record
     ============================================================ */
  async function doSignUp() {
    if (busy) return;
    setBadField(null);

    const usernamePart = signupEmail.trim().toLowerCase();
    const email = usernamePart ? usernamePart + EMAIL_DOMAIN : '';
    const fn = firstName.trim();
    const sn = surname.trim();
    const mob = mobile.trim();

    if (!fn) return fail('signupFirstName', 'Please complete the highlighted field');
    if (!sn) return fail('signupSurname', 'Please complete the highlighted field');
    if (!usernamePart) return fail('signupEmail', 'Please enter your username');
    if (usernamePart.length < 3) return fail('signupEmail', 'Username must be at least 3 characters');
    if (!/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/.test(usernamePart)) return fail('signupEmail', 'Username must start & end with a letter or digit, and contain only letters, digits, dot, underscore or hyphen');
    if (/\.\./.test(usernamePart)) return fail('signupEmail', 'Username cannot contain consecutive dots');
    if (!isValidEmail(email)) return fail('signupEmail', 'Invalid username format');
    if (stateRef.current.users.find((u) => u.email === email)) return fail('signupEmail', 'This username is already registered');

    const ccParts = country.split('|');
    const expectedLen = parseInt(ccParts[2], 10) || 10;
    if (!mob) return fail('signupMobile', 'Please complete the highlighted field');
    if (!/^\d+$/.test(mob)) return fail('signupMobile', 'Mobile number must contain digits only');
    if (mob.length !== expectedLen) return fail('signupMobile', 'Mobile number must be exactly ' + expectedLen + ' digits for the selected country');
    if (!department) return fail('signupDepartment', 'Please select a department');
    if (!signupPass) return fail('signupPass', 'Please complete the highlighted field');
    const pErr = validatePassword(signupPass);
    if (pErr) return fail('signupPass', pErr);
    if (!signupPass2) return fail('signupPass2', 'Please complete the highlighted field');
    if (signupPass !== signupPass2) return fail('signupPass2', 'Passwords do not match');

    setBusy(true);
    signupInProgress.current = true;
    try {
      // Race-safety: pull the latest users list before writing so a near-simultaneous
      // signup from another browser doesn't get clobbered by our stale cache.
      const latest = await reloadUsers();
      if (latest.find((u) => u.email === email)) {
        signupInProgress.current = false;
        setBusy(false);
        return fail('signupEmail', 'This username is already registered');
      }

      const fullName = fn + ' ' + sn;
      await signUpWithEmail(email, signupPass, fullName);

      const newUser = {
        firstName: fn,
        surname: sn,
        name: fullName,
        email,
        username: usernamePart,
        mobile: mob,
        countryCode: ccParts[1],
        countryISO: ccParts[0],
        department,
        authProvider: 'password',
        role: 'user',
        status: 'active',
        branchAccess: 'all',
        permissions: stateRef.current.deptPermissions[department]
          ? deepClone(stateRef.current.deptPermissions[department])
          : deepClone(MINIMAL_PERMISSIONS),
        createdAt: new Date().toISOString()
      };

      const nextUsers = [...latest, newUser];
      console.log('[signup] Writing users array to shared storage. Count:', nextUsers.length);
      await saveUsers(nextUsers);

      // VERIFY the write actually persisted by reading it back from storage
      let verified = false;
      try {
        const check = await Store.get('users', [], { bypassCache: true });
        verified = !!(check || []).find((u) => u.email === email);
      } catch (e) {
        console.warn('[signup] Verification read failed:', e.message);
      }

      // Keep the original flow: the account is created, then the user signs in.
      await signOutFirebase();

      if (verified) {
        console.log('[signup] ✓ Verified: user is in shared storage and visible to admin.');
        showSuccess('Account created! Username: ' + email + '. Please sign in with the password you just chose.');
        setFirstName(''); setSurname(''); setSignupEmail(''); setMobile('');
        setDepartment(''); setSignupPass(''); setSignupPass2('');
        setTimeout(() => switchAuthMode('signin'), 2200);
      } else {
        showError('Account creation could not be saved to storage. Please reload the page and try again. If this persists, check that Cloud Firestore is enabled for this Firebase project and its security rules allow writes.');
      }
    } catch (e) {
      console.error('[signup]', e);
      const msg = friendlyAuthError(e);
      if (/already registered|Invalid username/.test(msg)) fail('signupEmail', msg);
      else showError(msg);
    } finally {
      signupInProgress.current = false;
      setBusy(false);
    }
  }

  /* ============================================================
     SIGN IN — Firebase email/password
     ============================================================ */
  async function doSignIn() {
    if (busy) return;
    const usernamePart = signinUser.trim().toLowerCase();
    if (!usernamePart || !signinPass) return showError('Please enter credentials');
    // Allow either "firstname" or "firstname@leadrat.com" — normalize
    const ident = usernamePart.includes('@') ? usernamePart : usernamePart + EMAIL_DOMAIN;

    setBusy(true);
    try {
      await signInWithEmail(ident, signinPass);
      const list = await reloadUsers();
      let profile = list.find((u) => u.email === ident);

      if (!profile) {
        // Firebase knows the account but the profile record is missing — recreate a
        // minimal one rather than locking a valid account out.
        profile = buildFallbackProfile(ident, ident.split('@')[0], 'password');
        await saveUsers([...list, profile]);
      }
      if ((profile.status || 'active') === 'suspended') {
        await signOutFirebase();
        return showError('Your account has been suspended. Please contact your administrator.');
      }
      console.log('[signin] ✓ Authenticated:', profile.email);
      enterApp({ ...profile, role: profile.role || 'user' });
    } catch (e) {
      console.warn('[signin]', e);
      showError(friendlyAuthError(e));
    } finally {
      setBusy(false);
    }
  }

  /* ============================================================
     SIGN IN — Google
     ============================================================ */
  async function doGoogleSignIn() {
    if (busy) return;
    setBusy(true);
    try {
      const fbUser = await signInWithGoogle();
      const email = (fbUser.email || '').toLowerCase();
      if (!email) throw new Error('Google account has no email address');

      const list = await reloadUsers();
      let profile = list.find((u) => u.email === email);

      if (!profile) {
        profile = buildFallbackProfile(email, fbUser.displayName || email.split('@')[0], 'google');
        await saveUsers([...list, profile]);
        console.log('[google] Created profile for', email);
      }
      if ((profile.status || 'active') === 'suspended') {
        await signOutFirebase();
        return showError('Your account has been suspended. Please contact your administrator.');
      }
      enterApp({ ...profile, role: profile.role || 'user' });
    } catch (e) {
      console.warn('[google]', e);
      showError(friendlyAuthError(e));
    } finally {
      setBusy(false);
    }
  }

  function buildFallbackProfile(email, displayName, provider) {
    const parts = String(displayName || '').trim().split(/\s+/);
    return {
      firstName: parts[0] || '',
      surname: parts.slice(1).join(' ') || '',
      name: String(displayName || email).trim(),
      email,
      username: email.split('@')[0],
      mobile: '',
      countryCode: '',
      countryISO: '',
      department: '',
      authProvider: provider,
      role: 'user',
      status: 'active',
      branchAccess: 'all',
      permissions: deepClone(MINIMAL_PERMISSIONS),
      createdAt: new Date().toISOString()
    };
  }

  /* ============================================================
     ADMIN SIGN IN — unchanged shared password
     ============================================================ */
  async function doAdminSignIn() {
    if (busy) return;
    if (adminUser.trim() !== 'Admin') return showError('Admin user ID must be "Admin"');
    if (adminPassInput !== adminPass) return showError('Invalid admin password');
    setBusy(true);
    try {
      await signInAsAnonymousAdmin();
      // Refresh ALL shared data on admin login so they immediately see everything
      // created by users in other sessions.
      await Promise.all([reloadUsers(), reloadInvoices(), reloadClients()]);
      enterApp({ name: 'Administrator', email: 'Admin', role: 'admin' });
    } catch (e) {
      showError(friendlyAuthError(e));
    } finally {
      setBusy(false);
    }
  }

  /** Lets someone seed a fresh device with their data before signing in. */
  async function onLoadBackup(file) {
    try {
      const payload = await parseBackupFile(file);
      const s = stateRef.current;
      const current = {
        invoices: (s.invoices || []).length,
        clients: (s.clients || []).length,
        users: (s.users || []).length
      };
      if (!confirm(buildRestorePrompt(payload, current))) return;
      const counts = await restoreBackup(payload.data);
      showSuccess('Backup loaded: ' + counts.invoices + ' invoices, ' + counts.clients + ' clients, ' + counts.users + ' users. Sign in to continue.');
    } catch (e) {
      console.error('Restore failed', e);
      showError('Restore failed: ' + (e.message || e));
      showToast('Restore failed', 'error');
    }
  }

  const onEnter = (fn) => (e) => { if (e.key === 'Enter') fn(); };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-logo">
          <img src={LOGO_DATA_URI} alt="Leadrat" />
        </div>
        <div className="auth-subtitle" style={{ marginTop: 8, fontSize: 15, color: 'var(--text)', fontWeight: 500 }}>
          Leadrat Invoicing
        </div>

        <div className="role-tabs">
          <button className={'role-tab' + (mode !== 'admin' ? ' active' : '')} onClick={() => switchAuthMode('signin')}>Sign In</button>
          <button className={'role-tab' + (mode === 'admin' ? ' active' : '')} onClick={() => switchAuthMode('admin')}>Admin</button>
        </div>

        <div className={'error-msg' + (error ? ' show' : '')}>{error}</div>
        <div className={'success-msg' + (success ? ' show' : '')}>{success}</div>

        {/* SIGN IN */}
        {mode === 'signin' && (
          <div>
            <div className="form-group">
              <label className="form-label">Username</label>
              <div className="email-row">
                <input
                  type="text" className="form-input email-user" placeholder="firstname.lastname"
                  value={signinUser}
                  onChange={(e) => setSigninUser(e.target.value.toLowerCase().replace(/[^a-z0-9._@-]/g, ''))}
                  onKeyDown={onEnter(doSignIn)}
                />
                <span className="email-suffix">@leadrat.com</span>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <div onKeyDown={onEnter(doSignIn)}>
                <PasswordInput value={signinPass} onChange={setSigninPass} placeholder="Enter password" autoComplete="current-password" />
              </div>
            </div>
            <button className="btn btn-primary btn-block" onClick={doSignIn} disabled={busy}>
              {busy ? 'Signing in…' : 'Sign In'}
            </button>

            <div className="auth-divider">or</div>
            <GoogleButton onClick={doGoogleSignIn} disabled={busy} label="Sign in with Google" />

            <div className="auth-switch">Don&apos;t have an account? <a onClick={() => switchAuthMode('signup')}>Sign Up</a></div>
            <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
              Forgot your password? Ask your administrator to reset it for you.
            </div>
          </div>
        )}

        {/* SIGN UP */}
        {mode === 'signup' && (
          <div>
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">First Name <span className="req">*</span></label>
                <input ref={bind('signupFirstName')} type="text" className={cls('signupFirstName')} placeholder="John"
                  value={firstName} onChange={(e) => { setFirstName(e.target.value); setBadField(null); }} />
              </div>
              <div className="form-group">
                <label className="form-label">Surname <span className="req">*</span></label>
                <input ref={bind('signupSurname')} type="text" className={cls('signupSurname')} placeholder="Doe"
                  value={surname} onChange={(e) => { setSurname(e.target.value); setBadField(null); }} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Username <span className="req">*</span></label>
              <div className={rowCls('signupEmail')}>
                <input ref={bind('signupEmail')} type="text" className="form-input email-user" placeholder="firstname.lastname"
                  value={signupEmail}
                  onChange={(e) => { setSignupEmail(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '')); setBadField(null); }} />
                <span className="email-suffix">@leadrat.com</span>
              </div>
              <div className="password-hint">Allowed: lowercase letters, digits, dot, underscore, hyphen. Domain is fixed.</div>
            </div>
            <div className="form-group">
              <label className="form-label">Mobile Number <span className="req">*</span></label>
              <div className="phone-row">
                <select className="form-input phone-cc" value={country} onChange={(e) => setCountry(e.target.value)}>
                  {COUNTRIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
                <input ref={bind('signupMobile')} type="tel" className={cls('signupMobile') + ' phone-num'}
                  placeholder={mobileLen + ' digit number'} maxLength={mobileLen}
                  value={mobile} onChange={(e) => { setMobile(e.target.value.replace(/[^0-9]/g, '')); setBadField(null); }} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Department <span className="req">*</span></label>
              <select ref={bind('signupDepartment')} className={cls('signupDepartment')}
                value={department} onChange={(e) => { setDepartment(e.target.value); setBadField(null); }}>
                <option value="">-- Select Department --</option>
                {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Password <span className="req">*</span></label>
              <PasswordInput value={signupPass} onChange={(v) => { setSignupPass(v); setBadField(null); }}
                placeholder="Create password" className={badField === 'signupPass' ? 'field-error' : ''} autoComplete="new-password" />
              <div className="password-hint">Minimum 8 characters · Alphanumeric with special character &amp; one uppercase letter</div>
            </div>
            <div className="form-group">
              <label className="form-label">Confirm Password <span className="req">*</span></label>
              <PasswordInput value={signupPass2} onChange={(v) => { setSignupPass2(v); setBadField(null); }}
                placeholder="Confirm password" className={badField === 'signupPass2' ? 'field-error' : ''} autoComplete="new-password" />
            </div>
            <button className="btn btn-primary btn-block" onClick={doSignUp} disabled={busy}>
              {busy ? 'Creating account…' : 'Create Account'}
            </button>

            <div className="auth-divider">or</div>
            <GoogleButton onClick={doGoogleSignIn} disabled={busy} label="Sign up with Google" />

            <div className="auth-switch">Already have an account? <a onClick={() => switchAuthMode('signin')}>Sign In</a></div>
          </div>
        )}

        {/* ADMIN */}
        {mode === 'admin' && (
          <div>
            <div className="form-group">
              <label className="form-label">Admin User ID</label>
              <input type="text" className="form-input" placeholder="Admin"
                value={adminUser} onChange={(e) => setAdminUser(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Admin Password</label>
              <div onKeyDown={onEnter(doAdminSignIn)}>
                <PasswordInput value={adminPassInput} onChange={setAdminPassInput} placeholder="Enter admin password" autoComplete="current-password" />
              </div>
            </div>
            <button className="btn btn-primary btn-block" onClick={doAdminSignIn} disabled={busy}>
              {busy ? 'Signing in…' : 'Sign In as Admin'}
            </button>
          </div>
        )}

        {/* Load Backup — available in every auth mode */}
        <div style={{ textAlign: 'center', marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>First time on this device? Load your data.</div>
          <button
            type="button" className="btn btn-secondary" style={{ fontSize: 12, padding: '6px 12px' }}
            onClick={() => backupFileRef.current && backupFileRef.current.click()}
          >
            📂 Load Backup File
          </button>
          <input
            ref={backupFileRef} type="file" accept=".json,application/json" style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files && e.target.files[0];
              e.target.value = '';
              if (f) onLoadBackup(f);
            }}
          />
        </div>
      </div>
    </div>
  );
}
