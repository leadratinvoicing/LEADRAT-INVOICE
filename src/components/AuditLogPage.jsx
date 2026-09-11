import { useMemo, useState } from 'react';
import { useApp } from '../AppContext';
import { AUDIT_ACTION_MAP, AUDIT_ACTIONS, AUDIT_LIMIT } from '../constants';
import { inDateRange } from '../utils';
import DateRangeFilter from './DateRangeFilter';

/** Full timestamp — the log is only useful if you can pin an action to a moment. */
function stamp(iso) {
  if (!iso) return { date: '—', time: '' };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { date: iso, time: '' };
  return {
    date: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  };
}

/** "3 minutes ago" — quick orientation without doing arithmetic on timestamps. */
function relative(iso) {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '';
  const secs = Math.floor((Date.now() - t) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return mins + ' min ago';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + 'h ago';
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : days + 'd ago';
}

/** Turn an entry's details into one readable line. */
function describe(row) {
  const d = row.details || {};
  switch (row.action) {
    case 'pi_converted':
      return d.fromProformaNo + ' → ' + d.toInvoiceNo
        + (d.wasCustomNumber ? ' (custom number; auto-suggested was ' + d.autoSuggested + ')' : '');
    case 'number_collision':
      return d.attempted + ' was already taken — reissued as ' + d.reissuedAs;
    case 'doc_assigned':
      return d.invoiceNo + ' → ' + (d.toName || d.to);
    case 'doc_unassigned':
      return d.invoiceNo + ' unassigned';
    case 'login':
    case 'logout':
      return d.email || '';
    default: {
      const bits = [];
      if (d.invoiceNo) bits.push(d.invoiceNo);
      if (d.clientName) bits.push(d.clientName);
      if (d.name) bits.push(d.name);
      if (d.email) bits.push(d.email);
      if (d.count !== undefined) bits.push(d.count + ' record' + (d.count === 1 ? '' : 's'));
      if (d.format) bits.push(d.format.toUpperCase());
      if (d.note) bits.push(d.note);
      return bits.join(' · ');
    }
  }
}

/**
 * Who did what, and when. Admin-only: it spans every user's activity, so the
 * navigation entry and the page itself are both gated on the admin role.
 */
export default function AuditLogPage() {
  const { audit, currentUser, resyncAll, showToast } = useApp();
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');
  const [who, setWho] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });
  const [refreshing, setRefreshing] = useState(false);

  // Defence in depth: the nav hides this, and the page refuses as well.
  if (!currentUser || currentUser.role !== 'admin') {
    return (
      <div className="page show">
        <div className="empty-state">
          <div className="empty-state-icon">🔒</div>
          <div className="empty-state-title">Administrators only</div>
          <div className="empty-state-text">The audit log covers every user&apos;s activity.</div>
        </div>
      </div>
    );
  }

  const rows = Array.isArray(audit) ? audit : [];

  const people = useMemo(
    () => [...new Set(rows.map((r) => r.by).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [rows]
  );

  const s = search.trim().toLowerCase();
  const list = rows.filter((r) => {
    if (action && r.action !== action) return false;
    if (who && r.by !== who) return false;
    if (!inDateRange(r.at, range.from, range.to)) return false;
    if (!s) return true;
    const meta = AUDIT_ACTION_MAP[r.action];
    const hay = [r.by, r.byEmail, r.action, meta && meta.label, describe(r), JSON.stringify(r.details || {})]
      .join(' ').toLowerCase();
    return hay.includes(s);
  });

  async function refresh() {
    setRefreshing(true);
    try {
      await resyncAll();
      showToast('Audit log refreshed');
    } finally {
      setRefreshing(false);
    }
  }

  // Only offer actions that actually appear, so the filter is never a dead end.
  const presentActions = AUDIT_ACTIONS.filter((a) => rows.some((r) => r.action === a.key));

  return (
    <div className="page show">
      <div className="page-header">
        <div>
          <div className="page-title">Audit Log</div>
          <div className="page-subtitle">
            Every recorded action, newest first · keeps the last {AUDIT_LIMIT.toLocaleString('en-IN')} entries
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={refresh} disabled={refreshing}>
            🔄 {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <input
          type="text" className="form-input search-input" placeholder="Search user, action, invoice no, client…"
          value={search} onChange={(e) => setSearch(e.target.value)}
        />
        <select className="form-input" value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">All activity</option>
          {presentActions.map((a) => <option key={a.key} value={a.key}>{a.icon + ' ' + a.label}</option>)}
        </select>
        <select className="form-input" value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="">Anyone</option>
          {people.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      <DateRangeFilter
        from={range.from} to={range.to} onChange={setRange}
        label="Activity date"
        count={list.length}
        noun={'entr' + (list.length === 1 ? 'y' : 'ies')}
      />

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>User</th>
              <th>Action</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={4}>
                <div className="empty-state">
                  <div className="empty-state-icon">📋</div>
                  <div className="empty-state-title">
                    {rows.length === 0 ? 'Nothing recorded yet' : 'No entries match these filters'}
                  </div>
                  <div className="empty-state-text">
                    {rows.length === 0
                      ? 'Activity will appear here as people sign in and work on documents.'
                      : 'Try widening the date range or clearing the filters.'}
                  </div>
                </div>
              </td></tr>
            ) : list.map((r) => {
              const meta = AUDIT_ACTION_MAP[r.action] || { icon: '•', label: r.action };
              const t = stamp(r.at);
              return (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <div><strong>{t.date}</strong></div>
                    <div className="audit-time">{t.time}</div>
                    <div className="audit-rel">{relative(r.at)}</div>
                  </td>
                  <td>
                    <div><strong>{r.by || '—'}</strong></div>
                    {r.byEmail && r.byEmail !== r.by && <div className="audit-rel">{r.byEmail}</div>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <span className="audit-action">{meta.icon} {meta.label}</span>
                  </td>
                  <td className="audit-details">{describe(r) || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
