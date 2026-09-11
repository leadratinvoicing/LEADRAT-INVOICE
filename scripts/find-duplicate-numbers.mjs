// Paste an exported invoices JSON path as argv[2], or run with no args to see usage.
import fs from 'fs';
const file = process.argv[2];
if (!file) { console.log('usage: vite-node src/__scan.mjs <invoices.json>'); process.exit(0); }
const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
const rows = Array.isArray(raw) ? raw : (raw.rows || raw.data?.invoices || []);
const byNo = new Map();
for (const d of rows) {
  const k = String(d.invoiceNo || '').trim().toLowerCase();
  if (!k) continue;
  if (!byNo.has(k)) byNo.set(k, []);
  byNo.get(k).push(d);
}
let n = 0;
for (const [k, list] of byNo) {
  if (list.length > 1) {
    n++;
    console.log('DUPLICATE ' + list[0].invoiceNo);
    for (const d of list) console.log('   ' + (d.clientName || '(no client)') + '  ' + (d.invoiceDate || '') + '  id=' + d.id);
  }
}
console.log(n === 0 ? 'No duplicate document numbers found.' : n + ' duplicated number(s)');
