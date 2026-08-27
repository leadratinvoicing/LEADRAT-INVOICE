/* ============================================================
   UTILS — ported verbatim from the original HTML build
   ============================================================ */

import { BUILT_IN_ROLE_SEEDS, DEFAULT_DEPT_PERMISSIONS, DEFAULT_NUMBERING, NUMBER_SERIES } from './constants';

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

/* ============================================================
   BRANCH ACCESS
   A user's `branchAccess` field can be one of:
     'all'       → can see everything
     'india'     → pune + bengaluru only (i.e. everything except dubai)
     'pune'      → pune only
     'bengaluru' → bengaluru only
     'dubai'     → dubai only
   Admins always have full access, ignoring branchAccess.
   ============================================================ */

/** The branches a user may see, or null when they are unrestricted. */
export function allowedBranchesForUser(user) {
  if (!user || user.role === 'admin') return null; // null = no restriction
  const b = user.branchAccess || 'all';
  if (b === 'all') return null;
  if (b === 'india') return new Set(['pune', 'bengaluru']);
  if (b === 'pune') return new Set(['pune']);
  if (b === 'bengaluru') return new Set(['bengaluru']);
  if (b === 'dubai') return new Set(['dubai']);
  return null;
}

/** Filter a list of documents by the current user's branch access. */
export function filterByUserBranch(list, user) {
  const allowed = allowedBranchesForUser(user);
  if (!allowed) return list;
  return list.filter((d) => allowed.has(d.branch));
}

/**
 * Filter clients by branch access — a client "belongs" to a branch if they have
 * at least one invoice in that branch.
 */
export function filterClientsByUserBranch(clients, invoices, user) {
  const allowed = allowedBranchesForUser(user);
  if (!allowed) return clients;
  const allowedClientIds = new Set(
    invoices.filter((d) => allowed.has(d.branch)).map((d) => d.clientId).filter(Boolean)
  );
  return clients.filter((c) => allowedClientIds.has(c.id));
}

/**
 * Which of the All / India / Dubai region tabs a user may see. A non-admin
 * restricted to one region only sees that region's tab.
 */
export function visibleRegionsForUser(user) {
  const isAdmin = user && user.role === 'admin';
  const access = (user && user.branchAccess) || 'all';
  if (isAdmin || access === 'all') return new Set(['all', 'india', 'dubai']);
  if (access === 'india' || access === 'pune' || access === 'bengaluru') return new Set(['india']);
  if (access === 'dubai') return new Set(['dubai']);
  return new Set(['all', 'india', 'dubai']);
}

/**
 * clientId → Set of 'india' / 'dubai', derived from the branches of their
 * invoices. A client can be in India, Dubai, both, or neither (no invoices yet).
 */
export function clientRegionMap(invoices) {
  const map = new Map();
  for (const inv of invoices) {
    if (!inv.clientId) continue;
    if (!map.has(inv.clientId)) map.set(inv.clientId, new Set());
    map.get(inv.clientId).add(inv.branch === 'dubai' ? 'dubai' : 'india');
  }
  return map;
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
 * True when `invoiceNo` belongs to the series owning `prefix` — the prefix must
 * be followed immediately by the counter digits. This keeps a series from
 * claiming another whose prefix nests inside it, e.g. the Dubai tax invoice
 * prefix "DSL/26-27/DB-" must not match the Dubai proforma "DSL/26-27/DB-PI-001".
 */
export function belongsToSeries(invoiceNo, prefix) {
  const inv = String(invoiceNo || '').trim();
  if (!prefix || !inv.startsWith(prefix)) return false;
  return /^\d/.test(inv.substring(prefix.length));
}

/**
 * Find the highest invoice number currently in storage that matches the given prefix,
 * extract its numeric suffix, and return that number + 1. Falls back to numbering counter.
 */
export function nextAvailableNumber(invoices, prefix, fallbackCounter) {
  let highest = (fallbackCounter || 1) - 1;
  for (const d of invoices || []) {
    const inv = (d.invoiceNo || '').trim();
    if (!belongsToSeries(inv, prefix)) continue;
    const m = inv.substring(prefix.length).match(/^(\d+)/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > highest) highest = n;
    }
  }
  return highest + 1;
}

