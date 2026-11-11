import { doc, getDoc, onSnapshot, setDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';

/* ============================================================
   DATA STORAGE
   Primary: Cloud Firestore (multi-device, shared across all logins)
   Fallback: localStorage (so the app still works offline / before rules
   are configured) → in-memory only as a last resort.

   Same get(key, default, {bypassCache}) / set(key, value) contract the
   original HTML build used, so every caller behaves identically.

   LARGE COLLECTIONS
   Firestore caps one document at 1 MiB. Every key used to live in a single
   document holding the whole array, so once the invoice list passed 1 MiB
   every save was rejected. The keys in CHUNKED_KEYS (just the invoice list)
   are now stored in pieces:

     app_storage/{key}--chunked              → { rev, chunks, updated_at }  (manifest)
     app_storage/{key}--chunk-{rev}-0        → { data: '<JSON piece>' }
     app_storage/{key}--chunk-{rev}-1        → …

   - Pieces are never modified: each save writes a fresh set under a new rev,
     then switches the manifest to it and deletes the previous set in the same
     atomic batch. A reader therefore always sees one complete save; if it
     catches a switch mid-read it just reads again.
   - The original app_storage/{key} document is read only until the first
     save in the new format and is never written again. Browser tabs still
     running the previous version of the app keep reading that frozen copy,
     so they cannot mistake the new format for "no data" and overwrite the
     shared list with an empty one. (Their invoice saves fail on the 1 MiB
     limit exactly as before; reloading the page picks up this version.)
   All other keys keep the original single-document { value, updated_at } shape.
   ============================================================ */

const COLLECTION = 'app_storage';
const LS_PREFIX = 'leadrat:';

const CHUNKED_KEYS = new Set(['invoices']);

// UTF-8 bytes per piece — well under the 1 MiB document limit.
const MAX_PIECE_BYTES = 700000;
// One write request is capped at 10 MiB and 500 operations; stay well below.
const MAX_BATCH_BYTES = 7000000;
const MAX_BATCH_OPS = 400;
const READ_ATTEMPTS = 4;

let cache = {};
// Last chunked save confirmed by the server, per key: { rev, chunks, value }.
let chunked = {};
// This tab's chunked save that is still being committed, per key.
let pending = {};

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

const legacyRef = (key) => doc(db, COLLECTION, key);
const manifestRef = (key) => doc(db, COLLECTION, key + '--chunked');
const pieceRef = (key, rev, i) => doc(db, COLLECTION, key + '--chunk-' + rev + '-' + i);

function newRev() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Split a JSON string into pieces of at most MAX_PIECE_BYTES UTF-8 bytes,
 * never cutting a surrogate pair (emoji etc.) in half.
 */
export function splitJson(json) {
  const pieces = [];
  let start = 0;
  let bytes = 0;
  for (let i = 0; i < json.length;) {
    const c = json.charCodeAt(i);
    const units = c >= 0xd800 && c <= 0xdbff && i + 1 < json.length ? 2 : 1;
    const b = c < 0x80 ? 1 : c < 0x800 ? 2 : units === 2 ? 4 : 3;
    if (bytes + b > MAX_PIECE_BYTES && i > start) {
      pieces.push({ data: json.slice(start, i), bytes });
      start = i;
      bytes = 0;
    }
    bytes += b;
    i += units;
  }
  pieces.push({ data: json.slice(start), bytes });
  return pieces;
}

/**
 * Value described by a manifest, or null when its pieces are gone (a newer
 * save replaced them while we were reading) — the caller then reads again.
 */
async function decode(key, manifest) {
  if (!manifest || typeof manifest.rev !== 'string' || !(manifest.chunks >= 1)) {
    throw new Error('Invalid storage manifest for "' + key + '"');
  }
  for (const known of [pending[key], chunked[key]]) {
    if (known && known.rev === manifest.rev) return { value: known.value };
  }
  const snaps = await Promise.all(
    Array.from({ length: manifest.chunks }, (_, i) => getDoc(pieceRef(key, manifest.rev, i)))
  );
  const parts = [];
  for (const s of snaps) {
    const d = s.exists() ? s.data() : null;
    if (!d || typeof d.data !== 'string') return null;
    parts.push(d.data);
  }
  const value = JSON.parse(parts.join(''));
  chunked[key] = { rev: manifest.rev, chunks: manifest.chunks, value };
  return { value };
}

/** Read a key from Firestore. Resolves { exists, value }; throws if Firestore is unreachable. */
async function readRemote(key) {
  if (!CHUNKED_KEYS.has(key)) {
    const snap = await getDoc(legacyRef(key));
    return snap.exists() ? { exists: true, value: snap.data().value } : { exists: false };
  }
  for (let attempt = 0; attempt < READ_ATTEMPTS; attempt++) {
    const m = await getDoc(manifestRef(key));
    if (!m.exists()) {
      // Not yet saved in the new format — the original document still holds the data.
      const snap = await getDoc(legacyRef(key));
      return snap.exists() ? { exists: true, value: snap.data().value } : { exists: false };
    }
    const res = await decode(key, m.data());
    if (res) return { exists: true, value: res.value };
    await sleep(150 * (attempt + 1));
  }
  throw new Error('"' + key + '" kept changing while it was being read — please retry.');
}

async function writeChunked(key, value) {
  const json = JSON.stringify(value === undefined ? null : value);
  const pieces = splitJson(json);
  const rev = newRev();
  const entry = { rev, chunks: pieces.length, value };
  const prev = chunked[key];
  pending[key] = entry;
  try {
    let batch = writeBatch(db);
    let ops = 0;
    let bytes = 0;
    const flushIfFull = async (nextBytes, nextOps) => {
      if (ops > 0 && (bytes + nextBytes > MAX_BATCH_BYTES || ops + nextOps > MAX_BATCH_OPS)) {
        await batch.commit();
        batch = writeBatch(db);
        ops = 0;
        bytes = 0;
      }
    };
    for (let i = 0; i < pieces.length; i++) {
      await flushIfFull(pieces[i].bytes, 1);
      batch.set(pieceRef(key, rev, i), { data: pieces[i].data });
      ops += 1;
      bytes += pieces[i].bytes;
    }
    // The switch: manifest + removal of the set it replaces, in one batch.
    const stale = prev && prev.rev !== rev ? prev.chunks : 0;
    await flushIfFull(0, 1 + stale);
    batch.set(manifestRef(key), { rev, chunks: pieces.length, updated_at: new Date().toISOString() });
    for (let i = 0; i < stale; i++) batch.delete(pieceRef(key, prev.rev, i));
    await batch.commit();
    chunked[key] = entry;
  } finally {
    if (pending[key] === entry) delete pending[key];
  }
}

export async function get(key, defaultVal, opts) {
  opts = opts || {};
  if (!opts.bypassCache && cache[key] !== undefined) return cache[key];

  try {
    const res = await readRemote(key);
    if (res.exists && res.value !== undefined && res.value !== null) {
      cache[key] = res.value;
      lsSet(key, res.value);
      return res.value;
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
    if (CHUNKED_KEYS.has(key)) await writeChunked(key, value);
    else await setDoc(legacyRef(key), { value, updated_at: new Date().toISOString() });
    return { key, value };
  } catch (e) {
    console.error('[Store] Firestore set FAILED for "' + key + '":', e && e.message ? e.message : e);
    throw e;
  }
}

/**
 * A read that is either confirmed by the server or fails loudly.
 *
 * get() falls back to this browser's localStorage when Firestore is
 * unreachable, which is right for displaying data but wrong for deciding
 * whether a document number is free: a stale local copy would report a number
 * as unused and mint a duplicate. Anything that has to be CORRECT rather than
 * merely available must use this and handle the throw.
 */
export async function getFresh(key, defaultVal) {
  const res = await readRemote(key);
  if (!res.exists || res.value === undefined || res.value === null) return defaultVal;
  cache[key] = res.value;
  lsSet(key, res.value);
  return res.value;
}

/**
 * Watch one key and call back whenever it changes — including changes made by
 * other people in other browsers. Without this a tab only ever sees the data it
 * loaded at start-up, and would happily overwrite everything saved since.
 *
 * Returns an unsubscribe function. Errors are reported once and the listener
 * stops; the app keeps working from its last known data.
 */
export function subscribe(key, onValue, onError) {
  let stopped = false;
  let reported = false;
  const deliver = (value) => {
    if (stopped || value === undefined || value === null) return;
    cache[key] = value;
    lsSet(key, value);
    onValue(value);
  };
  const fail = (e) => {
    console.warn('[Store] live updates unavailable for "' + key + '":', e && e.message ? e.message : e);
    if (!reported && onError) { reported = true; onError(e); }
  };

  try {
    if (!CHUNKED_KEYS.has(key)) {
      const unsub = onSnapshot(legacyRef(key), (snap) => {
        if (snap.exists()) deliver(snap.data().value);
      }, fail);
      return () => { stopped = true; unsub(); };
    }

    // Chunked key: watch the manifest. Until the first save in the new format
    // there is none, so also follow the original document until one appears.
    let seq = 0;
    let manifestExists;
    let legacyValue;
    let stopLegacy = onSnapshot(legacyRef(key), (snap) => {
      if (!snap.exists()) return;
      legacyValue = snap.data().value;
      if (manifestExists === false) { seq++; deliver(legacyValue); }
    }, fail);
    const dropLegacy = () => { if (stopLegacy) { stopLegacy(); stopLegacy = null; } };

    const stopManifest = onSnapshot(manifestRef(key), async (snap) => {
      const mine = ++seq;
      if (!snap.exists()) {
        manifestExists = false;
        deliver(legacyValue);
        return;
      }
      manifestExists = true;
      dropLegacy();
      try {
        // null → the pieces were replaced mid-read; readRemote retries properly.
        const res = (await decode(key, snap.data())) || (await readRemote(key));
        if (mine !== seq) return; // a newer snapshot superseded this one
        if (res.exists !== false) deliver(res.value);
      } catch (e) {
        console.warn('[Store] could not load update for "' + key + '":', e && e.message ? e.message : e);
      }
    }, fail);

    return () => { stopped = true; dropLegacy(); stopManifest(); };
  } catch (e) {
    console.warn('[Store] could not subscribe to "' + key + '":', e && e.message ? e.message : e);
    return () => {};
  }
}

export function clearCache() {
  cache = {};
  chunked = {};
}

const Store = { get, getFresh, set, subscribe, clearCache };
export default Store;
