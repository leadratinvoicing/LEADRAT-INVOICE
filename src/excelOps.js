import * as XLSX from 'xlsx';
import { fmtDate } from './utils';

/* ============================================================
   EXCEL TEMPLATES / IMPORT / EXPORT
   ============================================================ */

export function downloadInvoiceTemplate() {
  const wb = XLSX.utils.book_new();
  const headers = [
    'doc_type', 'branch', 'invoice_no', 'invoice_date',
    'client_name', 'client_address', 'client_gstin', 'legal_name',
    'client_email', 'client_contact', 'hsn_sac',
    'description', 'sub_type', 'payment_date', 'no_of_license', 'validity',
    'gst_type', 'net_amount', 'cgst', 'sgst', 'igst', 'total_amount',
    'payment_mode', 'status', 'amount_due', 'due_date'
  ];
  // The first two rows share an invoice_no on purpose — they demonstrate how
  // rows are merged into a single multi-item invoice.
  const sample = [
    headers,
    ['invoice', 'pune', 'DSLM/26-27/099', '05/05/2026', 'SAMPLE CLIENT LLP', 'Floor 1, Sample Street, Pune, Maharashtra, 411001', '27ABCDE1234F1Z5', '', 'accounts@sampleclient.com', '+91 98765 43210', '997331', 'CRM Application', 'New', '04/05/2026', '10', '1 Year', 'cgst_sgst', '60000', '5400', '5400', '0', '70800', 'UPI', 'paid', '', ''],
    ['invoice', 'pune', 'DSLM/26-27/099', '05/05/2026', 'SAMPLE CLIENT LLP', 'Floor 1, Sample Street, Pune, Maharashtra, 411001', '27ABCDE1234F1Z5', '', 'accounts@sampleclient.com', '+91 98765 43210', '997331', 'CRM Application', 'Set-Up Fee', '04/05/2026', '10', 'Current', 'cgst_sgst', '25000', '2250', '2250', '0', '29500', 'UPI', 'paid', '', ''],
    ['invoice', 'bengaluru', 'DSLK/26-27/037', '06/05/2026', 'BENGALURU SAMPLE PVT LTD', '#123, HSR Layout, Bengaluru, Karnataka, 560102', '29ABCDE1234F1Z5', 'Bengaluru Sample Private Limited', 'finance@bengalurusample.com', '+91 90000 12345', '997331', 'CRM Application', 'Renewal', '06/05/2026', '20', '1 Year', 'igst', '76271.19', '0', '0', '13728.81', '90000', 'NEFT', 'due', '94080', '06/08/2026'],
    ['proforma', 'bengaluru', 'DSL/26-27/PI-099', '05/05/2026', 'PROFORMA SAMPLE', 'Sample Address Bengaluru', '29ABCDE1234F1Z5', '', '', '', '997331', 'CRM Application', 'Renewal', '', '15', '1 Year', 'cgst_sgst', '50847.46', '4576.27', '4576.27', '0', '60000', 'NEFT', 'due', '60000', '20/05/2026'],
    ['NOTE', '', '', '', '', '', '', '', 'client_email / client_contact: optional — saved onto the client record.', '', '', '', 'amount_due: only used when status=due (outstanding amount owed). Leave empty for paid invoices.', '', '', '', '', '', '', '', '', '', '', '', '', '']
  ];
  const ws = XLSX.utils.aoa_to_sheet(sample);
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  XLSX.utils.book_append_sheet(wb, ws, 'Invoices');
  XLSX.writeFile(wb, 'Leadrat_India_Invoice_Template.xlsx');
}

/**
 * Dubai template — different columns because Dubai uses TRN (not GSTIN),
 * a flat VAT @ 5% (no CGST/SGST/IGST split), and AED amounts.
 */
