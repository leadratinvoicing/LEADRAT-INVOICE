import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../AppContext';
import Modal from './Modal';
import SearchableSelect from './SearchableSelect';
import { allowedBranchesForUser, fmtDate, sameEmail } from '../utils';

/**
 * Hand a document to a colleague. The assignee sees it in their lists even when
 * their data scope is "own + assigned", which is the point: work gets routed to
 * people who would not otherwise have it in view.
 */
export default function AssignModal({ open, doc, onClose, onAssign }) {
  const { users } = useApp();
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !doc) return;
    setEmail(doc.assignedTo || '');
    setNote(doc.assignmentNote || '');
  }, [open, doc]);

  // Only offer people who could actually work the document: active accounts
  // whose branch access covers the branch it belongs to.
  const options = useMemo(() => {
    if (!doc) return [];
    return (users || [])
      .filter((u) => (u.status || 'active') === 'active')
      .filter((u) => {
        const allowed = allowedBranchesForUser(u);
        return !allowed || allowed.has(doc.branch);
      })
      .map((u) => ({
        value: u.email,
        label: (u.name || ((u.firstName || '') + ' ' + (u.surname || '')).trim() || u.email) +
          (u.department ? ' · ' + u.department : '')
      }));
  }, [users, doc]);

  if (!doc) return null;

  const assignee = users.find((u) => sameEmail(u.email, email));
  const alreadyAssigned = sameEmail(doc.assignedTo, email);

  async function submit(targetEmail) {
    if (saving) return;
    setSaving(true);
    try {
      const u = users.find((x) => sameEmail(x.email, targetEmail));
      await onAssign(doc.id, {
        assignedTo: targetEmail || '',
        assignedToName: u ? (u.name || u.email) : '',
        assignmentNote: targetEmail ? note.trim() : ''
      });
    } finally {
      setSaving(false);
    }
  }

  const footer = (
    <>
      <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
      {doc.assignedTo && (
        <button className="btn btn-danger" onClick={() => submit('')} disabled={saving}>
          Unassign
        </button>
      )}
      <button className="btn btn-primary" onClick={() => submit(email)} disabled={saving || !email || alreadyAssigned}>
        {saving ? 'Saving…' : alreadyAssigned ? 'Already Assigned' : 'Assign'}
      </button>
    </>
  );

  return (
    <Modal
      open={open}
      title={'Assign ' + (doc.docType === 'invoice' ? 'Tax Invoice' : 'Proforma') + ' · ' + (doc.invoiceNo || '')}
      onClose={onClose}
      maxWidth={520}
      footer={footer}
    >
      <div style={{ background: 'var(--brand-light)', borderRadius: 8, padding: 12, marginBottom: 14, fontSize: 10.8, color: 'var(--brand-dark)' }}>
        <div><strong>{doc.clientName || '(no client)'}</strong></div>
        <div style={{ marginTop: 4, fontSize: 10 }}>
          {fmtDate(doc.invoiceDate)}
          {doc.createdBy ? ' · raised by ' + doc.createdBy : ''}
        </div>
      </div>

      {doc.assignedTo && (
        <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 12 }}>
          Currently assigned to <strong>{doc.assignedToName || doc.assignedTo}</strong>
          {doc.assignedAt ? ' on ' + new Date(doc.assignedAt).toLocaleDateString('en-GB') : ''}.
        </div>
      )}

      <div className="form-group">
        <label className="form-label">Assign To</label>
        <SearchableSelect
          value={email}
          onChange={setEmail}
          options={options}
          placeholder="-- Choose a user --"
          searchPlaceholder="Type to search users..."
          emptyText="No active user has access to this document's branch."
        />
        {assignee && (
          <div className="password-hint">
            {assignee.email}
            {assignee.dataScope === 'own' ? ' · sees only their own and assigned records — this will appear in their list' : ''}
          </div>
        )}
      </div>

      <div className="form-group">
        <label className="form-label">Note</label>
        <textarea className="form-input" rows={2} placeholder="Why it is being handed over (optional)"
          value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Modal>
  );
}
