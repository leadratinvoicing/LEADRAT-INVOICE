import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

/* ============================================================
   DATA STORAGE
   Primary: Cloud Firestore (multi-device, shared across all logins)
   Fallback: localStorage (so the app still works offline / before rules
   are configured) → in-memory only as a last resort.

   Same get(key, default, {bypassCache}) / set(key, value) contract the
   original HTML build used, so every caller behaves identically.
   ============================================================ */

const COLLECTION = 'app_storage';
const LS_PREFIX = 'leadrat:';

let cache = {};

function lsGet(key) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function lsSet(key, value) {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
  } catch {
    /* quota or private mode — in-memory cache still holds it */
  }
}

export async function get(key, defaultVal, opts) {
  opts = opts || {};
  if (!opts.bypassCache && cache[key] !== undefined) return cache[key];

  try {
    const snap = await getDoc(doc(db, COLLECTION, key));
    if (snap.exists()) {
      const value = snap.data().value;
      if (value !== undefined && value !== null) {
        cache[key] = value;
        lsSet(key, value);
        return value;
      }
    }
    // Document genuinely absent — fall through to the default.
    if (!opts.bypassCache && cache[key] === undefined) cache[key] = defaultVal;
    return opts.bypassCache ? defaultVal : cache[key];
  } catch (e) {
    console.warn('[Store] Firestore get failed for "' + key + '":', e && e.message ? e.message : e);
  }

  const local = lsGet(key);
  if (local !== undefined) {
    cache[key] = local;
    return local;
  }
  if (opts.bypassCache) return defaultVal;
  if (cache[key] === undefined) cache[key] = defaultVal;
  return cache[key];
}

export async function set(key, value) {
  cache[key] = value;
  lsSet(key, value);
  try {
    await setDoc(doc(db, COLLECTION, key), { value, updated_at: new Date().toISOString() });
    return { key, value };
  } catch (e) {
    console.error('[Store] Firestore set FAILED for "' + key + '":', e && e.message ? e.message : e);
    throw e;
  }
}

export function clearCache() {
  cache = {};
}

const Store = { get, set, clearCache };
export default Store;
