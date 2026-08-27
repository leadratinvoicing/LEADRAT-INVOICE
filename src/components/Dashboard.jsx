import { useMemo, useRef, useState } from 'react';
import { useApp } from '../AppContext';
import { REGION_TABS } from '../constants';
import {
  branchLabel, dataScopeOf, filterByDateRange, fmtDate, fmtMoneyForRegion, outstandingOf,
  parseDateValue, receivedOf, regionOf, revenueBySubType, round2, statusBadgeOf,
  visibleClientsFor, visibleDocsFor, visibleRegionsForUser
} from '../utils';
import DateRangeFilter from './DateRangeFilter';
import SortableTh, { sortRows, useSort } from './SortableTh';

const RECENT_ACCESSORS = {
  invoiceNo: (d) => d.invoiceNo || '',
  docType: (d) => (d.docType === 'invoice' ? 'Invoice' : 'Proforma'),
  clientName: (d) => d.clientName || '',
  branch: (d) => branchLabel(d.branch),
  invoiceDate: (d) => parseDateValue(d.invoiceDate),
  totalAmount: (d) => +d.totalAmount || 0,
  status: null // filled in per render — a document's state depends on the others
};

const RECENT_COLUMNS = [
  { key: 'invoiceNo', label: 'Invoice No' },
  { key: 'docType', label: 'Type' },
  { key: 'clientName', label: 'Client' },
  { key: 'branch', label: 'Branch' },
  { key: 'invoiceDate', label: 'Date' },
  { key: 'totalAmount', label: 'Total' },
  { key: 'status', label: 'Status' }
];

