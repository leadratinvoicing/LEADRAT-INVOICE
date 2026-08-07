import { fmtMoney } from './utils';

/* Helpers shared by the India and Dubai Word generators. */

// Short forms that must stay all-caps when a string is title-cased.
export const ACRONYMS = new Set([
  'CRM', 'TRN', 'GST', 'IGST', 'CGST', 'SGST', 'HSN', 'SAC', 'VAT', 'LLC', 'L.L.C',
  'UAE', 'U.A.E', 'PVT', 'LTD', 'IBAN', 'IFSC', 'CIN', 'MG', 'HSR', 'SUS', 'A/C',
  'ICICI', 'RAK', 'TDS', 'ID', 'NEFT', 'RTGS', 'UPI', 'B2B', 'B2C'
]);

export const RUN_FONT = 'Aptos Narrow';

export function dataUriBytes(uri) {
  const m = String(uri || '').match(/^data:image\/(jpe?g|png);base64,(.+)$/i);
  if (!m) return null;
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, type: m[1].toLowerCase().startsWith('jp') ? 'jpg' : 'png' };
}

/** Last 3 digits of an invoice number; falls back to the last 3 characters. */
export function last3(invoiceNo) {
  const tail = String(invoiceNo || '').match(/(\d+)\s*$/);
  if (tail) return tail[1].slice(-3).padStart(3, '0');
  return String(invoiceNo || '').replace(/[^A-Za-z0-9]/g, '').slice(-3) || '000';
}

/** Strip characters Windows/macOS reject in filenames. */
export function safeFile(s) {
  return String(s || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Title-case a string, but leave codes (GSTIN/CIN/IFSC/invoice numbers),
 * money strings, and known acronyms untouched.
 */
export function titleCase(s, moneyPrefixRe) {
  s = String(s == null ? '' : s);
  // No spaces, 6+ chars, mixed letters and digits → an identifier, not prose.
  if (/^\S+$/.test(s) && s.length >= 6 && /[A-Za-z]/.test(s) && /\d/.test(s)) return s;
  if (moneyPrefixRe && moneyPrefixRe.test(s)) return s;
  return s.toLowerCase().replace(/\b([a-z])([a-z]*)\b/g, (m, first, rest) => {
    if (ACRONYMS.has(m.toUpperCase())) return m.toUpperCase();
    return first.toUpperCase() + rest;
  });
}

/** India: Word renders ₹ inconsistently across machines, so use "Rs.". */
export function fmtMoneyDocx(n) {
  return 'Rs. ' + fmtMoney(n);
}

/** Dubai: Western thousands grouping with an AED prefix. */
export function fmtMoneyAed(n) {
  if (n === null || n === undefined || isNaN(n)) return 'AED 0.00';
  return 'AED ' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function buildFilename(d) {
  const fnPrefix = last3(d.invoiceNo);
  const fnClient = safeFile((d.clientName || 'CLIENT').toUpperCase());
  const fnSub = safeFile((d.subType || d.description || '').toUpperCase());
  return fnPrefix + '-' + fnClient + (fnSub ? ' (' + fnSub + ')' : '') + '.docx';
}
