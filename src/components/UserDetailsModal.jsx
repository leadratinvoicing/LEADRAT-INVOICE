import Modal from './Modal';
import { ACTION_LABELS, BRANCH_ACCESS_OPTIONS, PERMISSION_MODULES } from '../constants';

function DetailRow({ label, value }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
      <div style={{ color: 'var(--muted)', fontWeight: 500 }}>{label}</div>
      <div style={{ color: 'var(--text)' }}>{value}</div>
    </div>
  );
}

export default function UserDetailsModal({ open, user, onClose, onEdit }) {
  if (!user) return null;

  const status = user.status || 'active';
  const joined = user.createdAt ? new Date(user.createdAt).toLocaleString('en-GB') : '-';
  const updated = user.updatedAt ? new Date(user.updatedAt).toLocaleString('en-GB') : '-';
  const mobile = ((user.countryCode || '') + ' ' + (user.mobile || '')).trim() || '-';
  const perms = user.permissions || {};
  const fullName = user.name || ((user.firstName || '') + ' ' + (user.surname || '')).trim();
  const branchAccess = user.branchAccess || 'all';
  const branchAccessLabel = (BRANCH_ACCESS_OPTIONS.find((b) => b.value === branchAccess) || {}).label || branchAccess;

  const footer = (
    <>
      <button className="btn btn-secondary" onClick={onClose}>Close</button>
      <button className="btn btn-primary" onClick={() => onEdit(user.email)}>Edit User</button>
    </>
  );

  return (
    <Modal open={open} title="User Details" onClose={onClose} maxWidth={640} footer={footer}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18, paddingBottom: 14, borderBottom: '2px solid var(--brand-light)' }}>
        <div style={{ width: 54, height: 54, borderRadius: '50%', background: 'var(--brand)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700 }}>
          {(user.firstName || user.email || 'U')[0].toUpperCase()}
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>{fullName}</div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>{user.email}</div>
          <div style={{ marginTop: 4 }}>
            <span className={'badge ' + (status === 'active' ? 'badge-paid' : 'badge-due')}>{status}</span>{' '}
            <span className="badge badge-invoice">{user.department || '-'}</span>
          </div>
        </div>
      </div>

      <div className="card-title" style={{ fontSize: 14, marginBottom: 8 }}>Personal Information</div>
      <DetailRow label="First Name" value={user.firstName || '-'} />
      <DetailRow label="Surname" value={user.surname || '-'} />
      <DetailRow label="Username" value={user.email} />
      <DetailRow label="Mobile" value={mobile} />
      <DetailRow label="Country" value={(user.countryISO || '-') + ' (' + (user.countryCode || '-') + ')'} />
      <DetailRow label="Department" value={user.department || '-'} />
      <DetailRow label="Sign-in Method" value={user.authProvider === 'google' ? 'Google' : 'Email & password'} />
      <DetailRow label="Status" value={status} />
      <DetailRow label="Role" value={user.role === 'admin' ? 'Administrator' : 'User'} />
      <DetailRow label="Branch Access" value={branchAccessLabel} />
      <DetailRow label="Joined" value={joined} />
      <DetailRow label="Last Updated" value={updated} />

      <div className="card-title" style={{ fontSize: 14, margin: '16px 0 8px' }}>Module Permissions</div>
      <div style={{ background: '#FAFBFC', border: '1px solid var(--border)', borderRadius: 6, padding: 12 }}>
        {PERMISSION_MODULES.map((mod) => {
          const granted = mod.actions.filter((a) => perms[mod.key] && perms[mod.key][a]);
          return (
            <div key={mod.key} style={{ marginBottom: 6 }}>
              <strong>{mod.label}:</strong>{' '}
              {granted.length === 0
                ? <span style={{ color: 'var(--muted)', fontSize: 12 }}>No access</span>
                : <span style={{ color: 'var(--success)', fontSize: 12 }}>{granted.map((a) => ACTION_LABELS[a] || a).join(', ')}</span>}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
