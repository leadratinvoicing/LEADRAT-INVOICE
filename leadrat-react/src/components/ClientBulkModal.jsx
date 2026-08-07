import { useState } from 'react';
import Modal from './Modal';

export default function ClientBulkModal({ open, rows, onClose, onConfirm }) {
  const [busy, setBusy] = useState(false);
  const validCount = rows.filter((r) => r.valid).length;
  const invalidCount = rows.length - validCount;

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }

  const footer = (
    <>
      <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary" onClick={confirm} disabled={busy || validCount === 0}>
        {busy ? 'Importing…' : 'Import ' + validCount + ' Valid Row' + (validCount === 1 ? '' : 's')}
      </button>
    </>
  );

  return (
    <Modal open={open} title="Bulk Client Upload — Preview" onClose={onClose} maxWidth={1100} footer={footer}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
          <div className="stat-card cleared">
            <div className="stat-label">Total Rows</div>
            <div className="stat-value" style={{ fontSize: 22 }}>{rows.length}</div>
          </div>
          <div className="stat-card cleared">
            <div className="stat-label">Valid (will import)</div>
            <div className="stat-value" style={{ fontSize: 22, color: 'var(--success)' }}>{validCount}</div>
          </div>
          <div className="stat-card due">
            <div className="stat-label">Skipped</div>
            <div className="stat-value" style={{ fontSize: 22, color: 'var(--warning)' }}>{invalidCount}</div>
          </div>
        </div>
      </div>
      <div className="table-wrap" style={{ maxHeight: 420, overflow: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: 32 }}>#</th>
              <th>Client Name</th><th>Legal Name</th><th>Address</th><th>City</th><th>GSTIN</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={r.valid ? undefined : { background: '#FEF3C7' }}>
                <td style={{ fontSize: 11, color: '#6B7280' }}>{r.rowNo}</td>
                <td>{r.name}</td>
                <td>{r.legalName}</td>
                <td style={{ fontSize: 12 }}>{r.address}</td>
                <td>{r.city}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.gstin}</td>
                <td>
                  {r.valid
                    ? <span style={{ color: 'var(--success)', fontWeight: 600 }}>✓ Will import</span>
                    : <span style={{ color: 'var(--warning)', fontSize: 11 }}>⚠ {r.errors.join('; ')}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
