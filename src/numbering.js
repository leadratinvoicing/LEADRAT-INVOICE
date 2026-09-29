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

/**
 * The sequence number a document carries WITHIN a given series, or null when it
 * does not belong to that series at all.
 *
 * Membership is strict: what follows the prefix must be digits and nothing but
 * the configured suffix. That strictness is the whole point — one series prefix
 * can be the opening of another ('DSL/26-27/DB-' starts 'DSL/26-27/DB-PI-'), and
 * a loose test lets every Dubai proforma also read as a Dubai tax invoice and
 * drag that counter along behind it.
 */
export function seriesSequence(invoiceNo, cfg) {
  const inv = String(invoiceNo || '').trim();
  const prefix = String((cfg && cfg.prefix) || '');
  if (!prefix || !inv.toLowerCase().startsWith(prefix.toLowerCase())) return null;
  const rest = inv.substring(prefix.length);
  const suffix = String((cfg && cfg.suffix) || '');
  if (suffix && !rest.toLowerCase().endsWith(suffix.toLowerCase())) return null;
  const body = suffix ? rest.substring(0, rest.length - suffix.length) : rest;
  if (!/^\d+$/.test(body)) return null;
  return parseInt(body, 10);
}

/**
 * The trailing sequence number of a document number within its series.
 *
 * A number that opens with the prefix but does not continue with digits belongs
 * to some other series that merely shares that opening, so it yields null rather
 * than falling back to "the last run of digits anywhere". That fallback is only
 * for numbers outside the prefix entirely.
 */
export function sequenceOf(invoiceNo, prefix) {
  const inv = String(invoiceNo || '').trim();
  if (prefix && inv.toLowerCase().startsWith(String(prefix).toLowerCase())) {
    const m = inv.substring(prefix.length).match(/^(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  }
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
  const cfg = seriesConfig(numbering, seriesKeyFor(docType, branch));
  const seq = seriesSequence(invoiceNo, cfg);
  // Outside this series — including a number under a longer prefix that merely
  // starts the same way — so it is not this counter's business.
  if (seq === null) return numbering;
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
      const seq = seriesSequence(d.invoiceNo, cfg);
      if (seq !== null && seq > highest) highest = seq;
    }
    if (highest + 1 > cfg.next) next = { ...next, [s.nextKey]: highest + 1 };
  }
  return next;
}

/** The highest sequence strictly inside a series, or 0 when it holds nothing. */
function highestInSeries(invoices, cfg) {
  let highest = 0;
  for (const d of invoices || []) {
    const seq = seriesSequence(d.invoiceNo, cfg);
    if (seq !== null && seq > highest) highest = seq;
  }
  return highest;
}

/**
 * Repair a counter that was dragged forward by an overlapping prefix.
 *
 * While membership was loose, 'DSL/26-27/DB-PI-394' also read as a
 * 'DSL/26-27/DB-' document, so the Dubai tax-invoice counter climbed with the
 * Dubai proforma series and the two ended up showing the same next number.
 * Rewinding a counter is otherwise refused, so this acts only where the overlap
 * genuinely accounts for the gap: the series has a sibling whose prefix extends
 * its own, its counter sits above everything strictly in the series, and no
 * higher than that sibling has reached. A counter set high by hand for any other
 * reason is left exactly where it is.
 */
export function repairOverlappedCounters(numbering, invoices) {
  let next = numbering;
  for (const s of NUMBER_SERIES) {
    const cfg = seriesConfig(next, s.key);
    const prefix = String(cfg.prefix || '');
    if (!prefix) continue;

    const siblings = NUMBER_SERIES
      .filter((o) => o.key !== s.key)
      .map((o) => seriesConfig(next, o.key))
      .filter((o) => {
        const op = String(o.prefix || '');
        return op.length > prefix.length && op.toLowerCase().startsWith(prefix.toLowerCase());
      });
    if (!siblings.length) continue;

    const strictNext = highestInSeries(invoices, cfg) + 1;
    if (cfg.next <= strictNext) continue;   // nothing was lost

    const siblingReach = Math.max(
      ...siblings.map((o) => Math.max(highestInSeries(invoices, o) + 1, o.next))
    );
    if (cfg.next > siblingReach) continue;  // pushed up by something else — leave it

    next = { ...next, [cfg.def.nextKey]: strictNext };
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
