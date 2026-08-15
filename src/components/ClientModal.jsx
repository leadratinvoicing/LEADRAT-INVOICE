import { useEffect, useRef, useState } from 'react';
import { useApp } from '../AppContext';
import { isValidEmail } from '../utils';
import Modal from './Modal';

export default function ClientModal({ open, editingClient, onClose, onSave }) {
  const { showToast } = useApp();
  const [name, setName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [gstin, setGstin] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [badField, setBadField] = useState(null);
  const [saving, setSaving] = useState(false);

  const refs = useRef({});
  const bind = (f) => (el) => { refs.current[f] = el; };
  const cls = (f) => 'form-input' + (badField === f ? ' field-error' : '');

  useEffect(() => {
    if (!open) return;
    setBadField(null);
    const c = editingClient;
    setName(c?.name || '');
    setLegalName(c?.legalName || c?.name || '');
    setAddress(c?.address || '');
    setCity(c?.city || '');
    setGstin(c?.gstin || '');
    setEmail(c?.email || '');
    setPhone(c?.phone || '');
  }, [open, editingClient]);

  function fail(field, msg) {
    setBadField(field);
    const el = refs.current[field];
    if (el) el.focus();
    showToast(msg, 'error');
  }

  async function save() {
    if (saving) return;
    const n = name.trim(), a = address.trim(), g = gstin.trim().toUpperCase();
    const em = email.trim(), ph = phone.trim();
    if (!n) return fail('cltName', 'Client name is required');
    if (!a) return fail('cltAddr', 'Address is required');
    if (!g) return fail('cltGstin', 'GSTIN is required');
    if (g.length !== 15) return fail('cltGstin', 'GSTIN must be exactly 15 alphanumeric characters');
    // Email and contact are optional, but must be sane when filled in.
    if (em && !isValidEmail(em)) return fail('cltEmail', 'Enter a valid email address');
    if (ph && (ph.replace(/\D/g, '').length < 7 || ph.replace(/\D/g, '').length > 15)) {
      return fail('cltPhone', 'Contact number must be 7–15 digits (country code allowed)');
    }

    setSaving(true);
    try {
      await onSave({ name: n, legalName: legalName.trim(), address: a, city: city.trim(), gstin: g, email: em, phone: ph });
    } finally {
      setSaving(false);
    }
  }

  const footer = (
    <>
      <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Client'}</button>
    </>
  );

  return (
    <Modal open={open} title={editingClient ? 'Edit Client' : 'Add Client'} onClose={onClose} maxWidth={560} footer={footer}>
      <div className="form-group">
        <label className="form-label">Client Name <span className="req">*</span></label>
        <input ref={bind('cltName')} type="text" className={cls('cltName')}
          value={name} onChange={(e) => { setName(e.target.value); setBadField(null); }} />
      </div>
      <div className="form-group">
        <label className="form-label">Legal Name</label>
        <input type="text" className="form-input" placeholder="Registered legal name (optional)"
          value={legalName} onChange={(e) => setLegalName(e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label">Address <span className="req">*</span></label>
        <textarea ref={bind('cltAddr')} className={cls('cltAddr')} rows={3}
          value={address} onChange={(e) => { setAddress(e.target.value); setBadField(null); }} />
      </div>
      <div className="form-group">
        <label className="form-label">City</label>
        <input type="text" className="form-input" placeholder="e.g. Pune, Bengaluru, Mumbai (optional)"
          value={city} onChange={(e) => setCity(e.target.value)} />
      </div>
      <div className="form-grid-2">
        <div className="form-group">
          <label className="form-label">Email ID</label>
          <input ref={bind('cltEmail')} type="email" className={cls('cltEmail')} placeholder="e.g. accounts@client.com"
            value={email} onChange={(e) => { setEmail(e.target.value); setBadField(null); }} />
        </div>
        <div className="form-group">
          <label className="form-label">Contact Number</label>
          <input ref={bind('cltPhone')} type="tel" className={cls('cltPhone')} placeholder="e.g. +91 98765 43210"
            value={phone}
            onChange={(e) => { setPhone(e.target.value.replace(/[^0-9+\-()\s]/g, '')); setBadField(null); }} />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">GSTIN <span className="req">*</span></label>
        <input ref={bind('cltGstin')} type="text" className={cls('cltGstin')} maxLength={15} placeholder="15-character GSTIN"
          value={gstin}
          onChange={(e) => { setGstin(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 15)); setBadField(null); }} />
        <div className="password-hint">15 alphanumeric characters · all uppercase</div>
      </div>
    </Modal>
  );
}
