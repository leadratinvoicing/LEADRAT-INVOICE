/* ============================================================
   UTILS — ported verbatim from the original HTML build
   ============================================================ */

import { DEFAULT_NUMBERING, NUMBER_SERIES } from './constants';

export function uid() {
  return 'id_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
}

export function pad(n, len) {
  return String(n).padStart(len, '0');
}

export function validatePassword(pw) {
  if (pw.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Z]/.test(pw)) return 'Password must contain at least one uppercase letter';
  if (!/[0-9]/.test(pw)) return 'Password must contain at least one number';
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pw)) return 'Password must contain at least one special character';
  return null;
}

export function fmtMoney(n) {
  if (n === null || n === undefined || isNaN(n)) return '0.00';
  return Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtMoneyR(n) {
  return '\u20B9 ' + fmtMoney(n);
}

/**
 * Currency-aware formatter \u2014 AED (Western grouping) for Dubai, \u20B9 (Indian
 * lakh/crore grouping) for India and the combined "all" view.
 */
export function fmtMoneyForRegion(n, region) {
  if (region === 'dubai') {
    if (n === null || n === undefined || isNaN(n)) return 'AED 0.00';
    return 'AED ' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return fmtMoneyR(n);
}

/** Dubai is its own region; Pune and Bengaluru are both "india". */
export function regionOf(branch) {
  return branch === 'dubai' ? 'dubai' : 'india';
}

export function branchLabel(branch) {
  if (branch === 'dubai') return '\uD83C\uDDE6\uD83C\uDDEA Dubai';
  if (branch === 'bengaluru') return '\uD83C\uDDEE\uD83C\uDDF3 Bengaluru';
  return '\uD83C\uDDEE\uD83C\uDDF3 Pune';
}

export function fmtDate(s) {
  if (!s) return '';
  // Accept YYYY-MM-DD or DD/MM/YYYY
  let d;
  if (s.includes('-') && s.length === 10) {
    const p = s.split('-');
    d = new Date(p[0], p[1] - 1, p[2]);
  } else if (s.includes('/')) {
    const p = s.split('/');
    d = new Date(p[2], p[1] - 1, p[0]);
  } else {
    d = new Date(s);
  }
  if (isNaN(d.getTime())) return s;
  return pad(d.getDate(), 2) + '/' + pad(d.getMonth() + 1, 2) + '/' + d.getFullYear();
}

/** Comparable timestamp for table sorting — null when unparseable. */
export function parseDateValue(s) {
  if (!s) return null;
  let d;
  if (typeof s === 'string' && s.includes('-') && s.length === 10) {
    const p = s.split('-');
    d = new Date(p[0], p[1] - 1, p[2]);
  } else if (typeof s === 'string' && s.includes('/')) {
    const p = s.split('/');
    d = new Date(p[2], p[1] - 1, p[0]);
  } else {
    d = new Date(s);
  }
  return isNaN(d.getTime()) ? null : d.getTime();
}

export function dateToInput(s) {
  if (!s) return '';
  if (s.includes('-') && s.length === 10) return s;
  if (s.includes('/')) {
    const p = s.split('/');
    return p[2] + '-' + pad(p[1], 2) + '-' + pad(p[0], 2);
  }
  return '';
}

export function numberToWords(num) {
  // Indian numbering with paisa
  if (num === null || num === undefined || isNaN(num)) return 'Zero Rupees And Zero Paisa Only';
  const rupees = Math.floor(num);
  const paisa = Math.round((num - rupees) * 100);
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  function below1000(n) {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + below1000(n % 100) : '');
  }
  function inWords(n) {
    if (n === 0) return 'Zero';
    let s = '';
    const cr = Math.floor(n / 10000000); n %= 10000000;
    const lk = Math.floor(n / 100000); n %= 100000;
    const th = Math.floor(n / 1000); n %= 1000;
    const hu = n;
    if (cr) s += below1000(cr) + ' Crore ';
    if (lk) s += below1000(lk) + ' Lakh ';
    if (th) s += below1000(th) + ' Thousand ';
    if (hu) s += below1000(hu);
    return s.trim();
  }
  return inWords(rupees) + ' Rupees And ' + (paisa ? inWords(paisa) + ' Paisa' : 'Zero Paisa') + ' Only.';
}

/** AED — Western numbering, "UAE Dirham" prefix, fils for the decimal part. */
export function aedToWords(num) {
  if (num === null || num === undefined || isNaN(num)) return 'UAE Dirham Zero Only.';
  const whole = Math.floor(num);
  const fils = Math.round((num - whole) * 100);
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  function below1000(n) {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + below1000(n % 100) : '');
  }
  function inWordsWestern(n) {
    if (n === 0) return 'Zero';
    let s = '';
    const bn = Math.floor(n / 1000000000); n %= 1000000000;
    const mn = Math.floor(n / 1000000); n %= 1000000;
    const th = Math.floor(n / 1000); n %= 1000;
    const hu = n;
    if (bn) s += below1000(bn) + ' Billion ';
    if (mn) s += below1000(mn) + ' Million ';
    if (th) s += below1000(th) + ' Thousand ';
    if (hu) s += below1000(hu);
    return s.trim();
  }
  let s = 'UAE Dirham ' + inWordsWestern(whole);
  if (fils) s += ' and ' + inWordsWestern(fils) + ' Fils';
  return s + ' Only.';
}

