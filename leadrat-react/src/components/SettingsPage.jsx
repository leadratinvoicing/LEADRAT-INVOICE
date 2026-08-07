import { useEffect, useState } from 'react';
import { useApp } from '../AppContext';
import { deepClone, validatePassword } from '../utils';
import { changeOwnPassword, friendlyAuthError } from '../auth';
import PasswordInput from './PasswordInput';

export default function SettingsPage() {
  const { currentUser, company, adminPass, saveUsers, saveAdminPass, saveCompany, enterApp, showToast, stateRef } = useApp();

  const [tab, setTab] = useState('profile');
  const [coTab, setCoTab] = useState('pune');
  const [name, setName] = useState(currentUser?.name || '');
  const [curPass, setCurPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newPass2, setNewPass2] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(() => deepClone(company));

  const isAdmin = currentUser && currentUser.role === 'admin';

  useEffect(() => { setName(currentUser?.name || ''); }, [currentUser]);
  useEffect(() => { setDraft(deepClone(company)); }, [company]);

  async function saveProfile() {
    const n = name.trim();
    if (!n) return showToast('Name required', 'error');
    const cu = { ...stateRef.current.currentUser, name: n };
    if (cu.role !== 'admin') {
      await saveUsers(stateRef.current.users.map((u) => (u.email === cu.email ? { ...u, name: n } : u)));
    }
    enterApp(cu);
    showToast('Profile updated');
  }

  async function changePassword() {
    if (!curPass || !newPass) return showToast('Fill all fields', 'error');
    const err = validatePassword(newPass);
    if (err) return showToast(err, 'error');
    if (newPass !== newPass2) return showToast('New passwords do not match', 'error');

    setBusy(true);
    try {
      if (currentUser.role === 'admin') {
        if (curPass !== adminPass) return showToast('Current admin password incorrect', 'error');
        await saveAdminPass(newPass);
      } else {
        // Firebase owns user credentials — reauthenticate, then update.
        await changeOwnPassword(curPass, newPass);
      }
      setCurPass(''); setNewPass(''); setNewPass2('');
      showToast('Password updated successfully');
    } catch (e) {
      showToast(friendlyAuthError(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  const setBranchField = (branchKey, field, value) =>
    setDraft((d) => ({ ...d, [branchKey]: { ...d[branchKey], [field]: value } }));

  async function saveCompanyInfo() {
    if (!isAdmin) return showToast('Only admin can edit company information', 'error');

    const puneName = (draft.pune?.name || '').trim();
    const bluName = (draft.bengaluru?.name || '').trim();
    if (!puneName || !bluName) return showToast('Company name cannot be empty', 'error');

    const puneGst = (draft.pune?.gstin || '').trim().toUpperCase();
    const bluGst = (draft.bengaluru?.gstin || '').trim().toUpperCase();
    if (puneGst && puneGst.length !== 15) return showToast('Pune GSTIN must be exactly 15 characters', 'error');
    if (bluGst && bluGst.length !== 15) return showToast('Bengaluru GSTIN must be exactly 15 characters', 'error');

    const next = {
      pune: { name: puneName, address: draft.pune?.address || '', gstin: puneGst, cin: (draft.pune?.cin || '').trim().toUpperCase() },
      bengaluru: { name: bluName, address: draft.bengaluru?.address || '', gstin: bluGst, cin: (draft.bengaluru?.cin || '').trim().toUpperCase() },
      dubai: {
        name: (draft.dubai?.name || '').trim(),
        address: draft.dubai?.address || '',
        trn: (draft.dubai?.trn || '').trim(),
        licenseNo: (draft.dubai?.licenseNo || '').trim()
      },
      bank: {
        name: (draft.bank?.name || '').trim(),
        accName: (draft.bank?.accName || '').trim(),
        accNo: (draft.bank?.accNo || '').trim(),
        ifsc: (draft.bank?.ifsc || '').trim().toUpperCase(),
        type: (draft.bank?.type || '').trim()
      },
      dubaiBank: {
        name: (draft.dubaiBank?.name || '').trim(),
        accName: (draft.dubaiBank?.accName || '').trim(),
        iban: (draft.dubaiBank?.iban || '').trim().toUpperCase(),
        accNo: (draft.dubaiBank?.accNo || '').trim(),
        currency: (draft.dubaiBank?.currency || '').trim().toUpperCase() || 'AED'
      }
    };

    try {
      await saveCompany(next);
      showToast('Company information saved. New invoices will use these details.');
    } catch (e) {
      showToast('Save failed: ' + (e.message || e), 'error');
    }
  }

  const coInput = (branchKey, field, props) => (
    <input
      type="text" className="form-input"
      value={draft[branchKey]?.[field] || ''}
      disabled={!isAdmin} readOnly={!isAdmin}
      onChange={(e) => setBranchField(branchKey, field, e.target.value)}
      {...props}
    />
  );

  return (
    <div className="page show">
      <div className="page-header">
        <div>
          <div className="page-title">Settings</div>
          <div className="page-subtitle">Manage your account and company settings</div>
        </div>
      </div>

      <div className="tabs">
        <button className={'tab' + (tab === 'profile' ? ' active' : '')} onClick={() => setTab('profile')}>Profile</button>
        <button className={'tab' + (tab === 'password' ? ' active' : '')} onClick={() => setTab('password')}>Change Password</button>
        <button className={'tab' + (tab === 'company' ? ' active' : '')} onClick={() => setTab('company')}>Company Info</button>
      </div>

      {tab === 'profile' && (
        <div className="tab-content show">
          <div className="card settings-section">
            <div className="card-title">Profile Information</div>
            <div className="form-group">
              <label className="form-label">Name</label>
              <input type="text" className="form-input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Email / User ID</label>
              <input type="text" className="form-input" value={currentUser?.email || ''} disabled readOnly />
            </div>
            <div className="form-group">
              <label className="form-label">Role</label>
              <input type="text" className="form-input" value={currentUser?.role === 'admin' ? 'Administrator' : 'User'} disabled readOnly />
            </div>
            <button className="btn btn-primary" onClick={saveProfile}>Save Changes</button>
          </div>
        </div>
      )}

      {tab === 'password' && (
        <div className="tab-content show">
          <div className="card settings-section">
            <div className="card-title">Change Password</div>
            <div className="form-group">
              <label className="form-label">Current Password</label>
              <PasswordInput value={curPass} onChange={setCurPass} autoComplete="current-password" />
            </div>
            <div className="form-group">
              <label className="form-label">New Password</label>
              <PasswordInput value={newPass} onChange={setNewPass} autoComplete="new-password" />
              <div className="password-hint">Min 8 chars, 1 uppercase, 1 number, 1 special character</div>
            </div>
            <div className="form-group">
              <label className="form-label">Confirm New Password</label>
              <PasswordInput value={newPass2} onChange={setNewPass2} autoComplete="new-password" />
            </div>
            <button className="btn btn-primary" onClick={changePassword} disabled={busy}>
              {busy ? 'Updating…' : 'Update Password'}
            </button>
          </div>
        </div>
      )}

      {tab === 'company' && (
        <div className="tab-content show">
          <div className="card settings-section">
            <div className="card-title">Company Details (Bill From)</div>
            <p style={{ fontSize: 12, marginBottom: 10, color: isAdmin ? 'var(--brand-dark)' : 'var(--muted)' }}>
              {isAdmin
                ? '✏️ You are logged in as admin. Fields below are editable. Changes save on click and apply to all NEW invoices.'
                : '📌 Company information is locked. To change these values, please contact the system administrator.'}
            </p>

            <div className="tabs">
              <button className={'tab' + (coTab === 'pune' ? ' active' : '')} onClick={() => setCoTab('pune')}>Pune Branch</button>
              <button className={'tab' + (coTab === 'bengaluru' ? ' active' : '')} onClick={() => setCoTab('bengaluru')}>Bengaluru Branch</button>
              <button className={'tab' + (coTab === 'dubai' ? ' active' : '')} onClick={() => setCoTab('dubai')}>Dubai Branch</button>
            </div>

            {coTab !== 'dubai' && (
              <div className="tab-content show">
                <div className="form-group">
                  <label className="form-label">Company Name</label>
                  {coInput(coTab, 'name')}
                </div>
                <div className="form-group">
                  <label className="form-label">Address</label>
                  <textarea
                    className="form-input" rows={3}
                    value={draft[coTab]?.address || ''}
                    disabled={!isAdmin} readOnly={!isAdmin}
                    onChange={(e) => setBranchField(coTab, 'address', e.target.value)}
                  />
                </div>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">GSTIN</label>
                    {coInput(coTab, 'gstin')}
                  </div>
                  <div className="form-group">
                    <label className="form-label">CIN</label>
                    {coInput(coTab, 'cin')}
                  </div>
                </div>
              </div>
            )}

            {coTab === 'dubai' && (
              <div className="tab-content show">
                <div className="form-group">
                  <label className="form-label">Company Name</label>
                  {coInput('dubai', 'name')}
                </div>
                <div className="form-group">
                  <label className="form-label">Address</label>
                  <textarea
                    className="form-input" rows={3}
                    value={draft.dubai?.address || ''}
                    disabled={!isAdmin} readOnly={!isAdmin}
                    onChange={(e) => setBranchField('dubai', 'address', e.target.value)}
                  />
                </div>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">TRN</label>
                    {coInput('dubai', 'trn')}
                  </div>
                  <div className="form-group">
                    <label className="form-label">LICENSE NO</label>
                    {coInput('dubai', 'licenseNo')}
                  </div>
                </div>
                <hr className="section-divider" />
                <div className="card-title" style={{ fontSize: 14 }}>Dubai Banking Information (RAK BANK)</div>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Bank Name</label>
                    {coInput('dubaiBank', 'name')}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Account Name</label>
                    {coInput('dubaiBank', 'accName')}
                  </div>
                  <div className="form-group">
                    <label className="form-label">IBAN</label>
                    {coInput('dubaiBank', 'iban')}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Account Number</label>
                    {coInput('dubaiBank', 'accNo')}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Currency</label>
                    {coInput('dubaiBank', 'currency')}
                  </div>
                </div>
              </div>
            )}

            <hr className="section-divider" />
            <div className="card-title">Banking Information</div>
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Bank Name</label>
                {coInput('bank', 'name')}
              </div>
              <div className="form-group">
                <label className="form-label">A/C Name</label>
                {coInput('bank', 'accName')}
              </div>
              <div className="form-group">
                <label className="form-label">Account Number</label>
                {coInput('bank', 'accNo')}
              </div>
              <div className="form-group">
                <label className="form-label">IFSC Code</label>
                {coInput('bank', 'ifsc')}
              </div>
              <div className="form-group">
                <label className="form-label">Account Type</label>
                {coInput('bank', 'type')}
              </div>
            </div>

            {isAdmin && (
              <div style={{ marginTop: 16 }}>
                <button className="btn btn-primary" onClick={saveCompanyInfo}>💾 Save Company Info</button>
                <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 10 }}>
                  Changes apply to all NEW invoices generated after saving.
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
