import { Fragment, useEffect, useMemo, useState } from 'react';
import { useApp } from '../AppContext';
import { BRANCHES } from '../constants';
import {
  assigneeLabel, branchLabel, dataScopeOf, filterByDateRange, fmtDate, fmtMoneyForRegion, MONEY_EPS,
  parseDateValue, pendingOf, proformaState, receivedOf, regionOf, sameEmail, statusBadgeOf, visibleDocsFor
} from '../utils';
import DateRangeFilter from './DateRangeFilter';
import SortableTh, { sortRows, useSort } from './SortableTh';

/**
 * The branch filter also offers the two regions, so a dashboard card opened from
 * the India or Dubai tab lands on exactly that region's documents.
 */
const BRANCH_FILTERS = [
  { value: 'india', label: '🇮🇳 India (Pune + Bengaluru)' },
  ...BRANCHES.map((b) => ({ value: b.value, label: b.label }))
];

export default function InvoiceListPage({
  docType, initialStatus, initialRegion, onNew, onEdit, onDelete, onPreview, onDownload, onDownloadPdf,
  onExport, onConvert, onAssign, canAssign, editingId, editor
}) {
  const { invoices, users, currentUser } = useApp();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(initialStatus || '');
  const [branch, setBranch] = useState(initialRegion || '');
  // Invoice-date window — both bounds optional, empty means all time.
  const [range, setRange] = useState({ from: '', to: '' });
  // 'mine' / 'assigned' narrow further inside whatever the user can already see.
  const [ownership, setOwnership] = useState('');
  // Newest first by default, matching how the list behaved before sorting existed.
  const { sort, toggle, setDir } = useSort('invoiceDate', 'desc');

  const isInvoice = docType === 'invoice';
  // Users on the narrow scope are told why the list is shorter than they expect.
  const narrowScope = dataScopeOf(currentUser) === 'own';

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
    createdBy: (d) => d.createdBy || '',
    assignedTo: (d) => assigneeLabel(d, users) || '',
    dueDate: (d) => parseDateValue(d.dueDate || d.invoiceDate)
  }), [invoices, users]);

  const columns = [
    { key: 'invoiceNo', label: 'Invoice No' },
    { key: 'clientName', label: 'Client' },
    { key: 'clientGstin', label: 'GSTIN / TRN' },
    { key: 'branch', label: 'Branch' },
    { key: 'invoiceDate', label: 'Date' },
    { key: 'description', label: 'Description' },
    { key: 'totalAmount', label: 'Total' },
    { key: 'pending', label: 'Pending' },
    { key: 'status', label: 'Status' }
  ];
  if (!isInvoice) columns.push({ key: 'dueDate', label: 'Due Date' });
  columns.push({ key: 'createdBy', label: 'Created By' });
  columns.push({ key: 'assignedTo', label: 'Assigned To' });

  // Dashboard cards deep-link here with a status and/or a region pre-applied.
  useEffect(() => { setStatus(initialStatus || ''); }, [initialStatus]);
  useEffect(() => { setBranch(initialRegion || ''); }, [initialRegion]);

  const s = search.toLowerCase();
  // Start from the documents this user is allowed to see (based on branchAccess)
  let list = visibleDocsFor(invoices, currentUser).filter((d) => d.docType === docType);
  if (s) {
    list = list.filter((d) =>
      (d.invoiceNo || '').toLowerCase().includes(s) ||
      (d.clientName || '').toLowerCase().includes(s) ||
      (d.clientGstin || '').toLowerCase().includes(s) ||
      (d.createdBy || '').toLowerCase().includes(s)
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
  // 'india' is the two Indian branches together; anything else is a single branch.
  if (branch === 'india') list = list.filter((d) => d.branch !== 'dubai');
  else if (branch) list = list.filter((d) => d.branch === branch);
  if (ownership === 'mine') list = list.filter((d) => sameEmail(d.createdByEmail, currentUser && currentUser.email));
  else if (ownership === 'assigned') list = list.filter((d) => sameEmail(d.assignedTo, currentUser && currentUser.email));
  else if (ownership === 'unassigned') list = list.filter((d) => !d.assignedTo);
  list = filterByDateRange(list, range.from, range.to);
  list = sortRows(list, sort, accessors);

  // Headline figures for whatever the filters currently select.
  const rangeTotal = list.reduce((acc, d) => acc + (+d.totalAmount || 0), 0);

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
          placeholder={isInvoice ? 'Search invoice no, client, GSTIN, creator...' : 'Search proforma no, client, creator...'}
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
              <option value="awaiting">Awaiting Payment</option>
              <option value="invoiced">Invoiced</option>
            </>
          )}
        </select>
        <select className="form-input" value={branch} onChange={(e) => setBranch(e.target.value)}>
          <option value="">All Branches</option>
          {BRANCH_FILTERS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
        </select>
        <select className="form-input" value={ownership} onChange={(e) => setOwnership(e.target.value)}>
          <option value="">Anyone</option>
          <option value="mine">Raised by me</option>
          <option value="assigned">Assigned to me</option>
          <option value="unassigned">Unassigned</option>
        </select>
      </div>

      {narrowScope && (
        <div style={{ background: 'var(--brand-light)', border: '1px solid #BFE7E1', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: 'var(--brand-dark)' }}>
          🔒 You are seeing the {isInvoice ? 'invoices' : 'proformas'} you raised, plus anything assigned to you.
        </div>
      )}

      <DateRangeFilter
        from={range.from} to={range.to} onChange={setRange}
        label="Invoice date"
        count={list.length}
        noun={(isInvoice ? 'tax invoice' : 'proforma') + (list.length === 1 ? '' : 's') +
          ' raised · ' + fmtMoneyForRegion(rangeTotal, branch === 'dubai' ? 'dubai' : 'india') + ' billed'}
      />

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
              // were raised from them, how much they covered and what came in.
              const pro = isInvoice ? null : proformaState(d, invoices);
              const linkedNos = pro ? pro.linked.map((x) => x.invoiceNo).join(', ') : '';
              const statusTitle = isInvoice
                ? (money(receivedOf(d)) + ' received' + (pending > MONEY_EPS ? ' · ' + money(pending) + ' outstanding' : ''))
                : (pro.invoiced > MONEY_EPS
                  ? money(pro.invoiced) + ' invoiced' + (linkedNos ? ' (' + linkedNos + ')' : '') +
                    ' · ' + money(pro.received) + ' received' +
                    (pro.pending > MONEY_EPS ? ' · ' + money(pro.pending) + ' still to be received' : '')
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
                    {!isInvoice && linkedNos && (
                      <div style={{ fontSize: 10, color: 'var(--muted)' }} title="Tax invoice raised from this proforma">
                        → {linkedNos}
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
                  <td
                    style={{ color: pending > MONEY_EPS ? '#991B1B' : 'var(--muted)', fontWeight: pending > MONEY_EPS ? 600 : 400 }}
                    title={pending > MONEY_EPS ? money(pending) + ' still to be received' : 'Fully received'}
                  >
                    {money(pending)}
                  </td>
                  <td><span className={'badge ' + badge.cls} title={statusTitle}>{badge.label}</span></td>
                  {!isInvoice && <td>{fmtDate(d.dueDate || d.invoiceDate)}</td>}
                  <td
                    style={{ fontSize: 12 }}
                    title={(d.createdByEmail || '') +
                      (d.updatedBy && d.updatedBy !== d.createdBy ? ' · last edited by ' + d.updatedBy : '')}
                  >
                    {d.createdBy || '—'}
                  </td>
                  <td style={{ fontSize: 12 }} title={d.assignmentNote || undefined}>
                    {d.assignedTo
                      ? <span className="badge badge-invoice">{assigneeLabel(d, users)}</span>
                      : <span style={{ color: 'var(--muted)' }}>—</span>}
                  </td>
                  <td>
                    <div className="actions-cell">
                      {!isInvoice && (
                        pro.unbilled > MONEY_EPS ? (
                          <button
                            className="icon-btn convert" onClick={() => onConvert(d.id)}
                            title={(pro.invoiced > MONEY_EPS ? 'Convert balance — raise' : 'Convert — raise') +
                              ' a tax invoice for ' + money(pro.unbilled) + ' not yet invoiced on this proforma'}
                          >
                            🔄
                          </button>
                        ) : (
                          <span className="icon-btn" style={{ color: 'var(--success)', cursor: 'default' }}
                            title={'Fully invoiced · reconciled to ' + (linkedNos || '—')}>
                            ✓
                          </span>
                        )
                      )}
                      {canAssign && (
                        <button
                          className={'icon-btn' + (d.assignedTo ? ' assigned' : '')}
                          onClick={() => onAssign(d.id)}
                          title={d.assignedTo ? 'Assigned to ' + assigneeLabel(d, users) + ' — click to change' : 'Assign to a user'}
                        >
                          👤
                        </button>
                      )}
                      <button className="icon-btn preview" onClick={() => onPreview(d.id)}
                        title="Preview before downloading">👁</button>
                      <button className="icon-btn word" onClick={() => onDownload(d.id)}
                        title="Download Word document">📘</button>
                      <button className="icon-btn pdf" onClick={() => onDownloadPdf(d.id)}
                        title="Download PDF document">📕</button>
                      <button className="icon-btn edit" onClick={() => onEdit(d.id)}
                        title={isEditingRow ? 'Close editor' : 'Edit'}>✏️</button>
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
