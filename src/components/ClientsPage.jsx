import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../AppContext';
import { clientRegionMap, visibleClientsFor } from '../utils';
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

export default function ClientsPage({ initialRegion, onAdd, onEdit, onDelete, onDownloadTemplate, onBulkFile }) {
  const { clients, invoices, currentUser } = useApp();
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState(initialRegion || '');
  const { sort, toggle, setDir } = useSort('name', 'asc');
  const fileRef = useRef(null);

  // A dashboard "Total Clients" card deep-links here with a region pre-selected.
  useEffect(() => { setRegion(initialRegion || ''); }, [initialRegion]);

  // Invoice counts once per render instead of a scan per row.
  const invoiceCounts = useMemo(() => {
    const m = new Map();
    for (const d of invoices) {
      if (d.clientId) m.set(d.clientId, (m.get(d.clientId) || 0) + 1);
    }
    return m;
  }, [invoices]);

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
    invoiceCount: (c) => invoiceCounts.get(c.id) || 0
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
      (c.gstin || '').toLowerCase().includes(s) ||
      (c.city || '').toLowerCase().includes(s) ||
      (c.email || '').toLowerCase().includes(s) ||
      (c.phone || '').toLowerCase().includes(s)
    );
  }
  list = sortRows(list, sort, accessors);

  /** Nicely-labelled region badge for a client. */
  const regionBadge = (id) => {
    const regs = regionsOf(id);
    if (!regs || regs.size === 0) return <span style={{ color: 'var(--muted)', fontSize: 11 }}>—</span>;
    const parts = [];
    if (regs.has('india')) parts.push(['india', '🇮🇳 India']);
    if (regs.has('dubai')) parts.push(['dubai', '🇦🇪 Dubai']);
    return parts.map(([key, label]) => (
      <span key={key} style={{ ...REGION_BADGE_STYLE[key], padding: '2px 6px', borderRadius: 10, fontSize: 11, marginRight: 4 }}>
        {label}
      </span>
    ));
  };

  return (
    <div className="page show">
      <div className="page-header">
        <div>
          <div className="page-title">Clients</div>
          <div className="page-subtitle">Manage your client database</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={onDownloadTemplate} title="Download Excel template for bulk client upload">📥 Download Template</button>
          <button className="btn btn-secondary" onClick={() => fileRef.current && fileRef.current.click()} title="Upload Excel file with multiple clients">📤 Bulk Upload</button>
          <input
            ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files && e.target.files[0];
              e.target.value = '';
              if (file) onBulkFile(file);
            }}
          />
          <button className="btn btn-primary" onClick={onAdd}>+ Add Client</button>
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
              const count = invoiceCounts.get(c.id) || 0;
              const addr = c.address || '';
              return (
                <tr key={c.id}>
                  <td>
                    <strong>{c.name}</strong>
                    {c.legalName && c.legalName !== c.name && (
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{c.legalName}</div>
                    )}
                  </td>
                  <td style={{ fontSize: 12, fontFamily: 'monospace' }}>{c.gstin || '-'}</td>
                  <td>{regionBadge(c.id)}</td>
                  <td style={{ fontSize: 12 }}>{c.city || '-'}</td>
                  <td style={{ fontSize: 12 }}>
                    {c.email ? <a href={'mailto:' + c.email} style={{ color: 'var(--brand-dark)' }}>{c.email}</a> : '-'}
                  </td>
                  <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                    {c.phone ? <a href={'tel:' + c.phone.replace(/\s+/g, '')} style={{ color: 'var(--brand-dark)' }}>{c.phone}</a> : '-'}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--muted)', maxWidth: 280 }}>
                    {addr.substring(0, 80)}{addr.length > 80 ? '…' : ''}
                  </td>
                  <td>{count}</td>
                  <td>
                    <div className="actions-cell">
                      <button className="icon-btn edit" onClick={() => onEdit(c.id)} title="Edit">✏️</button>
                      <button className="icon-btn delete" onClick={() => onDelete(c.id)} title="Delete">🗑</button>
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
