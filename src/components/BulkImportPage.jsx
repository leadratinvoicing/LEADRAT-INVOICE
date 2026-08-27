import { useRef, useState } from 'react';
import { fmtDate, fmtMoneyForRegion, formatExcelDate } from '../utils';
import { normaliseBranch } from '../excelOps';

export default function BulkImportPage({
  pendingImport, onFile, onConfirm, onCancel, onDownloadIndiaTemplate, onDownloadDubaiTemplate
}) {
  const fileRef = useRef(null);
  const [dragover, setDragover] = useState(false);

  // Rows sharing an invoice_no become one multi-item invoice.
  const invoiceCounts = new Map();
  (pendingImport || []).forEach((r) => {
    if (!r.invoice_no) return;
    const k = String(r.invoice_no).trim();
    invoiceCounts.set(k, (invoiceCounts.get(k) || 0) + 1);
  });
  const totalInvoices = invoiceCounts.size;
  const mergedGroups = [...invoiceCounts.values()].filter((n) => n > 1).length;

  return (
    <div className="page show">
      <div className="page-header">
        <div>
          <div className="page-title">Bulk Import</div>
          <div className="page-subtitle">Upload Excel file to create invoices in bulk</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={onDownloadIndiaTemplate}>🇮🇳 India Template</button>
          <button className="btn btn-secondary" onClick={onDownloadDubaiTemplate}>🇦🇪 Dubai Template</button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Upload Excel File</div>
        <div
          className={'upload-area' + (dragover ? ' dragover' : '')}
          onClick={() => fileRef.current && fileRef.current.click()}
          onDragEnter={(e) => { e.preventDefault(); setDragover(true); }}
          onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
          onDragLeave={(e) => { e.preventDefault(); setDragover(false); }}
          onDrop={(e) => {
            e.preventDefault();
            setDragover(false);
            const f = e.dataTransfer.files && e.dataTransfer.files[0];
            if (f) onFile(f);
          }}
        >
          <div className="upload-icon">⬆</div>
          <div className="upload-text">Click to upload or drag &amp; drop</div>
          <div className="upload-hint">Supports .xlsx, .xls files. Use template format.</div>
          <input
            ref={fileRef} type="file" className="hide" accept=".xlsx,.xls"
            onChange={(e) => {
              const f = e.target.files && e.target.files[0];
              e.target.value = '';
              if (f) onFile(f);
            }}
          />
        </div>
      </div>

      {pendingImport && (
        <div className="card">
          <div className="card-title">Import Preview</div>
          <p style={{ marginBottom: 10, fontSize: 10.8 }}>
            <strong>{pendingImport.length}</strong> row{pendingImport.length === 1 ? '' : 's'} detected → will create{' '}
            <strong>{totalInvoices}</strong> invoice{totalInvoices === 1 ? '' : 's'}
            {mergedGroups > 0 && (
              <span style={{ color: 'var(--brand-dark)' }}>
                {' '}({mergedGroups} multi-item invoice{mergedGroups === 1 ? '' : 's'} — rows sharing an invoice_no are merged)
              </span>
            )}.
          </p>
          <div className="table-wrap" style={{ maxHeight: 400, overflow: 'auto' }}>
            <table>
              <thead>
                <tr><th>#</th><th>Type</th><th>Branch</th><th>Invoice No</th><th>Client</th><th>Date</th><th>Total</th><th>Status</th></tr>
              </thead>
              <tbody>
                {pendingImport.map((r, i) => {
                  const docType = String(r.doc_type || 'invoice').toLowerCase().includes('pro') ? 'proforma' : 'invoice';
                  const invNo = r.invoice_no ? String(r.invoice_no).trim() : '';
                  const isMerge = invNo && invoiceCounts.get(invNo) > 1;
                  const branch = normaliseBranch(r.branch);
                  return (
                    <tr key={i} style={isMerge ? { background: '#FEF3C7' } : undefined}>
                      <td>{i + 1}</td>
                      <td><span className={'badge ' + (docType === 'invoice' ? 'badge-invoice' : 'badge-proforma')}>{docType}</span></td>
                      <td style={{ fontSize: 10 }}>{r.branch || '-'}</td>
                      <td>
                        {invNo || <em style={{ color: '#dc2626' }}>missing</em>}
                        {isMerge && (
                          <span style={{ fontSize: 8.3, background: '#F59E0B', color: '#fff', padding: '1px 4px', borderRadius: 3, marginLeft: 4 }}>
                            MERGE
                          </span>
                        )}
                      </td>
                      <td>{r.client_name || <em style={{ color: '#dc2626' }}>missing</em>}</td>
                      <td>{r.invoice_date ? fmtDate(formatExcelDate(r.invoice_date)) : ''}</td>
                      <td>{fmtMoneyForRegion(r.total_amount || 0, branch === 'dubai' ? 'dubai' : 'india')}</td>
                      <td>{r.status || 'paid'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
            <button className="btn btn-primary" onClick={onConfirm}>Confirm Import</button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-title">Excel Format Guide</div>
        <div style={{ background: 'var(--brand-light)', padding: '10px 12px', borderRadius: 6, marginBottom: 12, fontSize: 10, color: 'var(--brand-dark)' }}>
          💡 <strong>Multi-item invoice merging:</strong> If two or more rows share the same <strong>invoice_no</strong>, they are combined into a single multi-item invoice. All shared fields (client, dates, GSTIN, etc.) come from the FIRST row; each row&apos;s line-item details (description, sub-type, license, validity, amounts) become a separate item.
        </div>

        <p style={{ fontSize: 10.8, color: 'var(--muted)', marginBottom: 8 }}><strong>🇮🇳 India template columns:</strong></p>
        <div style={{ fontSize: 10, lineHeight: 1.7, marginBottom: 14 }}>
          <strong>doc_type</strong> (invoice / proforma) | <strong>branch</strong> (pune / bengaluru) | <strong>invoice_no</strong> | <strong>invoice_date</strong> (DD/MM/YYYY)<br />
          <strong>client_name</strong> | <strong>client_address</strong> | <strong>client_gstin</strong> | <strong>legal_name</strong> | <strong>hsn_sac</strong> (default 997331)<br />
          <strong>description</strong> | <strong>sub_type</strong> | <strong>payment_date</strong> | <strong>no_of_license</strong> | <strong>validity</strong><br />
          <strong>gst_type</strong> (cgst_sgst / igst) | <strong>net_amount</strong> | <strong>cgst</strong> | <strong>sgst</strong> | <strong>igst</strong> | <strong>total_amount</strong><br />
          <strong>payment_mode</strong> | <strong>status</strong> (paid / due) | <strong>amount_due</strong> | <strong>due_date</strong>
        </div>

        <p style={{ fontSize: 10.8, color: 'var(--muted)', marginBottom: 8 }}><strong>🇦🇪 Dubai template columns:</strong></p>
        <div style={{ fontSize: 10, lineHeight: 1.7 }}>
          <strong>doc_type</strong> (invoice / proforma) | <strong>branch</strong> (always &quot;dubai&quot;) | <strong>invoice_no</strong> | <strong>invoice_date</strong> (DD/MM/YYYY)<br />
          <strong>client_name</strong> | <strong>client_address</strong> | <strong>client_trn</strong> (15-digit or blank) | <strong>legal_name</strong><br />
          <strong>description</strong> | <strong>sub_type</strong> | <strong>payment_date</strong> | <strong>no_of_license</strong> | <strong>validity</strong><br />
          <strong>net_amount</strong> (AED) | <strong>vat_amount</strong> (AED, 5%) | <strong>total_amount</strong> (AED)<br />
          <strong>payment_mode</strong> (default &quot;Bank Transfer&quot;) | <strong>status</strong> (paid / due) | <strong>amount_due</strong> | <strong>due_date</strong>
        </div>
      </div>
    </div>
  );
}
