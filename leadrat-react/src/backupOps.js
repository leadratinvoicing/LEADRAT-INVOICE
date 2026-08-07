/* ============================================================
   BACKUP & RESTORE (offline data portability)
   Download all app data to a single JSON file, and restore it on any
   device. Lets a team share one dataset by passing the file around
   (Drive / WhatsApp / email) without needing everyone online.
   ============================================================ */

export function downloadBackupFile(payload) {
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const today = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'leadrat-backup-' + today + '.json';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
}

/** Parse and validate a backup file. Throws with a readable message on bad input. */
export async function parseBackupFile(file) {
  const text = await file.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('This is not a valid backup file (invalid JSON).');
  }
  if (!payload || payload._format !== 'leadrat-backup' || !payload.data) {
    throw new Error('This is not a Leadrat backup file. Please pick a file that was downloaded from this app.');
  }
  return payload;
}

/** The confirmation text shown before a restore replaces existing data. */
export function buildRestorePrompt(payload, current) {
  const summary = payload._counts || {};
  const generatedAt = payload._generatedAt ? new Date(payload._generatedAt).toLocaleString('en-IN') : 'unknown';
  const generatedBy = payload._generatedBy || 'unknown';
  return 'Load backup?' +
    '\n\nBackup file contains:' +
    '\n  • ' + (summary.invoices || 0) + ' invoices' +
    '\n  • ' + (summary.clients || 0) + ' clients' +
    '\n  • ' + (summary.users || 0) + ' users' +
    '\n  • Generated: ' + generatedAt +
    '\n  • By: ' + generatedBy +
    '\n\nCurrent data on THIS device (will be REPLACED):' +
    '\n  • ' + current.invoices + ' invoices' +
    '\n  • ' + current.clients + ' clients' +
    '\n  • ' + current.users + ' users' +
    '\n\nClick OK to REPLACE current data with the backup. This cannot be undone.';
}
