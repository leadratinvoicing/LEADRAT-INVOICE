import { useEffect, useState } from 'react';
import { useApp } from '../AppContext';
import Modal from './Modal';
import { branchLabel, fmtMoneyForRegion, MONEY_EPS, proformaState, regionOf } from '../utils';
import {
  findDuplicateNumber, matchesSeriesFormat, seriesFormatHint, suggestDocNumber
} from '../numbering';

/**
 * Choosing the tax invoice number before a proforma is converted.
 *
 * The suggestion is the next FREE number in the branch's series, but it is only
 * a suggestion — an admin can type any number, typically to match a physical
 * book. A number already in use is refused outright rather than silently
 * renumbered, because quietly changing what someone typed is how duplicates and
 * mismatched paperwork happen.
 */
export default function ConvertModal({ open, proforma, onClose, onConfirm }) {
  const { invoices, numbering } = useApp();

  const [value, setValue] = useState('');
  const [suggested, setSuggested] = useState('');

  const branch = (proforma && proforma.branch) || 'pune';

  useEffect(() => {
    if (!open || !proforma) return;
    const next = suggestDocNumber(numbering, invoices, 'invoice', branch);
    setSuggested(next);
    setValue(next);
  }, [open, proforma]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!proforma) return null;

  const trimmed = value.trim();
  const clash = findDuplicateNumber(invoices, trimmed);
  const blank = trimmed === '';
  // A number outside the branch's usual shape is allowed but called out.
  const oddFormat = !blank && !clash && !matchesSeriesFormat(numbering, trimmed, 'invoice', branch);
  const isCustom = trimmed !== suggested;

  const error = blank
    ? 'Invoice number is required'
    : clash
    ? 'Invoice number ' + trimmed + ' is already used by ' +
      (clash.docType === 'proforma' ? 'proforma' : 'invoice') + ' for ' +
      (clash.clientName || 'another client') + '. Please choose another.'
    : null;

  const st = proformaState(proforma, invoices);
  const money = (n) => fmtMoneyForRegion(n, regionOf(branch));

  const footer = (
    <>
      <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
      <button
        className="btn btn-primary"
        disabled={!!error}
        onClick={() => onConfirm(trimmed, suggested)}
      >
        ✓ Convert with this Number
      </button>
    </>
  );

  return (
    <Modal open={open} title="Convert Proforma to Tax Invoice" onClose={onClose} maxWidth={520} footer={footer}>
      <div className="convert-summary">
        <div><strong>{proforma.invoiceNo}</strong> · {proforma.clientName || '(no client)'}</div>
        <div style={{ marginTop: 4 }}>
          {branchLabel(branch)} · Proforma total <strong>{money(st.total)}</strong>
          {st.invoiced > MONEY_EPS && <> · already invoiced <strong>{money(st.invoiced)}</strong></>}
        </div>
        {st.invoiced > MONEY_EPS && (
          <div style={{ marginTop: 4 }}>
            This invoice covers the remaining <strong>{money(st.unbilled)}</strong>.
          </div>
        )}
      </div>

      <div className="form-group">
        <label className="form-label">Tax Invoice Number <span className="req">*</span></label>
        <input
          type="text"
          className={'form-input convert-number' + (error ? ' field-error' : '')}
          value={value}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !error) onConfirm(trimmed, suggested); }}
        />
        <div className="password-hint">
          💡 The suggestion is the next available number. You can override it with any custom number
          (for example to match physical numbering) — used numbers are skipped automatically and
          duplicates are detected.
        </div>

        {error && <div className="convert-error">{error}</div>}

        {oddFormat && (
          <div className="convert-warn">
            ⚠ This does not follow the usual {branchLabel(branch).replace(/^\S+\s/, '')} format{' '}
            <code>{seriesFormatHint(numbering, 'invoice', branch)}</code>. Convert anyway if that is intentional.
          </div>
        )}

        {!error && isCustom && (
          <div className="convert-note">
            Custom number — the auto-suggestion was <code>{suggested}</code>. The counter will not
            move backwards, and future invoices will skip whatever you use here.
          </div>
        )}
      </div>

      <div className="convert-foot-note">
        The proforma is kept and cross-linked to the new tax invoice — nothing is deleted.
      </div>
    </Modal>
  );
}
