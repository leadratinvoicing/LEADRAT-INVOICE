import { useState } from 'react';
import { useApp } from '../AppContext';
import Modal from './Modal';
import PasswordInput from './PasswordInput';
import { validatePassword } from '../utils';
import { changeOwnPassword, friendlyAuthError } from '../auth';

/**
 * Shown when an admin has flagged the account with `mustChangePassword` — after
 * creating it with an initial password, or after resetting access. There is no
 * dismiss: the app stays behind this until a new password is set, or the user
 * signs out.
 */
export default function ForcePasswordModal({ open, onDone, onSignOut }) {
  const { currentUser, showToast } = useApp();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (saving) return;
    if (!current) return showToast('Enter the password you signed in with', 'error');
    const err = validatePassword(next);
    if (err) return showToast(err, 'error');
    if (next !== confirm) return showToast('The two new passwords do not match', 'error');
    if (next === current) return showToast('Choose a password different from the current one', 'error');

    setSaving(true);
    try {
      await changeOwnPassword(current, next);
      await onDone();
      showToast('Password updated');
    } catch (e) {
      showToast(friendlyAuthError(e), 'error');
    } finally {
      setSaving(false);
    }
  }

  const footer = (
    <>
      <button className="btn btn-secondary" onClick={onSignOut} disabled={saving}>Sign Out Instead</button>
      <button className="btn btn-primary" onClick={submit} disabled={saving}>
        {saving ? 'Updating…' : 'Set New Password'}
      </button>
    </>
  );

  return (
    <Modal open={open} title="Choose a New Password" onClose={() => {}} maxWidth={460} footer={footer} hideClose>
      <p style={{ fontSize: 10.8, color: 'var(--muted)', marginBottom: 16 }}>
        Your administrator set a temporary password for <strong>{(currentUser && currentUser.email) || 'your account'}</strong>.
        Pick your own before carrying on.
      </p>
      <div className="form-group">
        <label className="form-label">Current Password <span className="req">*</span></label>
        <PasswordInput value={current} onChange={setCurrent} autoComplete="current-password"
          placeholder="The password you were given" />
      </div>
      <div className="form-group">
        <label className="form-label">New Password <span className="req">*</span></label>
        <PasswordInput value={next} onChange={setNext} autoComplete="new-password" />
        <div className="password-hint">At least 8 characters, with an uppercase letter, a number and a symbol.</div>
      </div>
      <div className="form-group">
        <label className="form-label">Confirm New Password <span className="req">*</span></label>
        <PasswordInput value={confirm} onChange={setConfirm} autoComplete="new-password" />
      </div>
    </Modal>
  );
}
