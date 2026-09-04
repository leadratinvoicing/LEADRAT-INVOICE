import { useEffect, useRef, useState } from 'react';
import { useApp } from '../AppContext';
import { isValidEmail } from '../utils';
import {
  clientGstins, MAX_CLIENT_GSTINS, normaliseClientGstins, validateClientGstins
} from '../clientGst';
import Modal from './Modal';

export default function ClientModal({ open, editingClient, onClose, onSave }) {
  const { showToast } = useApp();
  const [name, setName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [city, setCity] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  // A client may be registered under more than one GSTIN, each with its own
  // billing address. Seeded from the single pair older records carry.
  const [regs, setRegs] = useState([]);
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
    setCity(c?.city || '');
    setEmail(c?.email || '');
    setPhone(c?.phone || '');
    setRegs(clientGstins(c || {}));
  }, [open, editingClient]);

  function fail(field, msg) {
    setBadField(field);
    const el = refs.current[field];
    if (el) el.focus();
    showToast(msg, 'error');
  }

  const updateReg = (id, field, value) =>
    setRegs((list) => list.map((r) => (r.id === id ? { ...r, [field]: value } : r)));

  const makeDefault = (id) =>
    setRegs((list) => list.map((r) => ({ ...r, isDefault: r.id === id })));

  const addReg = () =>
    setRegs((list) => (list.length >= MAX_CLIENT_GSTINS ? list : [...list, {
      id: 'gst-' + Date.now(),
      label: 'GSTIN ' + (list.length + 1),
      gstin: '',
      address: '',
      isDefault: false
    }]));

  const removeReg = (id) =>
    setRegs((list) => {
      const next = list.filter((r) => r.id !== id);
      // Never leave the client without a default to fall back on.
      if (next.length && !next.some((r) => r.isDefault)) next[0].isDefault = true;
      return next;
    });

  async function save() {
    if (saving) return;
    const n = name.trim();
    const em = email.trim(), ph = phone.trim();
    if (!n) return fail('cltName', 'Client name is required');

    const gstError = validateClientGstins(regs);
    if (gstError) return showToast(gstError, 'error');

    // Email and contact are optional, but must be sane when filled in.
    if (em && !isValidEmail(em)) return fail('cltEmail', 'Enter a valid email address');
    if (ph && (ph.replace(/\D/g, '').length < 7 || ph.replace(/\D/g, '').length > 15)) {
      return fail('cltPhone', 'Contact number must be 7–15 digits (country code allowed)');
    }

    const cleaned = normaliseClientGstins(regs);
    const primary = cleaned.find((r) => r.isDefault) || cleaned[0];

    setSaving(true);
    try {
      await onSave({
        name: n,
        legalName: legalName.trim(),
        city: city.trim(),
        email: em,
        phone: ph,
        // The default is mirrored onto the flat fields so every existing reader
        // — lists, search, exports, older documents — keeps working unchanged.
        address: primary.address,
        gstin: primary.gstin,
        gstRegistrations: cleaned
      });
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
    <Modal open={open} title={editingClient ? 'Edit Client' : 'Add Client'} onClose={onClose} maxWidth={620} footer={footer}>
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

      <hr className="section-divider" />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <div className="card-title" style={{ marginBottom: 0 }}>GSTIN &amp; Billing Address</div>
        <button
          className="btn btn-secondary btn-sm" onClick={addReg}
          disabled={regs.length >= MAX_CLIENT_GSTINS}
          title={regs.length >= MAX_CLIENT_GSTINS
            ? 'Up to ' + MAX_CLIENT_GSTINS + ' GSTINs per client'
            : 'Add another GSTIN and its billing address'}
        >
          + Add GSTIN
        </button>
      </div>
      <p style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 12 }}>
        A client registered in more than one state can hold several GSTINs, each with its own billing
        address. The one marked <strong>Default</strong> is used automatically; when a client has more
        than one, the invoice form asks which to bill.
      </p>

      {regs.map((r, i) => (
        <div key={r.id} className={'gst-reg' + (r.isDefault ? ' is-default' : '')}>
          <div className="gst-reg-head">
            <label className="gst-reg-default">
              <input type="radio" name="clientDefaultGst" checked={!!r.isDefault}
                onChange={() => makeDefault(r.id)} />
              {r.isDefault ? 'Default' : 'Make default'}
            </label>
            {regs.length > 1 && (
              <button className="icon-btn delete" onClick={() => removeReg(r.id)}
                title="Remove this GSTIN">🗑</button>
            )}
          </div>
          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Label</label>
              <input type="text" className="form-input" placeholder="e.g. Maharashtra office"
                value={r.label} onChange={(e) => updateReg(r.id, 'label', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">GSTIN <span className="req">*</span></label>
              <input type="text" className="form-input" maxLength={15} placeholder="15-character GSTIN"
                style={{ fontFamily: 'monospace' }}
                value={r.gstin}
                onChange={(e) => updateReg(r.id, 'gstin',
                  e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 15))} />
              {r.gstin && r.gstin.length !== 15 && (
                <div className="password-hint" style={{ color: 'var(--danger)' }}>
                  {r.gstin.length} of 15 characters
                </div>
              )}
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Billing Address <span className="req">*</span></label>
            <textarea className="form-input" rows={3}
              value={r.address} onChange={(e) => updateReg(r.id, 'address', e.target.value)} />
            <div className="password-hint">Printed as the Bill To address on documents using this GSTIN</div>
          </div>
          {i === 0 && regs.length === 1 && (
            <div className="password-hint" style={{ marginTop: 8 }}>
              Add a second GSTIN if this client is billed in more than one state.
            </div>
          )}
        </div>
      ))}
    </Modal>
  );
}