export function downloadDubaiTemplate() {
  const wb = XLSX.utils.book_new();
  const headers = [
    'doc_type', 'branch', 'invoice_no', 'invoice_date',
    'client_name', 'client_address', 'client_trn', 'legal_name',
    'client_email', 'client_contact',
    'description', 'sub_type', 'payment_date', 'no_of_license', 'validity',
    'net_amount', 'vat_amount', 'total_amount',
    'payment_mode', 'status', 'amount_due', 'due_date'
  ];
  const sample = [
    headers,
    ['invoice', 'dubai', 'DSL/26-27/DB-041', '18/02/2026', 'S K R LEASING PROPERTY BROKERAGE AGENTS L.L.C', 'OFFICE 803, OXFORD TOWER, BUSINESS BAY, DUBAI, UAE', '104479933400001', '', 'accounts@skrleasing.ae', '+971 50 123 4567', 'Leadrat CRM Software', 'New', '18/02/2026', '10', '6 Months', '2095.24', '104.76', '2200', 'Bank Transfer', 'paid', '', ''],
    ['invoice', 'dubai', 'DSL/26-27/DB-041', '18/02/2026', 'S K R LEASING PROPERTY BROKERAGE AGENTS L.L.C', 'OFFICE 803, OXFORD TOWER, BUSINESS BAY, DUBAI, UAE', '104479933400001', '', 'accounts@skrleasing.ae', '+971 50 123 4567', 'Leadrat CRM Software', 'Set-Up Fee', '18/02/2026', '10', 'Current', '500', '25', '525', 'Bank Transfer', 'paid', '', ''],
    ['proforma', 'dubai', 'DSL/25-26/PI-159', '13/04/2026', 'NORTHWAY REAL ESTATE L.L.C', 'OFFICE NO.4501, FOUNTAIN VIEWS TOWER 2, DUBAI, UAE', '', '', '', '', 'Leadrat CRM Software', 'New', '13/04/2026', '5', '1 Year', '8400', '420', '8820', 'Bank Transfer', 'due', '8820', '13/05/2026'],
    ['NOTE', '', '', '', '', '', '', '', 'client_email / client_contact: optional — saved onto the client record.', '', '', '', '', 'amount_due: only used when status=due. legal_name: optional — leave blank unless explicitly different from client_name.', '', '', '', '', '', '', '', '']
  ];
  const ws = XLSX.utils.aoa_to_sheet(sample);
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  XLSX.utils.book_append_sheet(wb, ws, 'Dubai Invoices');
  XLSX.writeFile(wb, 'Leadrat_Dubai_Invoice_Template.xlsx');
}

export function downloadClientTemplate() {
  const headers = ['client_name', 'legal_name', 'address', 'city', 'email', 'contact_number', 'gstin'];
  const example = [
    'Acme Realty Pvt Ltd',
    'Acme Realty Private Limited',
    'Plot 42, MG Road, Bengaluru',
    'Bengaluru',
    'accounts@acmerealty.com',
    '+91 98765 43210',
    '29ABCDE1234F1Z5'
  ];
  const note = ['NOTE: Delete this example row before uploading. client_name + address + gstin are required. legal_name, city, email and contact_number are optional. GSTIN must be exactly 15 characters (alphanumeric, will be auto-uppercased). contact_number may include the country code.', '', '', '', '', '', ''];
  const ws = XLSX.utils.aoa_to_sheet([headers, example, note]);
  ws['!cols'] = [{ wch: 28 }, { wch: 32 }, { wch: 50 }, { wch: 18 }, { wch: 30 }, { wch: 20 }, { wch: 20 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Clients');
  XLSX.writeFile(wb, 'leadrat_client_template.xlsx');
}

/** Read the first sheet of a File into row objects. */
export async function readSheetRows(file, opts) {
  opts = opts || {};
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: !!opts.cellDates });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error('No sheets found in the file');
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

/** Branch strings people actually type in spreadsheets, mapped to our keys. */
export function normaliseBranch(raw) {
  const b = String(raw || 'pune').toLowerCase();
  if (b.includes('dubai') || b.includes('dxb') || b === 'dbx') return 'dubai';
  if (b.includes('beng') || b.includes('blr')) return 'bengaluru';
  return 'pune';
}

export function exportInvoicesToExcel(list, docType) {
  const data = list.map((d) => ({
    doc_type: d.docType,
    branch: d.branch,
    invoice_no: d.invoiceNo,
    invoice_date: fmtDate(d.invoiceDate),
    client_name: d.clientName,
    client_address: d.clientAddress,
    client_gstin: d.clientGstin,
    hsn_sac: d.hsn,
    description: d.description,
    sub_type: d.subType,
    payment_date: fmtDate(d.paymentDate),
    no_of_license: d.noOfLicense,
    validity: d.validity,
    gst_type: d.gstType,
    net_amount: d.netAmount,
    cgst: d.cgst,
    sgst: d.sgst,
    igst: d.igst,
    total_amount: d.totalAmount,
    payment_mode: d.paymentMode,
    status: d.status,
    due_date: fmtDate(d.dueDate)
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, docType === 'invoice' ? 'Invoices' : 'Proformas');
  XLSX.writeFile(wb, 'Leadrat_' + (docType === 'invoice' ? 'Invoices' : 'Proformas') + '_Export.xlsx');
}

/**
 * Normalise header lookups — "client_name", "Client Name" and "clientname" all
 * resolve to the same column.
 */
export function pickCol(row, ...keys) {
  for (const k of keys) {
    for (const rk of Object.keys(row)) {
      if (rk.toLowerCase().replace(/[\s_-]+/g, '') === k.toLowerCase().replace(/[\s_-]+/g, '')) {
        return String(row[rk] || '').trim();
      }
    }
  }
  return '';
}
