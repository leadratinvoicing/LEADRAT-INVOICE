/* ============================================================
   CLIENT GST REGISTRATIONS (Bill To)
   A client can be registered under more than one GSTIN — a second state, a
   separate branch office — and each registration has its own billing address.
   One is marked default; when a client has more than one, the invoice form
   asks which the document is being raised against.

   Backward compatibility: a client saved before this feature has a single
   `gstin`/`address` pair. That is presented as one registration, so nothing
   needs migrating and existing clients keep working untouched.
   ============================================================ */

export const PRIMARY_GST_ID = 'gst-primary';

/** Two covers the stated need; a little headroom costs nothing. */
export const MAX_CLIENT_GSTINS = 4;

/**
 * Every GST registration a client holds, old shape or new. Always returns at
 * least one entry so callers never special-case an empty list.
 */
export function clientGstins(client) {
  const c = client || {};
  const list = Array.isArray(c.gstRegistrations) ? c.gstRegistrations.filter(Boolean) : [];
  if (list.length > 0) {
    return list.map((r, i) => ({
      id: r.id || (PRIMARY_GST_ID + '-' + i),
      label: r.label || ('GSTIN ' + (i + 1)),
      gstin: r.gstin || '',
      address: r.address || '',
      isDefault: !!r.isDefault
    }));
  }
  return [{
    id: PRIMARY_GST_ID,
    label: 'Primary',
    gstin: c.gstin || '',
    address: c.address || '',
    isDefault: true
  }];
}

/** The registration used when a document does not name one. */
export function defaultClientGstin(client) {
  const list = clientGstins(client);
  return list.find((r) => r.isDefault) || list[0];
}

/** Look one up by id, falling back to the client's default. */
export function clientGstinById(client, id) {
  const list = clientGstins(client);
  return list.find((r) => r.id === id) || defaultClientGstin(client);
}

/** Does this client present a choice the user has to make? */
export function hasMultipleClientGstins(client) {
  return clientGstins(client).length > 1;
}

/**
 * Normalise before saving: give every row an id, drop empty rows, upper-case
 * the GSTINs and guarantee exactly one default.
 */
export function normaliseClientGstins(list) {
  const cleaned = (list || [])
    .filter((r) => r && (String(r.gstin || '').trim() || String(r.address || '').trim()))
    .map((r, i) => ({
      id: r.id || (PRIMARY_GST_ID + '-' + Date.now() + '-' + i),
      label: String(r.label || '').trim() || ('GSTIN ' + (i + 1)),
      gstin: String(r.gstin || '').trim().toUpperCase(),
      address: String(r.address || '').trim(),
      isDefault: !!r.isDefault
    }));
  if (cleaned.length === 0) return [];
  if (!cleaned.some((r) => r.isDefault)) cleaned[0].isDefault = true;
  let seen = false;
  for (const r of cleaned) {
    if (r.isDefault && !seen) seen = true;
    else r.isDefault = false;
  }
  return cleaned;
}

/** The first problem with a set of registrations, or null when they are fine. */
export function validateClientGstins(list) {
  const regs = normaliseClientGstins(list);
  if (regs.length === 0) return 'Add at least one GSTIN and address';
  for (const r of regs) {
    if (!r.gstin) return 'GSTIN is required for "' + r.label + '"';
    if (r.gstin.length !== 15) return '"' + r.label + '": GSTIN must be exactly 15 characters';
    if (!r.address) return 'Billing address is required for "' + r.label + '"';
  }
  const dupe = regs.find((r, i) => regs.findIndex((x) => x.gstin === r.gstin) !== i);
  if (dupe) return 'The same GSTIN is listed twice (' + dupe.gstin + ')';
  return null;
}

/** A short, unambiguous label for a picker. */
export function clientGstinLabel(reg) {
  if (!reg) return '';
  return reg.label + (reg.gstin ? ' · ' + reg.gstin : '') + (reg.isDefault ? ' (default)' : '');
}
