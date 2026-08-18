import { Fragment, useEffect, useMemo, useState } from 'react';
import { useApp } from '../AppContext';
import { BRANCHES } from '../constants';
import {
  branchLabel, filterByUserBranch, fmtDate, fmtMoneyForRegion, MONEY_EPS, parseDateValue,
  pendingOf, proformaState, receivedOf, regionOf, statusBadgeOf
} from '../utils';
import SortableTh, { sortRows, useSort } from './SortableTh';

export default function InvoiceListPage({
  docType, initialStatus, onNew, onEdit, onDelete, onDownload, onDownloadPdf, onExport, onConvert,
  editingId, editor
}) {
  const { invoices, currentUser } = useApp();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(initialStatus || '');
  const [branch, setBranch] = useState('');
  // Newest first by default, matching how the list behaved before sorting existed.
  const { sort, toggle, setDir } = useSort('invoiceDate', 'desc');

  const isInvoice = docType === 'invoice';

  // Pending amounts and payment states are derived from the whole document set —
  // a proforma's pending amount depends on the tax invoices raised from it.
  const accessors = useMemo(() => ({
    invoiceNo: (d) => d.invoiceNo || '',
    clientName: (d) => d.clientName || '',
    clientGstin: (d) => d.clientGstin || '',
    branch: (d) => branchLabel(d.branch),
    invoiceDate: (d) => parseDateValue(d.invoiceDate),
    description: (d) => (d.description || '') + (d.subType ? ' ' + d.subType : ''),
    totalAmount: (d) => +d.totalAmount || 0,
    pending: (d) => pendingOf(d, invoices),
    status: (d) => statusBadgeOf(d, invoices).label,
    dueDate: (d) => parseDateValue(d.dueDate || d.invoiceDate)
  }), [invoices]);

  const columns = [
    { key: 'invoiceNo', label: 'Invoice No' },
    { key: 'clientName', label: 'Client' },
    { key: 'clientGstin', label: 'GSTIN / TRN' },
    { key: 'branch', label: 'Branch' },
    { key: 'invoiceDate', label: 'Date' },
    { key: 'description', label: 'Description' },
    { key: 'totalAmount', label: 'Total' },
    { key: 'pending', label: isInvoice ? 'Balance' : 'Pending' },
    { key: 'status', label: 'Status' }
  ];
  if (!isInvoice) columns.push({ key: 'dueDate', label: 'Due Date' });

  // Dashboard cards deep-link here with a status pre-selected.
  useEffect(() => { setStatus(initialStatus || ''); }, [initialStatus]);

  const s = search.toLowerCase();
  // Start from the documents this user is allowed to see (based on branchAccess)
  let list = filterByUserBranch(invoices, currentUser).filter((d) => d.docType === docType);
  if (s) {
    list = list.filter((d) =>
      (d.invoiceNo || '').toLowerCase().includes(s) ||
      (d.clientName || '').toLowerCase().includes(s) ||
      (d.clientGstin || '').toLowerCase().includes(s)
    );
  }
  if (status) {
    // 'due' keeps its original meaning — anything still carrying a balance —
    // so the dashboard's Outstanding card lands on part-paid invoices too.
    list = list.filter((d) => {
      const key = statusBadgeOf(d, invoices).key;
      if (status === 'due') return key === 'due' || key === 'partial';
      return key === status;
    });
  }
  if (branch) list = list.filter((d) => d.branch === branch);
  list = sortRows(list, sort, accessors);

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
        <select className="form-input" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All Statuses</option>
          {isInvoice ? (
            <>
              <option value="paid">Cleared</option>
              <option value="partial">Part Paid</option>
              <option value="due">Due (incl. part paid)</option>
            </>
          ) : (
            <>
              <option value="pending">Pending</option>
              <option value="partial">Part Invoiced</option>
              <option value="invoiced">Invoiced</option>
            </>
          )}
        </select>
        <select className="form-input" value={branch} onChange={(e) => setBranch(e.target.value)}>
          <option value="">All Branches</option>
          {BRANCHES.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
        </select>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <SortableTh key={c.key} label={c.label} sortKey={c.key} sort={sort} onSort={toggle} onSetDir={setDir} />
              ))}
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={columns.length + 1}>
                <div className="empty-state">
                  <div className="empty-state-icon">📋</div>
                  <div className="empty-state-title">No {isInvoice ? 'invoices' : 'proformas'} found</div>
                  <div className="empty-state-text">Click &quot;+ New&quot; to create one.</div>
                </div>
              </td></tr>
            ) : list.map((d) => {
              const region = regionOf(d.branch);
              const money = (n) => fmtMoneyForRegion(n, region);
              const pending = pendingOf(d, invoices);
              const badge = statusBadgeOf(d, invoices);
              const isEditingRow = editingId === d.id && !!editor;

              // Proforma rows carry their reconciliation trail: which tax invoices
              // were raised from them and how much of the proforma they covered.
              const pro = isInvoice ? null : proformaState(d, invoices);
              const linkedNos = pro ? pro.linked.map((x) => x.invoiceNo).join(', ') : '';
              const statusTitle = isInvoice
                ? (money(receivedOf(d)) + ' received' + (pending > MONEY_EPS ? ' · ' + money(pending) + ' outstanding' : ''))
                : (pro.invoiced > MONEY_EPS
                  ? money(pro.invoiced) + ' invoiced' + (linkedNos ? ' (' + linkedNos + ')' : '') +
                    (pro.pending > MONEY_EPS ? ' · ' + money(pro.pending) + ' still pending' : '')
                  : 'No tax invoice raised yet');

              return (
                <Fragment key={d.id}>
                <tr className={isEditingRow ? 'row-editing' : undefined}>
                  <td>
                    <strong>{d.invoiceNo}</strong>
                    {isInvoice && d.sourceProformaNo && (
                      <div style={{ fontSize: 10, color: 'var(--muted)' }} title="Raised against this proforma">
                        ← {d.sourceProformaNo}
                      </div>
                    )}
                  </td>
                  <td>{d.clientName || ''}</td>
                  <td style={{ fontSize: 11, color: 'var(--muted)' }}>{d.clientGstin || '-'}</td>
                  <td style={{ fontSize: 12 }}>{branchLabel(d.branch)}</td>
                  <td>{fmtDate(d.invoiceDate)}</td>
                  <td>
                    {d.description || ''}{' '}
                    {d.subType && <span style={{ color: 'var(--muted)', fontSize: 11 }}>({d.subType})</span>}
                  </td>
                  <td><strong>{money(d.totalAmount)}</strong></td>
                  <td style={{ color: pending > MONEY_EPS ? '#991B1B' : 'var(--muted)', fontWeight: pending > MONEY_EPS ? 600 : 400 }}>
                    {money(pending)}
                  </td>
                  <td><span className={'badge ' + badge.cls} title={statusTitle}>{badge.label}</span></td>
                  {!isInvoice && <td>{fmtDate(d.dueDate || d.invoiceDate)}</td>}
                  <td>
                    <div className="actions-cell">
                      {!isInvoice && (
                        pending > MONEY_EPS ? (
                          <button
                            className="icon-btn" style={{ background: '#DBEAFE', color: '#1E40AF' }}
                            onClick={() => onConvert(d.id)}
                            title={'Open a tax invoice for ' + money(pending) + ' pending on this proforma'}
                          >
                            🔄 {pro.invoiced > MONEY_EPS ? 'Convert Balance' : 'Convert'}
                          </button>
                        ) : (
                          <span className="badge badge-paid" title={'Reconciled to tax invoice ' + (linkedNos || '—')}>
                            ✓ Invoiced
                          </span>
                        )
                      )}
                      <button className="icon-btn pdf" onClick={() => onDownload(d.id)} title="Download Word document">📥 Word</button>
                      <button className="icon-btn pdf" onClick={() => onDownloadPdf(d.id)} title="Download PDF document">📄 PDF</button>
                      <button className="icon-btn edit" onClick={() => onEdit(d.id)} title={isEditingRow ? 'Close editor' : 'Edit'}>✏️</button>
                      <button className="icon-btn delete" onClick={() => onDelete(d.id)} title="Delete">🗑</button>
                    </div>
                  </td>
                </tr>
                {isEditingRow && (
                  <tr className="editor-row">
                    <td colSpan={columns.length + 1}>{editor}</td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
