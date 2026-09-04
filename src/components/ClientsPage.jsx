import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../AppContext';
import {
  branchLabel, clientRegionMap, fmtDate, fmtMoneyForRegion, parseDateValue, regionOf,
  statusBadgeOf, visibleClientsFor, visibleDocsFor
} from '../utils';
import { clientGstins } from '../clientGst';
import SortableTh, { sortRows, useSort } from './SortableTh';

const COLUMNS = [
  { key: 'name', label: 'Client Name' },
  { key: 'gstin', label: 'GSTIN' },
  { key: 'region', label: 'Region' },
  { key: 'city', label: 'City' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Contact No' },
  { key: 'address', label: 'Address' },
  { key: 'invoiceCount', label: 'Invoices' }
];

const REGION_BADGE_STYLE = {
  india: { background: '#DBEAFE', color: '#1E40AF' },
  dubai: { background: '#FEF3C7', color: '#92400E' }
};

export default function ClientsPage({ initialRegion, onAdd, onEdit, onDelete, onDownloadTemplate, onBulkFile, onOpenDocuments, can }) {
  const { clients, invoices, currentUser } = useApp();
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState(initialRegion || '');
  const { sort, toggle, setDir } = useSort('name', 'asc');
  const fileRef = useRef(null);
  // Which client's document history is expanded under its row. One at a time.
  const [expandedId, setExpandedId] = useState(null);

  // A dashboard "Total Clients" card deep-links here with a region pre-selected.
  useEffect(() => { setRegion(initialRegion || ''); }, [initialRegion]);

  // Invoice counts once per render instead of a scan per row.
  const invoiceCounts = useMemo(() => {
    const m = new Map();
    for (const d of invoices) {
      if (!d.clientId) continue;
      const row = m.get(d.clientId) || { invoice: 0, proforma: 0, total: 0 };
      if (d.docType === 'proforma') row.proforma += 1; else row.invoice += 1;
      row.total += 1;
      m.set(d.clientId, row);
    }
    return m;
  }, [invoices]);

  const countsFor = (id) => invoiceCounts.get(id) || { invoice: 0, proforma: 0, total: 0 };

  /**
   * Every document each client has, newest first. Built from the documents this
   * user is allowed to see, so the expanded history never reveals more than the
   * Invoices page itself would.
   */
  const docsByClient = useMemo(() => {
    const m = new Map();
    for (const d of visibleDocsFor(invoices, currentUser)) {
      if (!d.clientId) continue;
      if (!m.has(d.clientId)) m.set(d.clientId, []);
      m.get(d.clientId).push(d);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => (parseDateValue(b.invoiceDate) || 0) - (parseDateValue(a.invoiceDate) || 0));
    }
    return m;
  }, [invoices, currentUser]);

  // Each client's regions, derived from the branches of their invoices. A client
  // can be in India, Dubai, both, or neither (no invoices yet).
  const clientRegions = useMemo(() => clientRegionMap(invoices), [invoices]);

  const regionsOf = (id) => clientRegions.get(id);
  const regionText = (id) => {
    const regs = regionsOf(id);
    if (!regs || regs.size === 0) return '';
    return [regs.has('india') ? 'India' : '', regs.has('dubai') ? 'Dubai' : ''].filter(Boolean).join(', ');
  };

  const accessors = {
    name: (c) => c.name || '',
    gstin: (c) => c.gstin || '',
    region: (c) => regionText(c.id),
    city: (c) => c.city || '',
    email: (c) => c.email || '',
    phone: (c) => c.phone || '',
    address: (c) => c.address || '',
    invoiceCount: (c) => countsFor(c.id).total
  };

  // Branch access first — non-admins only see clients tied to their allowed
  // branches. Admins see all clients regardless.
  let list = visibleClientsFor(clients, invoices, currentUser);

  // Region filter dropdown (independent of branch access, applied above)
  if (region === 'india' || region === 'dubai') {
    list = list.filter((c) => regionsOf(c.id)?.has(region));
  } else if (region === 'none') {
    list = list.filter((c) => !clientRegions.has(c.id));
  }

  const s = search.toLowerCase();
  if (s) {
    list = list.filter((c) =>
      (c.name || '').toLowerCase().includes(s) ||
      clientGstins(c).some((r) => (r.gstin || '').toLowerCase().includes(s)) ||
      (c.city || '').toLowerCase().includes(s) ||
      (c.email || '').toLowerCase().includes(s) ||
      (c.phone || '').toLowerCase().includes(s)
    );
  }
  list = sortRows(list, sort, accessors);

  /** Nicely-labelled region badge for a client. */
  const regionBadge = (id) => {
    const regs = regionsOf(id);
    if (!regs || regs.size === 0) return <span style={{ color: 'var(--muted)', fontSize: 9.1 }}>—</span>;
    const parts = [];
    if (regs.has('india')) parts.push(['india', '🇮🇳 India']);
    if (regs.has('dubai')) parts.push(['dubai', '🇦🇪 Dubai']);
    return parts.map(([key, label]) => (
      <span key={key} style={{ ...REGION_BADGE_STYLE[key], padding: '2px 6px', borderRadius: 10, fontSize: 9.1, marginRight: 4 }}>
        {label}
      </span>
    ));
  };

  // Presentation only — MainApp re-checks each action when it fires.
  const may = (action) => (can ? can('clients', action) : true);

  return (
    <div className="page show">
      <div className="page-header">
        <div>
          <div className="page-title">Clients</div>
          <div className="page-subtitle">Manage your client database</div>
        </div>
        <div className="page-actions">
          {may('create') && (<>
          <button className="btn btn-secondary" onClick={onDownloadTemplate} title="Download Excel template for bulk client upload">📥 Download Template</button>
          <button className="btn btn-secondary" onClick={() => fileRef.current && fileRef.current.click()} title="Upload Excel file with multiple clients">📤 Bulk Upload</button>
          </>)}
          <input
            ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files && e.target.files[0];
              e.target.value = '';
              if (file) onBulkFile(file);
            }}
          />
          {may('create') && <button className="btn btn-primary" onClick={onAdd}>+ Add Client</button>}
        </div>
      </div>

      <div className="filter-bar">
        <input type="text" className="form-input search-input" placeholder="Search clients by name, GSTIN, city, email, or contact no..."
          value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="form-input" value={region} onChange={(e) => setRegion(e.target.value)}>
          <option value="">🌐 All Regions</option>
          <option value="india">🇮🇳 India (Pune + Bengaluru)</option>
          <option value="dubai">🇦🇪 Dubai</option>
          <option value="none">— No invoices yet</option>
        </select>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <SortableTh key={c.key} label={c.label} sortKey={c.key} sort={sort} onSort={toggle} onSetDir={setDir} />
              ))}
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={COLUMNS.length + 1}>
                <div className="empty-state">
                  <div className="empty-state-icon">👥</div>
                  <div className="empty-state-title">No clients found</div>
                  <div className="empty-state-text">Try adjusting the region filter, or add clients via + Add Client / Bulk Upload.</div>
                </div>
              </td></tr>
            ) : list.map((c) => {
              const counts = countsFor(c.id);
              const addr = c.address || '';
              const isOpen = expandedId === c.id;
              const clientDocs = docsByClient.get(c.id) || [];
              return (
                <Fragment key={c.id}>
                <tr className={isOpen ? 'client-row-open' : undefined}>
                  <td>
                    <button
                      type="button"
                      className="client-name-toggle"
                      onClick={() => setExpandedId(isOpen ? null : c.id)}
                      title={counts.total
                        ? (isOpen ? 'Hide' : 'Show') + ' the ' + counts.total + ' document' + (counts.total === 1 ? '' : 's') + ' raised for ' + c.name
                        : 'No documents raised for ' + c.name + ' yet'}
                    >
                      <span className={'client-caret' + (isOpen ? ' open' : '')}>▸</span>
                      <strong>{c.name}</strong>
                    </button>
                    {c.legalName && c.legalName !== c.name && (
                      <div style={{ fontSize: 9.1, color: 'var(--muted)', paddingLeft: 16 }}>{c.legalName}</div>
                    )}
                  </td>
                  <td style={{ fontSize: 10, fontFamily: 'monospace' }}>
                    {clientGstins(c).filter((r) => r.gstin).length === 0 ? '-' : clientGstins(c)
                      .filter((r) => r.gstin)
                      .map((r) => (
                        <div key={r.id} title={r.label + (r.address ? ' — ' + r.address : '')}
                          style={{ whiteSpace: 'nowrap' }}>
                          {r.gstin}
                          {r.isDefault && clientGstins(c).length > 1 && (
                            <span style={{ color: 'var(--brand-dark)', fontSize: 8.5 }}> ★</span>
                          )}
                        </div>
                      ))}
                  </td>
                  <td>{regionBadge(c.id)}</td>
                  <td style={{ fontSize: 10 }}>{c.city || '-'}</td>
                  <td style={{ fontSize: 10 }}>
                    {c.email ? <a href={'mailto:' + c.email} style={{ color: 'var(--brand-dark)' }}>{c.email}</a> : '-'}
                  </td>
                  <td style={{ fontSize: 10, whiteSpace: 'nowrap' }}>
                    {c.phone ? <a href={'tel:' + c.phone.replace(/\s+/g, '')} style={{ color: 'var(--brand-dark)' }}>{c.phone}</a> : '-'}
                  </td>
                  <td style={{ fontSize: 10, color: 'var(--muted)', maxWidth: 280 }}>
                    {addr.substring(0, 80)}{addr.length > 80 ? '…' : ''}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {counts.total === 0 ? (
                      <span style={{ color: 'var(--muted)' }}>—</span>
                    ) : (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {counts.invoice > 0 && (
                          <button
                            type="button" className="doc-count invoice"
                            onClick={() => onOpenDocuments && onOpenDocuments('invoices', c.id)}
                            title={'Open the ' + counts.invoice + ' tax invoice' + (counts.invoice === 1 ? '' : 's') + ' raised for ' + c.name}
                          >
                            {counts.invoice} Tax
                          </button>
                        )}
                        {counts.proforma > 0 && (
                          <button
                            type="button" className="doc-count proforma"
                            onClick={() => onOpenDocuments && onOpenDocuments('proforma', c.id)}
                            title={'Open the ' + counts.proforma + ' proforma' + (counts.proforma === 1 ? '' : 's') + ' raised for ' + c.name}
                          >
                            {counts.proforma} Pro
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  <td>
                    <div className="actions-cell">
                      {may('edit') && <button className="icon-btn edit" onClick={() => onEdit(c.id)} title="Edit">✏️</button>}
                      {may('delete') && <button className="icon-btn delete" onClick={() => onDelete(c.id)} title="Delete">🗑</button>}
                    </div>
                  </td>
                </tr>

                {isOpen && (
                  <tr className="client-docs-row">
                    <td colSpan={COLUMNS.length + 1}>
                      <div className="client-docs">
                        <div className="client-docs-head">
                          <strong>{c.name}</strong>
                          <span>
                            {counts.total === 0
                              ? 'No documents raised yet'
                              : counts.invoice + ' tax invoice' + (counts.invoice === 1 ? '' : 's') +
                                ' · ' + counts.proforma + ' proforma' + (counts.proforma === 1 ? '' : 's')}
                          </span>
                          {clientDocs.length > 0 && (
                            <button type="button" className="client-docs-open"
                              onClick={() => onOpenDocuments && onOpenDocuments('invoices', c.id)}>
                              Open in Invoices →
                            </button>
                          )}
                        </div>

                        {clientDocs.length === 0 ? (
                          <div className="client-docs-empty">
                            Nothing raised for this client yet
                            {counts.total > 0 ? ' that you have access to.' : '.'}
                          </div>
                        ) : (
                          <table className="client-docs-table">
                            <thead>
                              <tr>
                                <th>Document No</th><th>Type</th><th>Date</th><th>Description</th>
                                <th>Branch</th><th style={{ textAlign: 'right' }}>Total</th><th>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {clientDocs.map((d) => {
                                const badge = statusBadgeOf(d, invoices);
                                return (
                                  <tr key={d.id}
                                    onClick={() => onOpenDocuments && onOpenDocuments(d.docType === 'proforma' ? 'proforma' : 'invoices', c.id)}
                                    title={'Open ' + (d.invoiceNo || 'this document') + ' in the ' +
                                      (d.docType === 'proforma' ? 'Proforma' : 'Invoices') + ' list'}
                                  >
                                    <td><strong>{d.invoiceNo || '—'}</strong></td>
                                    <td>
                                      <span className={'badge ' + (d.docType === 'invoice' ? 'badge-invoice' : 'badge-proforma')}>
                                        {d.docType === 'invoice' ? 'Invoice' : 'Proforma'}
                                      </span>
                                    </td>
                                    <td>{fmtDate(d.invoiceDate)}</td>
                                    <td>
                                      {d.description || ''}
                                      {d.subType && <span style={{ color: 'var(--muted)' }}> ({d.subType})</span>}
                                    </td>
                                    <td>{branchLabel(d.branch)}</td>
                                    <td style={{ textAlign: 'right' }}>
                                      <strong>{fmtMoneyForRegion(d.totalAmount, regionOf(d.branch))}</strong>
                                    </td>
                                    <td><span className={'badge ' + badge.cls}>{badge.label}</span></td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </td>
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
