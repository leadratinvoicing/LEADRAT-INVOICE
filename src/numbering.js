import { NUMBER_SERIES } from './constants';
import { formatDocNumber, pad, seriesConfig, seriesKeyFor } from './utils';

/* ============================================================
   DOCUMENT NUMBERING
   Two rules govern every suggestion and every counter update:

     1. A suggested number is never one that already exists. The scan walks
        UP from the series counter, stepping over anything in use, so a number
        taken manually (say by a convert-with-custom-number) is skipped rather
        than colliding.
     2. A counter never goes backwards. Using a number below the counter — to
        match a physical book, for instance — leaves the counter where it is.
        Winding it back is an explicit action in Settings → Numbering.
   ============================================================ */

/** Guard against a pathological data set spinning the scan forever. */
const MAX_SCAN = 100000;

/** Every invoice number currently in use, lower-cased for comparison. */
function usedNumberSet(invoices, excludeId) {
  const set = new Set();
  for (const d of invoices || []) {
    if (excludeId && d.id === excludeId) continue;
    const no = String(d.invoiceNo || '').trim().toLowerCase();
    if (no) set.add(no);
  }
  return set;
}

/**
 * The first free sequence number at or after `startFrom` for a series.
 *
 * Returns `{ counter, number }` — the sequence integer and the formatted
 * document number — so callers can show one and store the other.
 */
export function nextFreeNumber(numbering, invoices, seriesKey, startFrom) {
  const cfg = seriesConfig(numbering, seriesKey);
  const used = usedNumberSet(invoices);
  let counter = Math.max(1, parseInt(startFrom, 10) || cfg.next || 1);
  for (let i = 0; i < MAX_SCAN; i++) {
    const candidate = cfg.prefix + pad(counter, cfg.pad) + cfg.suffix;
    if (!used.has(candidate.trim().toLowerCase())) return { counter, number: candidate };
    counter += 1;
  }
  // Unreachable in practice; fail loud rather than hand back a duplicate.
  throw new Error('Could not find a free number in series ' + seriesKey);
}

/** The next free number for a document type + branch, as a formatted string. */
export function suggestDocNumber(numbering, invoices, docType, branch) {
  return nextFreeNumber(numbering, invoices, seriesKeyFor(docType, branch)).number;
}

/**
 * The document already using this number, or null. Comparison ignores case and
 * surrounding whitespace, because "dslm/26-27/047" and "DSLM/26-27/047 " are
 * the same number to everyone except a string compare.
 */
export function findDuplicateNumber(invoices, invoiceNo, excludeId) {
  const key = String(invoiceNo || '').trim().toLowerCase();
  if (!key) return null;
  return (invoices || []).find(
    (d) => d.id !== excludeId && String(d.invoiceNo || '').trim().toLowerCase() === key
  ) || null;
}

/** The trailing sequence number of a document number within its series. */
export function sequenceOf(invoiceNo, prefix) {
  const inv = String(invoiceNo || '').trim();
  if (prefix && inv.toLowerCase().startsWith(String(prefix).toLowerCase())) {
    const m = inv.substring(prefix.length).match(/^(\d+)/);
    if (m) return parseInt(m[1], 10);
  }
  // Outside the configured series — fall back to the last run of digits.
  const any = inv.match(/(\d+)(?!.*\d)/);
  return any ? parseInt(any[1], 10) : null;
}

/**
 * Move a series counter past a number that has just been used.
 *
 * Only ever moves forward: a number at or above the counter pushes it to
 * `seq + 1`, and anything below leaves it untouched. Returns the same object
 * when nothing changed, so callers can skip a pointless write.
 */
export function advanceCounter(numbering, invoiceNo, docType, branch) {
  const key = seriesKeyFor(docType, branch);
  const cfg = seriesConfig(numbering, key);
  const seq = sequenceOf(invoiceNo, cfg.prefix);
  if (seq === null) return numbering;
  // A hand-typed number outside this series must not drive its counter.
  const inSeries = String(invoiceNo || '').trim().toLowerCase()
    .startsWith(String(cfg.prefix || '').toLowerCase());
  if (!inSeries) return numbering;
  if (seq < cfg.next) return numbering;
  return { ...numbering, [cfg.def.nextKey]: seq + 1 };
}

/**
 * Re-point every series counter past whatever is now stored. Used after a save
 * so the next suggestion starts from a sensible place; never rewinds a counter.
 */
export function syncCounters(numbering, invoices) {
  let next = numbering;
  for (const s of NUMBER_SERIES) {
    const cfg = seriesConfig(next, s.key);
    let highest = cfg.next - 1;
    for (const d of invoices || []) {
      const seq = sequenceOf(d.invoiceNo, cfg.prefix);
      if (seq === null) continue;
      if (!String(d.invoiceNo || '').trim().toLowerCase()
        .startsWith(String(cfg.prefix || '').toLowerCase())) continue;
      if (seq > highest) highest = seq;
    }
    if (highest + 1 > cfg.next) next = { ...next, [s.nextKey]: highest + 1 };
  }
  return next;
}

/** Does this number follow the configured shape for its series? */
export function matchesSeriesFormat(numbering, invoiceNo, docType, branch) {
  const cfg = seriesConfig(numbering, seriesKeyFor(docType, branch));
  const inv = String(invoiceNo || '').trim();
  if (!inv.toLowerCase().startsWith(String(cfg.prefix || '').toLowerCase())) return false;
  const rest = inv.substring(cfg.prefix.length);
  const expected = new RegExp('^\\d+' + (cfg.suffix ? cfg.suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '') + '$');
  return expected.test(rest);
}

/** A human description of the expected shape, for the format warning. */
export function seriesFormatHint(numbering, docType, branch) {
  const cfg = seriesConfig(numbering, seriesKeyFor(docType, branch));
  return cfg.prefix + 'n'.repeat(cfg.pad) + cfg.suffix;
}

/** Also export the formatter so callers need only this module. */
export { formatDocNumber };