/** Which of the five series a document belongs to (see NUMBER_SERIES). */
export function seriesKeyFor(docType, branch) {
  // Proformas and tax invoices each split India (Pune + Bengaluru) from Dubai.
  if (docType === 'proforma') return branch === 'dubai' ? 'proformaDubai' : 'proforma';
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

/* ============================================================
   PAYMENT RECONCILIATION
   A proforma requests payment; a tax invoice records what the client actually
   transacted. Every "pending / received" figure is DERIVED from the documents
   themselves, so no stored total can drift out of sync:
     · a tax invoice's received amount = total - outstanding
     · a proforma's pending amount     = total - sum of tax invoices raised from it
   ============================================================ */

/** Sub-cent differences are noise — net/tax amounts are back-calculated. */
export const MONEY_EPS = 0.005;

export function round2(n) {
  return Math.round((+n || 0) * 100) / 100;
}

/** Tax invoices raised from a proforma — a proforma may be invoiced in parts. */
export function invoicesForProforma(invoices, proformaId) {
  if (!proformaId) return [];
  return (invoices || []).filter((d) => d.docType === 'invoice' && d.sourceProformaId === proformaId);
}

/** Money actually received against a tax invoice. */
export function receivedOf(d) {
  if (!d || d.docType === 'proforma') return 0;
  const total = round2(d.totalAmount);
  // Recorded by hand on the form, so it is taken at face value — capping it at
  // the item total would silently contradict what was entered and printed.
  if (d.receivedAmount !== undefined && d.receivedAmount !== null && d.receivedAmount !== '') {
    return Math.max(0, round2(d.receivedAmount));
  }
  // Documents saved before receipts were tracked: "cleared" means paid in full,
  // and an outstanding amount below the total implies the rest came in.
  if (d.status !== 'due') return total;
  const out = (d.amountDueOutstanding === undefined || d.amountDueOutstanding === null || d.amountDueOutstanding === '')
    ? total : round2(d.amountDueOutstanding);
  return Math.max(0, round2(total - out));
}

/**
 * What is still to be RECEIVED on a document — the figure behind "pending
 * payments". A proforma keeps showing its unpaid balance even after it has been
 * converted: raising the tax invoice does not make the money arrive, only the
 * receipt recorded on that invoice does.
 */
export function pendingOf(d, invoices) {
  const total = round2(d.totalAmount);
  if (d.docType === 'proforma') {
    const linked = invoicesForProforma(invoices, d.id);
    // A legacy stamp with no surviving tax invoice counts as settled in full.
    if (linked.length === 0) return d.convertedToInvoiceId ? 0 : total;
    return Math.max(0, round2(total - linked.reduce((s, x) => s + receivedOf(x), 0)));
  }
  return Math.max(0, round2(total - receivedOf(d)));
}

/**
 * The slice of a proforma no tax invoice covers yet — what "Convert" still has
 * left to raise. Distinct from pendingOf(): invoicing the whole proforma ends
 * the conversion, while the balance stays pending until the client pays it.
 */
export function unbilledOf(proforma, invoices) {
  const total = round2(proforma.totalAmount);
  const linked = invoicesForProforma(invoices, proforma.id);
  if (linked.length === 0) return proforma.convertedToInvoiceId ? 0 : total;
  return Math.max(0, round2(total - linked.reduce((s, x) => s + (+x.totalAmount || 0), 0)));
}

/**
 * A document's contribution to the outstanding total. A tax invoice raised from
 * a proforma adds nothing of its own — its balance is already inside that
 * proforma's pending amount, and counting both would double up.
 */
export function outstandingOf(d, invoices) {
  if (d.docType === 'invoice' && d.sourceProformaId &&
      (invoices || []).some((x) => x.id === d.sourceProformaId && x.docType === 'proforma')) {
    return 0;
  }
  return pendingOf(d, invoices);
}

/**
 * Reconciliation summary for one proforma: how much of it has been carried into
 * tax invoices, how much is still pending, and how much of it has been received.
 */
export function proformaState(p, invoices) {
  const total = round2(p.totalAmount);
  const linked = invoicesForProforma(invoices, p.id);
  const invoiced = round2(linked.reduce((s, x) => s + (+x.totalAmount || 0), 0));
  const received = round2(linked.reduce((s, x) => s + receivedOf(x), 0));
  const pending = pendingOf(p, invoices);   // still to be received
  const unbilled = unbilledOf(p, invoices); // still to be invoiced

  // 'pending'  — no tax invoice raised yet
  // 'partial'  — invoiced in part, the rest can still be converted
  // 'awaiting' — fully invoiced, money still to come in
  // 'invoiced' — fully invoiced and fully received
  let key = 'pending';
  if (unbilled <= MONEY_EPS) key = pending > MONEY_EPS ? 'awaiting' : 'invoiced';
  else if (invoiced > MONEY_EPS) key = 'partial';
  return { key, total, invoiced, received, pending, unbilled, linked };
}

/** Badge label + class for a document's payment state, shared by every table. */
export function statusBadgeOf(d, invoices) {
  if (d.docType === 'proforma') {
    const st = proformaState(d, invoices);
    if (st.key === 'invoiced') return { key: 'invoiced', label: '\u2713 Invoiced', cls: 'badge-paid' };
    if (st.key === 'awaiting') return { key: 'awaiting', label: 'Awaiting Payment', cls: 'badge-partial' };
    if (st.key === 'partial') return { key: 'partial', label: 'Part Invoiced', cls: 'badge-partial' };
    return { key: 'pending', label: 'Pending', cls: 'badge-due' };
  }
  if (pendingOf(d, invoices) <= MONEY_EPS) return { key: 'paid', label: 'Cleared', cls: 'badge-paid' };
  if (receivedOf(d) > MONEY_EPS) return { key: 'partial', label: 'Part Paid', cls: 'badge-partial' };
  return { key: 'due', label: 'Due', cls: 'badge-due' };
}

/* ============================================================
   DATE RANGE
   Every list and the dashboard narrow to a window of invoice dates. An empty
   bound is open-ended, so "from" alone means "everything since", and both
   empty means all time.
   ============================================================ */

/** One day in ms — `to` is inclusive, so it stretches to the end of that day. */
const DAY_MS = 86400000;

export function inDateRange(value, from, to) {
  if (!from && !to) return true;
  const t = parseDateValue(value);
  if (t === null) return false;
  if (from) {
    const f = parseDateValue(from);
    if (f !== null && t < f) return false;
  }
  if (to) {
    const e = parseDateValue(to);
    if (e !== null && t >= e + DAY_MS) return false;
  }
  return true;
}

/** Documents whose invoice date falls inside the window. */
export function filterByDateRange(docs, from, to) {
  if (!from && !to) return docs;
  return docs.filter((d) => inDateRange(d.invoiceDate, from, to));
}

/**
 * Revenue split by item sub-type across a set of tax invoices.
 *
 * An invoice can carry several line items with different sub-types (a renewal
 * plus a set-up fee, say) while payment arrives as one figure, so each item is
 * credited its share of the money received in proportion to what it was billed.
 * Returns rows sorted by revenue, highest first.
 */
export function revenueBySubType(docs) {
  const rows = new Map();
  for (const d of docs) {
    if (!d || d.docType !== 'invoice') continue;
    const docTotal = round2(d.totalAmount);
    const received = receivedOf(d);
    const items = (Array.isArray(d.items) && d.items.length > 0)
      ? d.items
      : [{ subType: d.subType, totalAmount: d.totalAmount }];
    for (const it of items) {
      const label = String(it.subType || 'Unspecified').trim() || 'Unspecified';
      const billed = round2(it.totalAmount);
      // Split evenly when the totals give nothing to weigh against.
      const share = docTotal > MONEY_EPS ? billed / docTotal : 1 / items.length;
      const row = rows.get(label) || { subType: label, billed: 0, revenue: 0, count: 0 };
      row.billed += billed;
      row.revenue += received * share;
      row.count += 1;
      rows.set(label, row);
    }
  }
  return [...rows.values()]
    .map((r) => ({ ...r, billed: round2(r.billed), revenue: round2(r.revenue) }))
    .sort((a, b) => b.revenue - a.revenue || b.billed - a.billed);
}

/* ============================================================
   ROLES, DATA SCOPE AND ASSIGNMENT
   Branch access says WHICH branches a user reaches; data scope says how much of
   those branches they see. A user on the 'own' scope works their own book: the
   documents they raised, plus anything assigned to them. Admins ignore both.
   ============================================================ */

/** Emails are the identity used on documents — compare them case-insensitively. */
export function sameEmail(a, b) {
  return !!a && !!b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

/** A user's effective data scope. Admins always see everything. */
export function dataScopeOf(user) {
  if (!user || user.role === 'admin') return 'all';
  return user.dataScope === 'own' ? 'own' : 'all';
}

/** Is this document the user's own work, or handed to them? */
export function docBelongsToUser(d, user) {
  if (!d || !user) return false;
  const email = user.email;
  return sameEmail(d.createdByEmail, email) || sameEmail(d.assignedTo, email);
}

/**
 * Narrow a document list to what the user is allowed to see. Applied on top of
 * filterByUserBranch, never instead of it.
 */
export function filterByUserScope(list, user) {
  if (dataScopeOf(user) !== 'own') return list;
  return list.filter((d) => docBelongsToUser(d, user));
}

/** Branch access and data scope together — the filter every list should use. */
export function visibleDocsFor(list, user) {
  return filterByUserScope(filterByUserBranch(list, user), user);
}

/**
 * Clients follow the documents: on the narrow scope a user only sees clients
 * they have a visible document for, plus any client record they created.
 */
export function visibleClientsFor(clients, invoices, user) {
  const byBranch = filterClientsByUserBranch(clients, invoices, user);
  if (dataScopeOf(user) !== 'own') return byBranch;
  const ids = new Set(visibleDocsFor(invoices, user).map((d) => d.clientId).filter(Boolean));
  return byBranch.filter((c) => ids.has(c.id) || sameEmail(c.createdByEmail, user.email));
}

/**
 * The permission set actually in force for a user. A role supplies the baseline;
 * `permissionsSource: 'custom'` means an admin hand-tuned this one person and
 * their stored `permissions` win. Users with no role keep their stored set.
 */
export function effectivePermissions(user, roles) {
  if (!user) return {};
  if (user.role === 'admin') return user.permissions || {};
  const usingRole = user.roleId && user.permissionsSource !== 'custom';
  if (usingRole) {
    const role = (roles || []).find((r) => r.id === user.roleId);
    if (role && role.permissions) return role.permissions;
  }
  return user.permissions || {};
}

/** Data scope resolves the same way — the role sets it unless overridden. */
export function effectiveDataScope(user, roles) {
  if (!user || user.role === 'admin') return 'all';
  if (user.roleId && user.permissionsSource !== 'custom') {
    const role = (roles || []).find((r) => r.id === user.roleId);
    if (role && role.dataScope) return role.dataScope === 'own' ? 'own' : 'all';
  }
  return user.dataScope === 'own' ? 'own' : 'all';
}

/** Display name for a document's assignee, falling back to the raw email. */
export function assigneeLabel(d, users) {
  if (!d || !d.assignedTo) return '';
  const u = (users || []).find((x) => sameEmail(x.email, d.assignedTo));
  return (u && (u.name || ((u.firstName || '') + ' ' + (u.surname || '')).trim())) || d.assignedToName || d.assignedTo;
}

/**
 * The role list an install starts with — each seed borrows the permission set of
 * the department it is modelled on, so the first admin to open Roles finds
 * something recognisable rather than a blank page.
 */
export function buildSeedRoles() {
  return BUILT_IN_ROLE_SEEDS.map((seed) => ({
    id: seed.id,
    name: seed.name,
    description: seed.description,
    dataScope: seed.dataScope,
    permissions: deepClone(DEFAULT_DEPT_PERMISSIONS[seed.from] || DEFAULT_DEPT_PERMISSIONS.Sales),
    createdAt: new Date().toISOString()
  }));
}

/** Resolve a stored profile into the session shape the app filters on. */
export function resolveUserSession(profile, roles) {
  if (!profile) return profile;
  const role = profile.roleId ? (roles || []).find((r) => r.id === profile.roleId) : null;
  return {
    ...profile,
    role: profile.role || 'user',
    roleName: role ? role.name : '',
    permissions: effectivePermissions(profile, roles),
    dataScope: effectiveDataScope(profile, roles)
  };
}
