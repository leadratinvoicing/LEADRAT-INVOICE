import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import Store from './store';
import {
  DEFAULT_ADMIN_PASS, DEFAULT_COMPANY, DEFAULT_DEPT_PERMISSIONS, DEFAULT_NUMBERING
} from './constants';
import { deepClone } from './utils';

const AppContext = createContext(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}

const SESSION_KEY = 'leadrat:currentUser';

function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSession(user) {
  try {
    if (user) localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function AppProvider({ children }) {
  const [booted, setBooted] = useState(false);
  const [storageHealthy, setStorageHealthy] = useState(true);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const [users, setUsers] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [clients, setClients] = useState([]);
  const [company, setCompany] = useState(DEFAULT_COMPANY);
  const [numbering, setNumbering] = useState(DEFAULT_NUMBERING);
  const [deptPermissions, setDeptPermissions] = useState(() => deepClone(DEFAULT_DEPT_PERMISSIONS));
  const [adminPass, setAdminPass] = useState(DEFAULT_ADMIN_PASS);
  const [currentUser, setCurrentUser] = useState(null);
  const [toasts, setToasts] = useState([]);

  // Mirror of the latest state so async handlers never read a stale closure —
  // this replaces the mutable `APP` object the original script relied on.
  const ref = useRef({});
  ref.current = { users, invoices, clients, company, numbering, deptPermissions, adminPass, currentUser };

  // Set while a signup is mid-flight so the auth observer doesn't briefly log the
  // brand-new account in before we sign it back out.
  const signupInProgress = useRef(false);

  /* ---------------- TOASTS ---------------- */
  const showToast = useCallback((msg, type) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);

  /* ---------------- PERSISTENCE HELPERS ---------------- */
  const saveUsers = useCallback(async (list) => {
    setUsers(list);
    ref.current.users = list;
    await Store.set('users', list);
  }, []);

  const saveInvoices = useCallback(async (list) => {
    setInvoices(list);
    ref.current.invoices = list;
    await Store.set('invoices', list);
  }, []);

  const saveClients = useCallback(async (list) => {
    setClients(list);
    ref.current.clients = list;
    await Store.set('clients', list);
  }, []);

  const saveNumbering = useCallback(async (n) => {
    setNumbering(n);
    ref.current.numbering = n;
    await Store.set('numbering', n);
  }, []);

  const saveDeptPermissions = useCallback(async (p) => {
    setDeptPermissions(p);
    ref.current.deptPermissions = p;
    await Store.set('deptPermissions', p);
  }, []);

  const saveAdminPass = useCallback(async (p) => {
    setAdminPass(p);
    ref.current.adminPass = p;
    await Store.set('adminPass', p);
  }, []);

  const saveCompany = useCallback(async (c) => {
    setCompany(c);
    ref.current.company = c;
    await Store.set('company', c);
  }, []);

  /* ---------------- BACKUP / RESTORE ----------------
     Portable JSON snapshot so a team can move the whole dataset between
     devices without a shared backend. */
  const buildBackupPayload = useCallback(() => {
    const s = ref.current;
    return {
      _format: 'leadrat-backup',
      _version: 1,
      _generatedAt: new Date().toISOString(),
      _generatedBy: (s.currentUser && s.currentUser.email) ? s.currentUser.email : 'Admin',
      _counts: {
        invoices: (s.invoices || []).length,
        clients: (s.clients || []).length,
        users: (s.users || []).length
      },
      data: {
        invoices: s.invoices || [],
        clients: s.clients || [],
        users: s.users || [],
        numbering: s.numbering || {},
        company: s.company || {},
        deptPermissions: s.deptPermissions || {},
        adminPass: s.adminPass || DEFAULT_ADMIN_PASS
      }
    };
  }, []);

  const restoreBackup = useCallback(async (payloadData) => {
    const d = payloadData;
    const nextInvoices = Array.isArray(d.invoices) ? d.invoices : [];
    const nextClients = Array.isArray(d.clients) ? d.clients : [];
    const nextUsers = Array.isArray(d.users) ? d.users : [];
    const nextNumbering = d.numbering && typeof d.numbering === 'object' ? d.numbering : ref.current.numbering;
    const nextCompany = d.company && typeof d.company === 'object' ? d.company : ref.current.company;
    const nextPerms = d.deptPermissions && typeof d.deptPermissions === 'object' ? d.deptPermissions : ref.current.deptPermissions;
    const nextAdminPass = d.adminPass || ref.current.adminPass;

    setInvoices(nextInvoices); ref.current.invoices = nextInvoices;
    setClients(nextClients); ref.current.clients = nextClients;
    setUsers(nextUsers); ref.current.users = nextUsers;
    setNumbering(nextNumbering); ref.current.numbering = nextNumbering;
    setCompany(nextCompany); ref.current.company = nextCompany;
    setDeptPermissions(nextPerms); ref.current.deptPermissions = nextPerms;
    setAdminPass(nextAdminPass); ref.current.adminPass = nextAdminPass;

    await Promise.all([
      Store.set('invoices', nextInvoices),
      Store.set('clients', nextClients),
      Store.set('users', nextUsers),
      Store.set('numbering', nextNumbering),
      Store.set('company', nextCompany),
      Store.set('deptPermissions', nextPerms),
      Store.set('adminPass', nextAdminPass)
    ]);

    return { invoices: nextInvoices.length, clients: nextClients.length, users: nextUsers.length };
  }, []);

  /* ---------------- FRESH READS (bypassCache) ---------------- */
  const reloadUsers = useCallback(async () => {
    try {
      const latest = await Store.get('users', [], { bypassCache: true });
      if (Array.isArray(latest)) { setUsers(latest); ref.current.users = latest; return latest; }
    } catch (e) { console.warn('[reload] users failed', e); }
    return ref.current.users;
  }, []);

  const reloadInvoices = useCallback(async () => {
    try {
      const latest = await Store.get('invoices', [], { bypassCache: true });
      if (Array.isArray(latest)) { setInvoices(latest); ref.current.invoices = latest; return latest; }
    } catch (e) { console.warn('[reload] invoices failed', e); }
    return ref.current.invoices;
  }, []);

  const reloadClients = useCallback(async () => {
    try {
      const latest = await Store.get('clients', [], { bypassCache: true });
      if (Array.isArray(latest)) { setClients(latest); ref.current.clients = latest; return latest; }
    } catch (e) { console.warn('[reload] clients failed', e); }
    return ref.current.clients;
  }, []);

  /* ---------------- SESSION ---------------- */
  const enterApp = useCallback((user) => {
    setCurrentUser(user);
    ref.current.currentUser = user;
    writeSession(user);
  }, []);

  const clearSession = useCallback(() => {
    setCurrentUser(null);
    ref.current.currentUser = null;
    writeSession(null);
  }, []);

  const getDefaultPermissionsForDept = useCallback((dept) => {
    const dp = ref.current.deptPermissions;
    const stored = (dp && dp[dept]) || DEFAULT_DEPT_PERMISSIONS[dept] || DEFAULT_DEPT_PERMISSIONS.Sales;
    return deepClone(stored);
  }, []);

  const userCanAccess = useCallback((page, action) => {
    const u = ref.current.currentUser;
    if (!u) return false;
    if (u.role === 'admin') return true;
    if (page === 'dashboard') return true;
    if (page === 'users') return false;
    const perms = u.permissions || {};
    const mod = perms[page];
    if (!mod) return false;
    if (action) return !!mod[action];
    return !!mod.view;
  }, []);

  /* ---------------- BOOT ---------------- */
  const loadAll = useCallback(async () => {
    const [u, ap, inv, cl, savedCompany, savedNumbering, savedDeptPerms] = await Promise.all([
      Store.get('users', []),
      Store.get('adminPass', DEFAULT_ADMIN_PASS),
      Store.get('invoices', []),
      Store.get('clients', []),
      Store.get('company', null),
      Store.get('numbering', null),
      Store.get('deptPermissions', null)
    ]);

    setUsers(u || []); ref.current.users = u || [];
    setAdminPass(ap || DEFAULT_ADMIN_PASS); ref.current.adminPass = ap || DEFAULT_ADMIN_PASS;
    setInvoices(inv || []); ref.current.invoices = inv || [];
    setClients(cl || []); ref.current.clients = cl || [];

    if (savedCompany) {
      // Fill in Dubai defaults for installs that predate Dubai support.
      const merged = { ...savedCompany };
      if (!merged.dubai) merged.dubai = DEFAULT_COMPANY.dubai;
      if (!merged.dubaiBank) merged.dubaiBank = DEFAULT_COMPANY.dubaiBank;
      setCompany(merged);
      ref.current.company = merged;
    }

    let numberingToUse = DEFAULT_NUMBERING;
    if (savedNumbering) {
      numberingToUse = { ...savedNumbering };
      // Bengaluru invoices use the DSLK prefix; the proforma prefix stays DSL/…/PI-.
      if (numberingToUse.invPrefixBlu === 'DSL/26-27/') numberingToUse.invPrefixBlu = 'DSLK/26-27/';
      // Fill in the Dubai series if this install predates Dubai support.
      if (!numberingToUse.invPrefixDbx) numberingToUse.invPrefixDbx = DEFAULT_NUMBERING.invPrefixDbx;
      if (!numberingToUse.nextInvDbx) numberingToUse.nextInvDbx = DEFAULT_NUMBERING.nextInvDbx;
      await Store.set('numbering', numberingToUse);
    }
    setNumbering(numberingToUse); ref.current.numbering = numberingToUse;

    const dp = savedDeptPerms || deepClone(DEFAULT_DEPT_PERMISSIONS);
    setDeptPermissions(dp); ref.current.deptPermissions = dp;

    console.log('[init] Loaded ' + (u || []).length + ' users, ' + (inv || []).length + ' invoices, ' + (cl || []).length + ' clients from storage.');
    return u || [];
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsub = () => {};

    (async () => {
      // ---- Storage health check (canary write + read-back) ----
      try {
        const canary = 'ping_' + Date.now();
        await Store.set('__leadrat_canary', canary);
        const r = await Store.get('__leadrat_canary', null, { bypassCache: true });
        if (r === canary) console.log('[init] ✓ Storage healthy. Backend: Cloud Firestore');
        else if (!cancelled) setStorageHealthy(false);
      } catch (e) {
        console.error('[init] ✗ Storage health check failed:', e && e.message ? e.message : e);
        if (!cancelled) setStorageHealthy(false);
      }

      const loadedUsers = await loadAll();
      if (cancelled) return;

      let settled = false;

      unsub = onAuthStateChanged(auth, (fbUser) => {
        if (cancelled || signupInProgress.current) return;

        // Read the session fresh each time — a stale capture would resurrect a
        // signed-out admin when Firebase reports the sign-out.
        const session = readSession();

        // The Admin tab is not a Firebase account — it signs in anonymously, so an
        // anonymous Firebase user means "restore the stored admin session".
        if (fbUser && fbUser.isAnonymous) {
          if (session && session.role === 'admin') enterApp(session);
          settled = true;
          setBooted(true);
          return;
        }

        if (fbUser) {
          const list = ref.current.users.length ? ref.current.users : loadedUsers;
          const profile = list.find((x) => x.email === fbUser.email);
          if (profile && (profile.status || 'active') !== 'suspended') {
            enterApp({ ...profile, role: profile.role || 'user' });
          } else if (!profile) {
            // Signed in with Firebase but no profile yet — the sign-in handler
            // creates it, so just wait rather than guessing here.
            if (!settled) clearSession();
          } else {
            clearSession();
          }
        } else if (session && session.role === 'admin') {
          // Anonymous sign-in may be disabled in the project; the admin session is
          // still valid locally.
          enterApp(session);
        } else {
          clearSession();
        }
        settled = true;
        setBooted(true);
      });

      // If Firebase never calls back (offline), don't hang on the boot screen.
      setTimeout(() => { if (!cancelled && !settled) setBooted(true); }, 4000);
    })();

    return () => { cancelled = true; unsub(); };
  }, [loadAll, enterApp, clearSession]);

  const value = {
    booted, storageHealthy, bannerDismissed, setBannerDismissed,
    users, invoices, clients, company, numbering, deptPermissions, adminPass, currentUser,
    setUsers, setInvoices, setClients, setCurrentUser,
    saveUsers, saveInvoices, saveClients, saveNumbering, saveDeptPermissions, saveAdminPass, saveCompany,
    reloadUsers, reloadInvoices, reloadClients,
    buildBackupPayload, restoreBackup,
    enterApp, clearSession, signupInProgress,
    getDefaultPermissionsForDept, userCanAccess,
    toasts, showToast,
    stateRef: ref
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
