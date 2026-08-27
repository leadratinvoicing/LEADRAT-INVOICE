import { useEffect, useState } from 'react';
import { useApp } from '../AppContext';
import Modal from './Modal';
import { generatePdfPreview } from '../pdfGen';
import { fmtMoneyForRegion, MONEY_EPS, pendingOf, receivedOf, regionOf } from '../utils';

/**
 * Shows the finished document exactly as it will be downloaded — the same PDF
 * renderer, rendered into an iframe — so it can be checked and corrected before
 * anything is handed to a client. "Edit" returns to the form; the download
 * buttons produce the file only once the preview looks right.
 *
 * `doc` may be an unsaved draft straight from the invoice form.
 */
export default function DocumentPreviewModal({ open, doc, onClose, onEdit, onDownloadWord, onDownloadPdf }) {
  const { company, invoices } = useApp();
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !doc) { setUrl(''); setError(''); return undefined; }
    let cancelled = false;
    let objectUrl = '';
    setBusy(true);
    setError('');
    generatePdfPreview(doc, company)
      .then((res) => {
        if (cancelled) { URL.revokeObjectURL(res.url); return; }
        objectUrl = res.url;
        setUrl(res.url);
      })
      .catch((e) => { if (!cancelled) setError(e && e.message ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setBusy(false); });

    // The blob lives only as long as the preview is on screen.
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, doc, company]);

  if (!open || !doc) return null;

  const region = regionOf(doc.branch);
  const money = (n) => fmtMoneyForRegion(n, region);
  const isProforma = doc.docType === 'proforma';
  const received = isProforma ? 0 : receivedOf(doc);
  const balance = pendingOf(doc, invoices);

  const footer = (
    <>
      <button className="btn btn-secondary" onClick={onClose}>Close</button>
      {onEdit && <button className="btn btn-secondary" onClick={onEdit}>✏️ Edit</button>}
      <button className="btn btn-success" onClick={onDownloadWord}>📥 Download Word</button>
      <button className="btn btn-primary" onClick={onDownloadPdf}>📄 Download PDF</button>
    </>
  );

  return (
    <Modal
      open={open}
      title={'Preview · ' + (isProforma ? 'Proforma ' : 'Tax Invoice ') + (doc.invoiceNo || '')}
      maxWidth={980}
      onClose={onClose}
      footer={footer}
    >
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 10, color: 'var(--muted)', marginBottom: 12 }}>
        <span><strong style={{ color: 'var(--text)' }}>{doc.clientName || ''}</strong></span>
        <span>Total: <strong style={{ color: 'var(--text)' }}>{money(doc.totalAmount)}</strong></span>
        {!isProforma && <span>Received: <strong style={{ color: '#065F46' }}>{money(received)}</strong></span>}
        {balance > MONEY_EPS && <span>Balance: <strong style={{ color: '#991B1B' }}>{money(balance)}</strong></span>}
        {doc.sourceProformaNo && <span>Against proforma: <strong style={{ color: 'var(--text)' }}>{doc.sourceProformaNo}</strong></span>}
      </div>

      {error ? (
        <div className="empty-state">
          <div className="empty-state-icon">⚠️</div>
          <div className="empty-state-title">Could not render the preview</div>
          <div className="empty-state-text">{error}</div>
        </div>
      ) : busy || !url ? (
        <div className="empty-state">
          <div className="empty-state-icon">📄</div>
          <div className="empty-state-title">Rendering preview…</div>
        </div>
      ) : (
        <iframe
          title="Document preview"
          src={url}
          style={{ width: '100%', height: '62vh', border: '1px solid var(--border)', borderRadius: 8, background: '#fff' }}
        />
      )}

      <div className="password-hint" style={{ marginTop: 10 }}>
        This is the exact PDF that will be downloaded. Word uses the same layout. Not right? Click Edit to correct it first.
      </div>
    </Modal>
  );
}