export default function Dashboard({ onOpenTds, onViewUser, onNavigate, onDownloadBackup, onLoadBackup }) {
  const { invoices, clients, users, currentUser } = useApp();
  const [selectedRegion, setSelectedRegion] = useState('all');
  // Invoice-date window applied to every figure on this page. Empty = all time.
  const [range, setRange] = useState({ from: '', to: '' });
  const backupFileRef = useRef(null);
  // No default column — the table opens in "most recently created first" order.
  const { sort, toggle, setDir } = useSort(null);

  // Only show the region tabs this user's branchAccess allows, and fall back to
  // the first visible one when the selected region is hidden from them.
  const visibleRegions = visibleRegionsForUser(currentUser);
  const regionTabs = REGION_TABS.filter((t) => visibleRegions.has(t.value));
  const region = visibleRegions.has(selectedRegion) ? selectedRegion : regionTabs[0].value;

  // "india" = pune + bengaluru; "dubai" = dubai; "all" = everything.
  const belongsToRegion = (d) => {
    if (region === 'all') return true;
    if (region === 'dubai') return d.branch === 'dubai';
    return d.branch !== 'dubai';
  };

  // Apply the CURRENT USER'S branch access first, then the region filter, then
  // the date window. Reconciliation still reads the FULL document set below, so
  // narrowing the view never makes a proforma look unpaid.
  const userScoped = visibleDocsFor(invoices, currentUser);
  const all = filterByDateRange(userScoped.filter(belongsToRegion), range.from, range.to);
  const inv = all.filter((d) => d.docType === 'invoice');
  const pro = all.filter((d) => d.docType === 'proforma');
  const rangeActive = !!(range.from || range.to);
  const narrowScope = dataScopeOf(currentUser) === 'own';
  // Revenue is the money actually received on tax invoices, so a part payment
  // counts for exactly what came in. Pending amounts are derived per document: a
  // proforma stops being pending for whatever its tax invoices already cover, so
  // converting one never double-counts the same money.
  const totalRev = round2(inv.reduce((s, d) => s + receivedOf(d), 0));
  const invoiceDue = round2(inv.reduce((s, d) => s + outstandingOf(d, invoices), 0));
  const proformaDue = round2(pro.reduce((s, d) => s + outstandingOf(d, invoices), 0));
  const totalDue = round2(invoiceDue + proformaDue);
  // Tax collected follows the receipts too — a part-paid invoice contributes its share.
  const totalGst = round2(inv.reduce((s, d) => {
    const total = +d.totalAmount || 0;
    const tax = (+d.cgst || 0) + (+d.sgst || 0) + (+d.igst || 0);
    if (!total || !tax) return s;
    return s + tax * (receivedOf(d) / total);
  }, 0));
  const totalNet = inv.reduce((s, d) => s + (+d.netAmount || 0), 0);

  // TDS is India-specific — there is no TDS mechanism under UAE VAT.
  const showTds = region !== 'dubai';
  const tdsRecords = inv.map((d) => {
    const rate = +d.tdsRate || 0;
    return { amt: (+d.netAmount || 0) * rate / 100, status: d.tdsStatus || 'pending' };
  }).filter((r) => r.amt > 0);
  const totalTdsExpected = tdsRecords.reduce((s, r) => s + r.amt, 0);
  const totalTdsReceived = tdsRecords.filter((r) => r.status === 'received').reduce((s, r) => s + r.amt, 0);
  const totalTdsPending = totalTdsExpected - totalTdsReceived;

  const isAdmin = currentUser && currentUser.role === 'admin';
  const money = (n) => fmtMoneyForRegion(n, region);

  // Client count filtered strictly by region — the Dubai tab ONLY counts clients
  // with at least one Dubai document, and never falls back to the India list.
  let clientCount;
  if (rangeActive) {
    // A window is in force — count only the clients billed inside it.
    clientCount = new Set(all.map((d) => d.clientId).filter(Boolean)).size;
  } else if (region === 'all') {
    // "All" tab: count clients whose data is visible to this user
    clientCount = visibleClientsFor(clients, invoices, currentUser).length;
  } else {
    // Region-specific tab: unique clients appearing in the region-filtered docs
    clientCount = new Set(all.map((d) => d.clientId).filter(Boolean)).size;
  }

  // Revenue split across the item sub-types billed in the current selection.
  const subTypeRows = useMemo(() => revenueBySubType(inv), [inv]);
  const subTypeTop = subTypeRows.length ? subTypeRows[0].revenue : 0;
  const subTypeTotal = round2(subTypeRows.reduce((s, r) => s + r.revenue, 0));

  const taxLabel = region === 'dubai' ? 'Total VAT Collected' : 'Total GST Collected';
  const taxMeta = region === 'dubai' ? 'VAT @ 5% (Dubai)' : 'CGST+SGST+IGST';

  // Drilling in keeps the region that is selected here: the Dubai tab opens
  // Dubai documents only, the India tab opens Pune + Bengaluru only.
  const regionArg = region === 'all' ? '' : region;
  const regionNote = region === 'all' ? '' : (region === 'dubai' ? ' · Dubai only' : ' · India only');

  const stats = [
    { label: 'Total Invoices', value: inv.length, meta: 'Tax invoices' + (regionNote || ' · click to view'), cls: '', onClick: () => onNavigate('invoices', '', regionArg) },
    { label: 'Total Proformas', value: pro.length, meta: 'Proforma invoices' + (regionNote || ' · click to view'), cls: '', onClick: () => onNavigate('proforma', '', regionArg) },
    { label: 'Total Revenue', value: money(totalRev), meta: 'Payments received, part payments included · click to view', cls: 'cleared', onClick: () => onNavigate('invoices', 'paid', regionArg) },
    { label: 'Total Net Amount', value: money(totalNet), meta: 'Net of tax (all invoices) · click to view', cls: 'cleared', onClick: () => onNavigate('invoices', '', regionArg) },
    { label: taxLabel, value: money(totalGst), meta: taxMeta + ' · click to view', cls: 'tax', onClick: () => onNavigate('invoices', '', regionArg) }
  ];
  if (showTds) {
    stats.push({
      label: 'Total TDS Amount',
      value: money(totalTdsExpected),
      meta: money(totalTdsPending) + ' pending · click to manage',
      cls: 'due',
      onClick: onOpenTds
    });
  }
  stats.push({
    label: 'Outstanding Amount',
    value: money(totalDue),
    meta: money(invoiceDue) + ' on invoices · ' + money(proformaDue) + ' on proformas · click to view',
    cls: 'due',
    onClick: () => onNavigate('invoices', 'due', regionArg)
  });
  // Total Clients card — pass the current region so the Clients page auto-applies
  // the matching filter (clicking "3" on the Dubai tab lands on a Clients page
  // filtered to those 3 Dubai clients, not the full list).
  const clientsRegionArg = (region === 'india' || region === 'dubai') ? region : '';
  stats.push({
    label: 'Total Clients',
    value: clientCount,
    meta: (region === 'all' ? 'In database' : 'In this region') + ' · click to view',
    cls: '',
    onClick: () => onNavigate('clients', clientsRegionArg)
  });

  const showUsersPanel = isAdmin && region === 'all';
  if (showUsersPanel) {
    const activeUsers = users.filter((u) => (u.status || 'active') === 'active').length;
    stats.push({
      label: 'Registered Users',
      value: users.length,
      meta: activeUsers + ' active · click to manage',
      cls: 'tax',
      onClick: () => onNavigate('users')
    });
  }

  const recentUsers = [...users].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 5);
  // Pick the 8 newest documents first, then let the header sort reorder them.
  const recentAccessors = useMemo(
    () => ({ ...RECENT_ACCESSORS, status: (d) => statusBadgeOf(d, invoices).label }),
    [invoices]
  );
  // Normally the 8 newest; with a window in force the point is to see what the
  // window actually contains, so show far more of it.
  const recentLimit = rangeActive ? 50 : 8;
  const recent = sortRows(
    [...all].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, recentLimit),
    sort,
    recentAccessors
  );

  return (
    <div className="page show">
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-subtitle">Overview of your invoicing activity</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn-secondary" onClick={onDownloadBackup} title="Save all data to a JSON file you can share via Drive/WhatsApp/email">
            💾 Download Backup
          </button>
          <button className="btn btn-secondary" onClick={() => backupFileRef.current && backupFileRef.current.click()} title="Restore data from a previously downloaded backup">
            📂 Load Backup
          </button>
          <input
            ref={backupFileRef} type="file" accept=".json,application/json" style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files && e.target.files[0];
              e.target.value = '';
              if (f) onLoadBackup(f);
            }}
          />
        </div>
      </div>

      {/* Region filter — narrows stats and the recent table to one country */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        {regionTabs.map((t) => (
          <button key={t.value} className={'tab' + (region === t.value ? ' active' : '')} onClick={() => setSelectedRegion(t.value)}>
            {t.label}
          </button>
        ))}
      </div>

      {narrowScope && (
        <div style={{ background: 'var(--brand-light)', border: '1px solid #BFE7E1', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: 'var(--brand-dark)' }}>
          🔒 These figures cover the documents you raised, plus anything assigned to you.
        </div>
      )}

      {/* Date window — narrows every card below and the tables that follow */}
      <DateRangeFilter
        from={range.from} to={range.to} onChange={setRange}
        label="Invoice date"
        count={inv.length + pro.length}
        noun={'documents · ' + inv.length + ' tax invoice' + (inv.length === 1 ? '' : 's')
          + ' · ' + pro.length + ' proforma' + (pro.length === 1 ? '' : 's')}
      />

      <div className="stats-grid">
        {stats.map((s, i) => (
          <div key={i} className={'stat-card ' + s.cls + (s.onClick ? ' clickable' : '')} onClick={s.onClick}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-meta">{s.meta}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>Revenue by Sub-type</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            {money(subTypeTotal)} received across {subTypeRows.length} sub-type{subTypeRows.length === 1 ? '' : 's'}
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Sub-type</th>
                <th>Line Items</th>
                <th>Billed</th>
                <th>Revenue</th>
                <th>Share of Revenue</th>
              </tr>
            </thead>
            <tbody>
              {subTypeRows.length === 0 ? (
                <tr><td colSpan={5}>
                  <div className="empty-state">
                    <div className="empty-state-icon">📊</div>
                    <div className="empty-state-title">No tax invoices in this selection</div>
                    <div className="empty-state-text">Widen the date range to see the sub-type breakdown.</div>
                  </div>
                </td></tr>
              ) : subTypeRows.map((r) => {
                const share = subTypeTotal > 0 ? (r.revenue / subTypeTotal) * 100 : 0;
                return (
                  <tr key={r.subType}>
                    <td><strong>{r.subType}</strong></td>
                    <td>{r.count}</td>
                    <td>{money(r.billed)}</td>
                    <td><strong>{money(r.revenue)}</strong></td>
                    <td style={{ minWidth: 160 }}>
                      <div className="subtype-share">{share.toFixed(1)}%</div>
                      <div className="subtype-bar">
                        <span style={{ width: (subTypeTop > 0 ? (r.revenue / subTypeTop) * 100 : 0) + '%' }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10, lineHeight: 1.6 }}>
          Revenue is the money received on tax invoices. An invoice carrying several sub-types splits its
          receipts between them in proportion to what each line was billed, so the rows always add up to
          Total Revenue.
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>
            {rangeActive ? 'Documents in This Range' : 'Recent Documents'}
          </div>
          {all.length > recentLimit && (
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              Showing {recentLimit} of {all.length} — open Invoices or Proforma for the full list
            </div>
          )}
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {RECENT_COLUMNS.map((c) => (
                  <SortableTh key={c.key} label={c.label} sortKey={c.key} sort={sort} onSort={toggle} onSetDir={setDir} />
                ))}
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 ? (
                <tr><td colSpan={7}>
                  <div className="empty-state">
                    <div className="empty-state-icon">📄</div>
                    <div className="empty-state-title">No documents yet</div>
                    <div className="empty-state-text">Create your first invoice to get started.</div>
                  </div>
                </td></tr>
              ) : recent.map((d) => {
                const badge = statusBadgeOf(d, invoices);
                return (
                <tr key={d.id}>
                  <td><strong>{d.invoiceNo || ''}</strong></td>
                  <td><span className={'badge ' + (d.docType === 'invoice' ? 'badge-invoice' : 'badge-proforma')}>{d.docType === 'invoice' ? 'Invoice' : 'Proforma'}</span></td>
                  <td>{d.clientName || ''}</td>
                  <td style={{ fontSize: 12 }}>{branchLabel(d.branch)}</td>
                  <td>{fmtDate(d.invoiceDate)}</td>
                  <td><strong>{fmtMoneyForRegion(d.totalAmount, regionOf(d.branch))}</strong></td>
                  <td><span className={'badge ' + badge.cls}>{badge.label}</span></td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showUsersPanel && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Recent Registered Users</div>
            <button className="btn btn-secondary btn-sm" onClick={() => onNavigate('users')}>View All Users →</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Name</th><th>Username</th><th>Department</th><th>Status</th><th>Joined</th></tr>
              </thead>
              <tbody>
                {recentUsers.length === 0 ? (
                  <tr><td colSpan={5}>
                    <div className="empty-state">
                      <div className="empty-state-icon">👤</div>
                      <div className="empty-state-title">No users have signed up yet</div>
                    </div>
                  </td></tr>
                ) : recentUsers.map((u) => {
                  const status = u.status || 'active';
                  const joined = u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-GB') : '-';
                  return (
                    <tr key={u.email}>
                      <td>
                        <a onClick={() => onViewUser(u.email)} style={{ color: 'var(--brand-dark)', fontWeight: 600, cursor: 'pointer' }}>
                          {u.name || u.email}
                        </a>
                      </td>
                      <td style={{ fontSize: 12 }}>{u.email}</td>
                      <td><span className="badge badge-invoice">{u.department || '-'}</span></td>
                      <td><span className={'badge ' + (status === 'active' ? 'badge-paid' : 'badge-due')}>{status}</span></td>
                      <td style={{ fontSize: 12 }}>{joined}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
