import { useRef, useState } from 'react';
import { useApp } from '../AppContext';
import { branchLabel, fmtDate, fmtMoneyForRegion, regionOf } from '../utils';

const REGION_TABS = [
  { value: 'all', label: '🌐 All' },
  { value: 'india', label: '🇮🇳 India (Pune + Bengaluru)' },
  { value: 'dubai', label: '🇦🇪 Dubai' }
];

export default function Dashboard({ onOpenTds, onViewUser, onNavigate, onDownloadBackup, onLoadBackup }) {
  const { invoices, clients, users, currentUser } = useApp();
  const [region, setRegion] = useState('all');
  const backupFileRef = useRef(null);

  // "india" = pune + bengaluru; "dubai" = dubai; "all" = everything.
  const belongsToRegion = (d) => {
    if (region === 'all') return true;
    if (region === 'dubai') return d.branch === 'dubai';
    return d.branch !== 'dubai';
  };

  const all = invoices.filter(belongsToRegion);
  const inv = all.filter((d) => d.docType === 'invoice');
  const pro = all.filter((d) => d.docType === 'proforma');
  const totalRev = inv.filter((d) => d.status === 'paid').reduce((s, d) => s + (+d.totalAmount || 0), 0);
  const totalDue = all.filter((d) => d.status === 'due').reduce((s, d) => s + (+d.amountDueOutstanding || +d.totalAmount || 0), 0);
  const totalGst = inv.filter((d) => d.status === 'paid').reduce((s, d) => s + (+d.cgst || 0) + (+d.sgst || 0) + (+d.igst || 0), 0);
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

  let clientCount = clients.length;
  if (region !== 'all') {
    const idsInRegion = new Set(all.map((d) => d.clientId).filter(Boolean));
    clientCount = idsInRegion.size || (region === 'dubai' ? 0 : clients.length);
  }

  const taxLabel = region === 'dubai' ? 'Total VAT Collected' : 'Total GST Collected';
  const taxMeta = region === 'dubai' ? 'VAT @ 5% (Dubai)' : 'CGST+SGST+IGST';

  const stats = [
    { label: 'Total Invoices', value: inv.length, meta: 'Tax invoices', cls: '', onClick: () => onNavigate('invoices') },
    { label: 'Total Proformas', value: pro.length, meta: 'Proforma invoices', cls: '', onClick: () => onNavigate('proforma') },
    { label: 'Total Revenue', value: money(totalRev), meta: 'Cleared payments · click to view', cls: 'cleared', onClick: () => onNavigate('invoices', 'paid') },
    { label: 'Total Net Amount', value: money(totalNet), meta: 'Net of tax (all invoices) · click to view', cls: 'cleared', onClick: () => onNavigate('invoices') },
    { label: taxLabel, value: money(totalGst), meta: taxMeta + ' · click to view', cls: 'tax', onClick: () => onNavigate('invoices') }
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
  stats.push({ label: 'Outstanding Amount', value: money(totalDue), meta: 'Pending payments · click to view', cls: 'due', onClick: () => onNavigate('invoices', 'due') });
  stats.push({
    label: 'Total Clients',
    value: clientCount,
    meta: (region === 'all' ? 'In database' : 'In this region') + ' · click to view',
    cls: '',
    onClick: () => onNavigate('clients')
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
  const recent = [...all].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 8);

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
        {REGION_TABS.map((t) => (
          <button key={t.value} className={'tab' + (region === t.value ? ' active' : '')} onClick={() => setRegion(t.value)}>
            {t.label}
          </button>
        ))}
      </div>

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
        <div className="card-title">Recent Documents</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Invoice No</th><th>Type</th><th>Client</th><th>Branch</th><th>Date</th><th>Total</th><th>Status</th>
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
              ) : recent.map((d) => (
                <tr key={d.id}>
                  <td><strong>{d.invoiceNo || ''}</strong></td>
                  <td><span className={'badge ' + (d.docType === 'invoice' ? 'badge-invoice' : 'badge-proforma')}>{d.docType === 'invoice' ? 'Invoice' : 'Proforma'}</span></td>
                  <td>{d.clientName || ''}</td>
                  <td style={{ fontSize: 12 }}>{branchLabel(d.branch)}</td>
                  <td>{fmtDate(d.invoiceDate)}</td>
                  <td><strong>{fmtMoneyForRegion(d.totalAmount, regionOf(d.branch))}</strong></td>
                  <td><span className={'badge ' + (d.status === 'paid' ? 'badge-paid' : 'badge-due')}>{d.status === 'paid' ? 'Cleared' : 'Due'}</span></td>
                </tr>
              ))}
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
