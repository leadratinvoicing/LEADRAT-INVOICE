import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import Store from './store';
import {
  AUDIT_LIMIT, DEFAULT_ADMIN_PASS, DEFAULT_COMPANY, DEFAULT_DEPT_PERMISSIONS, DEFAULT_NUMBERING,
  IDLE_RESYNC_MS
} from './constants';
import { buildSeedRoles, deepClone, resolveUserSession } from './utils';

const AppContext = createContext(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}

const SESSION_KEY = 'leadrat:currentUser';
const ACTIVITY_KEY = 'leadrat:lastActivity';

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
  // Admin-defined roles. Each carries a permission set and a default data scope.
  const [roles, setRoles] = useState([]);
  // Append-only trail of reconciliation events (proforma conversions today).
  const [audit, setAudit] = useState([]);
  const [adminPass, setAdminPass] = useState(DEFAULT_ADMIN_PASS);
  const [currentUser, setCurrentUser] = useState(null);
  const [toasts, setToasts] = useState([]);

  // Mirror of the latest state so async handlers never read a stale closure —
  // this replaces the mutable `APP` object the original script relied on.
  const ref = useRef({});
  ref.current = { users, invoices, clients, company, numbering, deptPermissions, roles, audit, adminPass, currentUser };

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
  /**
   * Write a collection and keep the screen honest about whether it landed.
   *
   * The list is shown immediately so the app stays responsive, but if the write
   * is rejected — offline, permission denied, unauthorised domain — the previous
   * data is put back and the error is raised. Showing a saved-looking screen for
   * data that only reached this browser is how work quietly goes missing.
   */
  const persist = useCallback(async (key, list, setter) => {
    const previous = ref.current[key];
    setter(list);
    ref.current[key] = list;
    try {
      await Store.set(key, list);
    } catch (e) {
      setter(previous);
      ref.current[key] = previous;
      showToast('Could not save to the shared database — your change was NOT stored. '
        + (e && e.message ? e.message : e), 'error');
      throw e;
    }
  }, [showToast]);

  const saveUsers = useCallback((list) => persist('users', list, setUsers), [persist]);
  const saveInvoices = useCallback((list) => persist('invoices', list, setInvoices), [persist]);
  const saveClients = useCallback((list) => persist('clients', list, setClients), [persist]);

  /* ---------------- READ-MODIFY-WRITE ----------------
     Each collection lives in ONE document holding the whole array, so a save
     replaces everything. Building that array from a copy loaded at page load
     therefore deletes whatever anyone else added since. These helpers re-read
     the current data immediately before applying the change, so a delete or an
     edit can never take someone else's work with it. */
  const mutate = useCallback(async (key, setter, apply) => {
    let latest = ref.current[key];
    try {
      const fresh = await Store.get(key, [], { bypassCache: true });
      if (Array.isArray(fresh)) latest = fresh;
    } catch (e) {
      // Could not confirm the latest state — refuse rather than overwrite blind.
      showToast('Cannot reach the shared database — change not saved, please retry.', 'error');
      throw e;
    }
    return persist(key, apply(latest), setter);
  }, [persist, showToast]);

  const updateInvoices = useCallback((apply) => mutate('invoices', setInvoices, apply), [mutate]);
  const updateClients = useCallback((apply) => mutate('clients', setClients, apply), [mutate]);
  const updateUsers = useCallback((apply) => mutate('users', setUsers, apply), [mutate]);

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

  const saveRoles = useCallback(async (list) => {
    setRoles(list);
    ref.current.roles = list;
    await Store.set('roles', list);
  }, []);

  /**
   * Append one event to the audit trail. Capped so the document can never
   * grow unbounded — the newest entries are the ones anyone looks at.
   */
  const appendAudit = useCallback(async (entry) => {
    const who = ref.current.currentUser || {};
    const row = {
      id: Math.random().toString(36).slice(2) + Date.now().toString(36),
      at: new Date().toISOString(),
      by: who.name || who.email || 'Admin',
      byEmail: who.email || '',
      ...entry
    };
    // The trail lives in one document, so appending from a stale copy would
    // erase whatever colleagues logged meanwhile. Read the current list first.
    let existing = ref.current.audit || [];
    try {
      const fresh = await Store.get('audit', [], { bypassCache: true });
      if (Array.isArray(fresh)) existing = fresh;
    } catch { /* keep what we have rather than lose the entry entirely */ }

    const next = [row, ...existing].slice(0, AUDIT_LIMIT);
    setAudit(next);
    ref.current.audit = next;
    // A failed audit write must never block the action it was recording.
    try { await Store.set('audit', next); } catch (e) { console.warn('[audit] save failed', e); }
    return row;
  }, []);

  /** Fire-and-forget logging: never let the trail hold up or break the work. */
  const logActivity = useCallback((action, details) => {
    Promise.resolve(appendAudit({ action, details: details || {} }))
      .catch((e) => console.warn('[audit] not recorded', e));
  }, [appendAudit]);

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
        roles: s.roles || [],
        audit: s.audit || [],
        adminPass: s.adminPass || DEFAULT_ADMIN_PASS
      }
    };
  }, []);

  const restoreBackup = useCallback(async (payloadData) => {
    const d = payloadData;
    const nextInvoices = Array.isArray(d.invoices) ? d.invoices : [];
    const nextClients = Array.isArray(d.clients) ? d.clients : [];
    const nextUsers = Array.isArray(d.users) ? d.users : [];
    const nextNumbering = d.numbering && typeof d.numbering === 'object'
      ? { ...DEFAULT_NUMBERING, ...d.numbering }
      : ref.current.numbering;
    const nextCompany = d.company && typeof d.company === 'object' ? d.company : ref.current.company;
    const nextPerms = d.deptPermissions && typeof d.deptPermissions === 'object' ? d.deptPermissions : ref.current.deptPermissions;
    const nextRoles = Array.isArray(d.roles) ? d.roles : ref.current.roles;
    const nextAudit = Array.isArray(d.audit) ? d.audit : ref.current.audit;
    const nextAdminPass = d.adminPass || ref.current.adminPass;

    setInvoices(nextInvoices); ref.current.invoices = nextInvoices;
    setClients(nextClients); ref.current.clients = nextClients;
    setUsers(nextUsers); ref.current.users = nextUsers;
    setNumbering(nextNumbering); ref.current.numbering = nextNumbering;
    setCompany(nextCompany); ref.current.company = nextCompany;
    setDeptPermissions(nextPerms); ref.current.deptPermissions = nextPerms;
    setRoles(nextRoles); ref.current.roles = nextRoles;
    setAudit(nextAudit); ref.current.audit = nextAudit;
    setAdminPass(nextAdminPass); ref.current.adminPass = nextAdminPass;

    await Promise.all([
      Store.set('invoices', nextInvoices),
      Store.set('clients', nextClients),
      Store.set('users', nextUsers),
      Store.set('numbering', nextNumbering),
      Store.set('company', nextCompany),
      Store.set('deptPermissions', nextPerms),
      Store.set('roles', nextRoles),
      Store.set('audit', nextAudit),
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

  /**
   * Invoices straight from the server, or an exception. Used where a stale
   * answer would be worse than no answer — deciding whether a document number
   * is already taken, above all.
   */
  const fetchFreshInvoices = useCallback(async () => {
    const latest = await Store.getFresh('invoices', []);
    const list = Array.isArray(latest) ? latest : [];
    setInvoices(list);
    ref.current.invoices = list;
    return list;
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

  const reloadRoles = useCallback(async () => {
    try {
      const latest = await Store.get('roles', [], { bypassCache: true });
      if (Array.isArray(latest)) { setRoles(latest); ref.current.roles = latest; return latest; }
    } catch (e) { console.warn('[reload] roles failed', e); }
    return ref.current.roles;
  }, []);

  /**
   * Re-read every shared collection from the server. Used after a long idle
   * gap and at sign-in, so a tab that has been sitting open — or one whose
   * live listener was dropped by the browser while backgrounded — starts from
   * the real data rather than whatever it happened to remember.
   */
  const resyncAll = useCallback(async () => {
    const keys = [
      ['invoices', setInvoices, []], ['clients', setClients, []], ['users', setUsers, []],
      ['roles', setRoles, []], ['numbering', setNumbering, null], ['company', setCompany, null],
      ['audit', setAudit, []]
    ];
    let ok = 0;
    for (const [key, setter, fallback] of keys) {
      try {
        const value = await Store.get(key, fallback, { bypassCache: true });
        if (value === null || value === undefined) continue;
        setter(value);
        ref.current[key] = value;
        ok += 1;
      } catch (e) {
        console.warn('[resync] ' + key + ' failed', e);
      }
    }
    return ok;
  }, []);

  /* ---------------- SESSION ---------------- */
  /**
   * A stored profile becomes a session user only after its role is resolved:
   * the permission set and data scope in force are stamped on, so every
   * downstream check reads a single, already-resolved object.
   */
  const enterApp = useCallback((user) => {
    const resolved = resolveUserSession(user, ref.current.roles);
    setCurrentUser(resolved);
    ref.current.currentUser = resolved;
    writeSession(resolved);
    // A sign-in is both an audit event and the moment to pull fresh data.
    const previous = ref.current.currentUser;
    if (!previous || previous.email !== resolved.email) {
      Promise.resolve(appendAudit({ action: 'login', details: { email: resolved.email || 'Admin', role: resolved.role } }))
        .catch(() => {});
      resyncIfStale('login').catch(() => {});
    }
  }, []);

  const clearSession = useCallback(() => {
    setCurrentUser(null);
    ref.current.currentUser = null;
    writeSession(null);
  }, []);

  /** Re-apply role changes to the live session without a sign-out. */
  const refreshSessionUser = useCallback(() => {
    const u = ref.current.currentUser;
    if (!u || u.role === 'admin') return;
    const profile = ref.current.users.find((x) => x.email === u.email) || u;
    const resolved = resolveUserSession(profile, ref.current.roles);
    setCurrentUser(resolved);
    ref.current.currentUser = resolved;
    writeSession(resolved);
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
    if (page === 'audit') return false;
    const perms = u.permissions || {};
    const mod = perms[page];
    if (!mod) return false;
    if (action) return !!mod[action];
    return !!mod.view;
  }, []);

  /* ---------------- BOOT ---------------- */
  const loadAll = useCallback(async () => {
    const [u, ap, inv, cl, savedCompany, savedNumbering, savedDeptPerms, savedRoles, savedAudit] = await Promise.all([
      Store.get('users', []),
      Store.get('adminPass', DEFAULT_ADMIN_PASS),
      Store.get('invoices', []),
      Store.get('clients', []),
      Store.get('company', null),
      Store.get('numbering', null),
      Store.get('deptPermissions', null),
      Store.get('roles', null),
      Store.get('audit', [])
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
      // Abu Dhabi bills as the same UAE entity, so an install that predates it
      // inherits whatever Dubai is currently set to rather than the factory text.
      if (!merged.abudhabi) merged.abudhabi = { ...(merged.dubai || DEFAULT_COMPANY.abudhabi) };
      setCompany(merged);
      ref.current.company = merged;
    }

    let numberingToUse = DEFAULT_NUMBERING;
    if (savedNumbering) {
      // Spread the defaults first so installs that predate the padding/suffix
      // format settings pick them up without losing their own prefixes.
      numberingToUse = { ...DEFAULT_NUMBERING, ...savedNumbering };
      // Bengaluru invoices use the DSLK prefix; the proforma prefix stays DSL/…/PI-.
      if (numberingToUse.invPrefixBlu === 'DSL/26-27/') numberingToUse.invPrefixBlu = 'DSLK/26-27/';
      // Fill in the Dubai series if this install predates Dubai support.
      if (!numberingToUse.invPrefixDbx) numberingToUse.invPrefixDbx = DEFAULT_NUMBERING.invPrefixDbx;
      if (!numberingToUse.nextInvDbx) numberingToUse.nextInvDbx = DEFAULT_NUMBERING.nextInvDbx;
      // Dubai proformas used to share the India PI series. Give them their own,
      // derived from the install's India prefix so the two stay recognisable.
      if (!numberingToUse.proPrefixDbx) {
        const indiaPro = numberingToUse.proPrefix || DEFAULT_NUMBERING.proPrefix;
        // "DSL/26-27/PI-" → "DSL/26-27/DB-PI-"
        numberingToUse.proPrefixDbx = indiaPro.includes('/')
          ? indiaPro.replace(/([^/]*)$/, 'DB-$1')
          : 'DB-' + indiaPro;
      }
      if (!numberingToUse.nextProDbx) numberingToUse.nextProDbx = DEFAULT_NUMBERING.nextProDbx;
      await Store.set('numbering', numberingToUse);
    }
    setNumbering(numberingToUse); ref.current.numbering = numberingToUse;

    const dp = savedDeptPerms || deepClone(DEFAULT_DEPT_PERMISSIONS);
    setDeptPermissions(dp); ref.current.deptPermissions = dp;

    // First run on an install that predates roles: lay down the starter set so
    // the Roles panel opens with something to work from rather than empty.
    let rolesToUse = Array.isArray(savedRoles) ? savedRoles : null;
    if (!rolesToUse || rolesToUse.length === 0) {
      rolesToUse = buildSeedRoles();
      try { await Store.set('roles', rolesToUse); } catch (e) { console.warn('[init] role seeding failed', e); }
    }

    // One-off rename of a seeded role. Only applies while it still carries the
    // exact name it was seeded with, so a role an admin has already renamed is
    // never overwritten. Harmless to re-run: the guard stops matching after it.
    const RENAMED_SEEDS = [{ id: 'role_sales_rep', was: 'Sales Executive', now: 'Sales Manager' }];
    const needsRename = rolesToUse.some((r) => RENAMED_SEEDS.some((x) => r.id === x.id && r.name === x.was));
    if (needsRename) {
      rolesToUse = rolesToUse.map((r) => {
        const hit = RENAMED_SEEDS.find((x) => r.id === x.id && r.name === x.was);
        return hit ? { ...r, name: hit.now } : r;
      });
      try { await Store.set('roles', rolesToUse); } catch (e) { console.warn('[init] role rename failed', e); }
    }
    setRoles(rolesToUse); ref.current.roles = rolesToUse;

    const auditToUse = Array.isArray(savedAudit) ? savedAudit : [];
    setAudit(auditToUse); ref.current.audit = auditToUse;

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

  /* ---------------- LIVE UPDATES ----------------
     Without this a tab only ever knows the data it loaded at start-up, so it
     shows stale lists and — because every save rewrites a whole collection —
     risks overwriting whatever colleagues have added since. Subscribing keeps
     every open tab current within a second of anyone else's change. */
  useEffect(() => {
    if (!booted) return undefined;
    const feeds = [
      ['invoices', setInvoices],
      ['clients', setClients],
      ['users', setUsers],
      ['roles', setRoles],
      ['numbering', setNumbering],
      ['company', setCompany]
    ];
    const stops = feeds.map(([key, setter]) => Store.subscribe(key, (value) => {
      setter(value);
      ref.current[key] = value;
    }));
    return () => { for (const stop of stops) { try { stop(); } catch { /* already gone */ } } };
  }, [booted]);

  /* ---------------- IDLE RESYNC ----------------
     A tab left open overnight may have missed changes: browsers suspend
     background sockets, and a dropped listener reconnects without replaying
     what it missed. So the moment someone comes back after a long gap — and
     again at sign-in — everything is re-read from the server before they act
     on it. The timestamp lives in localStorage so it survives a reload and is
     shared across this browser’s tabs. */
  const resyncingRef = useRef(false);

  const touchActivity = useCallback(() => {
    try { localStorage.setItem(ACTIVITY_KEY, String(Date.now())); } catch { /* private mode */ }
  }, []);

  const resyncIfStale = useCallback(async (reason) => {
    if (resyncingRef.current) return false;
    let last = 0;
    try { last = parseInt(localStorage.getItem(ACTIVITY_KEY), 10) || 0; } catch { last = 0; }
    const gap = Date.now() - last;
    if (last && gap < IDLE_RESYNC_MS && reason !== 'login') { touchActivity(); return false; }

    resyncingRef.current = true;
    try {
      const n = await resyncAll();
      if (reason !== 'login' && last) {
        const hours = Math.round(gap / 3600000);
        showToast('Away for ' + (hours >= 1 ? hours + 'h' : 'a while')
          + ' — refreshed ' + n + ' data sets so you are working on the latest.', 'warn');
      }
      return true;
    } finally {
      resyncingRef.current = false;
      touchActivity();
    }
  }, [resyncAll, showToast, touchActivity]);

  useEffect(() => {
    if (!booted || !currentUser) return undefined;
    // Coming back to the tab is the strongest signal someone has returned.
    const onVisible = () => { if (!document.hidden) resyncIfStale('return'); };
    const onFocus = () => resyncIfStale('return');
    const onActivity = () => {
      // Cheap path: only the timestamp moves unless the gap is long.
      resyncIfStale('activity');
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    for (const ev of ['click', 'keydown']) window.addEventListener(ev, onActivity, { passive: true });
    // Also check on a timer, for a tab left open and untouched.
    const timer = setInterval(() => { if (!document.hidden) resyncIfStale('timer'); }, 5 * 60 * 1000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      for (const ev of ['click', 'keydown']) window.removeEventListener(ev, onActivity);
      clearInterval(timer);
    };
  }, [booted, currentUser, resyncIfStale]);

  const value = {
    booted, storageHealthy, bannerDismissed, setBannerDismissed,
    users, invoices, clients, company, numbering, deptPermissions, roles, audit, adminPass, currentUser,
    setUsers, setInvoices, setClients, setCurrentUser,
    saveUsers, saveInvoices, saveClients, saveNumbering, saveDeptPermissions, saveRoles, saveAdminPass, saveCompany,
    updateInvoices, updateClients, updateUsers,
    reloadUsers, reloadInvoices, reloadClients, reloadRoles, fetchFreshInvoices,
    buildBackupPayload, restoreBackup,
    enterApp, clearSession, signupInProgress,
    getDefaultPermissionsForDept, userCanAccess, refreshSessionUser,
    logActivity, appendAudit, resyncAll, resyncIfStale, touchActivity,
    toasts, showToast,
    stateRef: ref
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
