import { useEffect, useState } from 'react';
import { useApp } from '../AppContext';
import { BRANCHES } from '../constants';
import { branchLabel, fmtDate, fmtMoneyForRegion, regionOf } from '../utils';

export default function InvoiceListPage({
  docType, initialStatus, onNew, onEdit, onDelete, onDownload, onExport, onConvert
}) {
  const { invoices } = useApp();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(initialStatus || '');
  const [branch, setBranch] = useState('');

  const isInvoice = docType === 'invoice';

  // Dashboard cards deep-link here with a status pre-selected.
  useEffect(() => { setStatus(initialStatus || ''); }, [initialStatus]);

  const s = search.toLowerCase();
  let list = invoices.filter((d) => d.docType === docType);
  if (s) {
    list = list.filter((d) =>
      (d.invoiceNo || '').toLowerCase().includes(s) ||
      (d.clientName || '').toLowerCase().includes(s) ||
      (d.clientGstin || '').toLowerCase().includes(s)
    );
  }
  if (isInvoice && status) list = list.filter((d) => d.status === status);
  if (isInvoice && branch) list = list.filter((d) => d.branch === branch);
  list = [...list].sort((a, b) => new Date(b.invoiceDate || 0) - new Date(a.invoiceDate || 0));

  return (
    <div className="page show">
      <div className="page-header">
        <div>
          <div className="page-title">{isInvoice ? 'Tax Invoices' : 'Proforma Invoices'}</div>
          <div className="page-subtitle">{isInvoice ? 'Manage all tax invoices' : 'Generate and manage proforma invoices'}</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={() => onExport(docType)}>Export Excel</button>
          <button className="btn btn-primary" onClick={() => onNew(docType)}>+ New {isInvoice ? 'Invoice' : 'Proforma'}</button>
        </div>
      </div>

      <div className="filter-bar">
        <input
          type="text" className="form-input search-input"
          placeholder={isInvoice ? 'Search invoice no, client, GSTIN...' : 'Search proforma no, client...'}
          value={search} onChange={(e) => setSearch(e.target.value)}
        />
        {isInvoice && (
          <>
            <select className="form-input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All Statuses</option>
              <option value="paid">Paid</option>
              <option value="due">Due</option>
            </select>
            <select className="form-input" value={branch} onChange={(e) => setBranch(e.target.value)}>
              <option value="">All Branches</option>
              {BRANCHES.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          </>
        )}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Invoice No</th>
              <th>Client</th>
              <th>GSTIN / TRN</th>
              <th>Branch</th>
              <th>Date</th>
              <th>Description</th>
              <th>{isInvoice ? 'Total' : 'Total Due'}</th>
              <th>{isInvoice ? 'Status' : 'Due Date'}</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={9}>
                <div className="empty-state">
                  <div className="empty-state-icon">📋</div>
                  <div className="empty-state-title">No {isInvoice ? 'invoices' : 'proformas'} found</div>
                  <div className="empty-state-text">Click &quot;+ New&quot; to create one.</div>
                </div>
              </td></tr>
            ) : list.map((d) => {
              const convertedTo = d.convertedToInvoiceId
                ? invoices.find((x) => x.id === d.convertedToInvoiceId)
                : null;
              return (
                <tr key={d.id}>
                  <td><strong>{d.invoiceNo}</strong></td>
                  <td>{d.clientName || ''}</td>
                  <td style={{ fontSize: 11, color: 'var(--muted)' }}>{d.clientGstin || '-'}</td>
                  <td style={{ fontSize: 12 }}>{branchLabel(d.branch)}</td>
                  <td>{fmtDate(d.invoiceDate)}</td>
                  <td>
                    {d.description || ''}{' '}
                    {d.subType && <span style={{ color: 'var(--muted)', fontSize: 11 }}>({d.subType})</span>}
                  </td>
                  <td><strong>{fmtMoneyForRegion(d.totalAmount, regionOf(d.branch))}</strong></td>
                  {isInvoice ? (
                    <td><span className={'badge ' + (d.status === 'paid' ? 'badge-paid' : 'badge-due')}>{d.status === 'paid' ? 'Cleared' : 'Due'}</span></td>
                  ) : (
                    <td>{fmtDate(d.dueDate || d.invoiceDate)}</td>
                  )}
                  <td>
                    <div className="actions-cell">
                      {!isInvoice && (
                        d.convertedToInvoiceId ? (
                          <span className="badge badge-paid" title={'Reconciled to tax invoice ' + (convertedTo ? convertedTo.invoiceNo : '')}>
                            ✓ Invoiced
                          </span>
                        ) : (
                          <button
                            className="icon-btn" style={{ background: '#DBEAFE', color: '#1E40AF' }}
                            onClick={() => onConvert(d.id)}
                            title="Reconcile: create linked tax invoice"
                          >
                            🔄 Convert
                          </button>
                        )
                      )}
                      <button className="icon-btn pdf" onClick={() => onDownload(d.id)} title="Download Word document">📥 Word</button>
                      <button className="icon-btn edit" onClick={() => onEdit(d.id)} title="Edit">✏️</button>
                      <button className="icon-btn delete" onClick={() => onDelete(d.id)} title="Delete">🗑</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
