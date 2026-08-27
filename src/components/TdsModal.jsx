import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../AppContext';
import Modal from './Modal';
import { dateToInput, fmtDate, fmtMoneyR, visibleDocsFor } from '../utils';

export default function TdsModal({ open, onClose, onSave, onEditInvoice }) {
  const { invoices, currentUser } = useApp();
  const [pending, setPending] = useState({});
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [rateFilter, setRateFilter] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setPending({}); setSearch(''); setStatusFilter(''); setRateFilter(''); } }, [open]);

  // Tax invoices only — proformas have no TDS.
  const baseRows = useMemo(() => visibleDocsFor(invoices, currentUser)
    .filter((d) => d.docType === 'invoice')
    .map((d) => {
      const rate = +d.tdsRate || 0;
      const calculated = (+d.netAmount || 0) * rate / 100;
      return {
        id: d.id,
        invoiceNo: d.invoiceNo,
        clientName: d.clientName,
        invoiceDate: d.invoiceDate,
        netAmount: +d.netAmount || 0,
        tdsRate: rate,
        tdsAmount: +d.tdsAmount || calculated,
        tdsStatus: d.tdsStatus || 'pending',
        tdsReceivedDate: d.tdsReceivedDate || ''
      };
    }), [invoices, currentUser]);

  const allRows = baseRows.map((r) => (pending[r.id] ? { ...r, ...pending[r.id] } : r));

  const s = search.toLowerCase();
  let rows = allRows;
  if (s) rows = rows.filter((r) => (r.invoiceNo || '').toLowerCase().includes(s) || (r.clientName || '').toLowerCase().includes(s));
  if (statusFilter) rows = rows.filter((r) => r.tdsStatus === statusFilter);
  if (rateFilter) rows = rows.filter((r) => String(r.tdsRate) === rateFilter);
  rows = [...rows].sort((a, b) => new Date(b.invoiceDate || 0) - new Date(a.invoiceDate || 0));

  const totalExpected = allRows.reduce((sum, r) => sum + r.tdsAmount, 0);
  const totalReceived = allRows.filter((r) => r.tdsStatus === 'received').reduce((sum, r) => sum + r.tdsAmount, 0);
  const totalPending = allRows.filter((r) => r.tdsStatus === 'pending').reduce((sum, r) => sum + r.tdsAmount, 0);
  const totalNA = allRows.filter((r) => r.tdsStatus === 'not_applicable').length;

  function onRowChange(invoiceId, field, value) {
    setPending((p) => {
      const next = { ...p, [invoiceId]: { ...(p[invoiceId] || {}) } };
      if (field === 'tdsRate') {
        const rate = parseFloat(value) || 0;
        next[invoiceId].tdsRate = rate;
        const inv = invoices.find((x) => x.id === invoiceId);
        next[invoiceId].tdsAmount = (inv ? +inv.netAmount || 0 : 0) * rate / 100;
      } else {
        next[invoiceId][field] = value;
      }
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      await onSave(pending);
      setPending({});
    } finally {
      setSaving(false);
    }
  }

  const footer = (
    <>
      <button className="btn btn-secondary" onClick={onClose}>Close</button>
      <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save All TDS Changes'}</button>
    </>
  );

  return (
    <Modal open={open} title="TDS Management — All Clients" onClose={onClose} maxWidth={1100} footer={footer}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 16 }}>
        <div className="stat-card tax"><div className="stat-label">Total TDS Expected</div><div className="stat-value" style={{ fontSize: 18 }}>{fmtMoneyR(totalExpected)}</div></div>
        <div className="stat-card cleared"><div className="stat-label">TDS Received</div><div className="stat-value" style={{ fontSize: 18 }}>{fmtMoneyR(totalReceived)}</div></div>
        <div className="stat-card due"><div className="stat-label">TDS Pending</div><div className="stat-value" style={{ fontSize: 18 }}>{fmtMoneyR(totalPending)}</div></div>
        <div className="stat-card"><div className="stat-label">Not Applicable</div><div className="stat-value" style={{ fontSize: 18 }}>{totalNA} invoices</div></div>
      </div>

      <div className="filter-bar">
        <input type="text" className="form-input search-input" placeholder="Search invoice no or client..."
          value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="form-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All TDS Status</option>
          <option value="pending">Pending</option>
          <option value="received">Received</option>
          <option value="not_applicable">Not Applicable</option>
        </select>
        <select className="form-input" value={rateFilter} onChange={(e) => setRateFilter(e.target.value)}>
          <option value="">All Rates</option>
          <option value="2">2%</option>
          <option value="10">10%</option>
        </select>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Invoice No</th><th>Client</th><th>Date</th><th>Net Amount</th><th>TDS Rate</th>
              <th>TDS Amount</th><th>TDS Status</th><th>Received Date</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={9}>
                <div className="empty-state">
                  <div className="empty-state-icon">💰</div>
                  <div className="empty-state-title">No TDS records to show</div>
                  <div className="empty-state-text">Set a TDS rate on an invoice to track it here.</div>
                </div>
              </td></tr>
            ) : rows.map((r) => (
              <tr key={r.id}>
                <td><strong>{r.invoiceNo}</strong></td>
                <td>{r.clientName || ''}</td>
                <td style={{ fontSize: 12 }}>{fmtDate(r.invoiceDate)}</td>
                <td>{fmtMoneyR(r.netAmount)}</td>
                <td>
                  <select className="form-input" style={{ padding: '6px 8px', fontSize: 12 }}
                    value={String(r.tdsRate)} onChange={(e) => onRowChange(r.id, 'tdsRate', e.target.value)}>
                    <option value="0">No TDS (0%)</option>
                    <option value="2">2%</option>
                    <option value="10">10%</option>
                  </select>
                </td>
                <td><strong style={{ color: r.tdsStatus === 'received' ? 'var(--success)' : 'var(--warning)' }}>{fmtMoneyR(r.tdsAmount)}</strong></td>
                <td>
                  <select className="form-input" style={{ padding: '6px 8px', fontSize: 12 }}
                    value={r.tdsStatus} onChange={(e) => onRowChange(r.id, 'tdsStatus', e.target.value)}>
                    <option value="pending">Pending</option>
                    <option value="received">Received</option>
                    <option value="not_applicable">Not Applicable</option>
                  </select>
                </td>
                <td>
                  <input type="date" className="form-input" style={{ padding: '6px 8px', fontSize: 12 }}
                    value={dateToInput(r.tdsReceivedDate) || ''}
                    disabled={r.tdsStatus !== 'received'}
                    onChange={(e) => onRowChange(r.id, 'tdsReceivedDate', e.target.value)} />
                </td>
                <td>
                  <div className="actions-cell">
                    <button className="icon-btn edit" onClick={() => onEditInvoice(r.id)} title="Edit invoice">✏️</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