export function isValidEmail(e) {
  // RFC-style pragmatic email validation
  if (!e) return false;
  if (e.length > 254) return false;
  const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
  if (!re.test(e)) return false;
  if (/\.\./.test(e)) return false;
  const local = e.split('@')[0];
  if (local.startsWith('.') || local.endsWith('.')) return false;
  return true;
}

/**
 * Find the highest invoice number currently in storage that matches the given prefix,
 * extract its numeric suffix, and return that number + 1. Falls back to numbering counter.
 */
export function nextAvailableNumber(invoices, prefix, fallbackCounter) {
  let highest = (fallbackCounter || 1) - 1;
  for (const d of invoices || []) {
    const inv = (d.invoiceNo || '').trim();
    if (!inv.startsWith(prefix)) continue;
    const tail = inv.substring(prefix.length);
    const m = tail.match(/^(\d+)/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > highest) highest = n;
    }
  }
  return highest + 1;
}

/** Which of the four series a document belongs to (see NUMBER_SERIES). */
export function seriesKeyFor(docType, branch) {
  if (docType === 'proforma') return 'proforma';
  if (branch === 'dubai') return 'dubai';
  if (branch === 'bengaluru') return 'bengaluru';
  return 'pune';
}

/** The series definition plus its currently configured prefix/pad/suffix/counter. */
export function seriesConfig(numbering, seriesKey) {
  const n = numbering || {};
  const def = NUMBER_SERIES.find((s) => s.key === seriesKey) || NUMBER_SERIES[0];
  const fallback = DEFAULT_NUMBERING;
  const padRaw = parseInt(n[def.padKey], 10);
  return {
    def,
    prefix: n[def.prefixKey] || fallback[def.prefixKey],
    pad: isNaN(padRaw) ? (fallback[def.padKey] || 3) : Math.min(Math.max(padRaw, 1), 10),
    suffix: n[def.suffixKey] || '',
    next: parseInt(n[def.nextKey], 10) || fallback[def.nextKey] || 1
  };
}

/** Render one document number for a series: prefix + padded counter + suffix. */
export function formatDocNumber(numbering, seriesKey, seq) {
  const c = seriesConfig(numbering, seriesKey);
  return c.prefix + pad(seq, c.pad) + c.suffix;
}

/**
 * The next free number for a series — highest matching number already stored,
 * plus one, never below the stored counter.
 */
export function nextDocNumber(numbering, invoices, docType, branch) {
  const key = seriesKeyFor(docType, branch);
  const c = seriesConfig(numbering, key);
  return formatDocNumber(numbering, key, nextAvailableNumber(invoices, c.prefix, c.next));
}

export function formatExcelDate(v) {
  if (v instanceof Date) {
    return v.getFullYear() + '-' + pad(v.getMonth() + 1, 2) + '-' + pad(v.getDate(), 2);
  }
  if (typeof v === 'string') return v;
  return '';
}

export function deepClone(v) {
  return JSON.parse(JSON.stringify(v));
}
