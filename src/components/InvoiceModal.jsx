import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../AppContext';
import Modal from './Modal';
import SearchableSelect from './SearchableSelect';
import {
  BRANCH_GST_STATE_CODE, BRANCHES, KNOWN_SUBTYPES, NO_LICENSE_SUBTYPES,
  PAYMENT_MODES, SUBTYPE_OPTIONS, VALIDITY_OPTIONS
} from '../constants';
import {
  dateToInput, fmtMoneyForRegion, MONEY_EPS, nextDocNumber, proformaState, receivedOf, regionOf, round2
} from '../utils';

function blankItem() {
  const today = new Date().toISOString().slice(0, 10);
  return {
    description: 'CRM Application',
    subType: 'New',
    subTypeOther: '',
    paymentDate: today,
    noOfLicense: '',
    validity: '1 Year',
    totalAmount: '' // user-entered Total (incl. tax). Net is back-calculated.
  };
}

/**
 * "Balance Pay" settles an amount already billed on an earlier invoice, so the
 * licence count and validity belong to that invoice, not this line — both
 * fields are locked and printed blank.
 */
function isBalanceOnly(subType) {
  return NO_LICENSE_SUBTYPES.includes(subType);
}

/** Shared look for a field the form has taken out of the user's hands. */
const lockedFieldStyle = { background: '#F3F4F6', cursor: 'not-allowed' };

function adaptValidity(v) {
  if (!v) return '1 Year';
  if (VALIDITY_OPTIONS.includes(v)) return v;
  const lower = v.toLowerCase();
  if (lower.includes('current')) return 'Current';
  if (lower.includes('3') && lower.includes('month')) return '3 Months';
  if (lower.includes('6') && lower.includes('month')) return '6 Months';
  if (lower.includes('month')) return '1 Month';
  if (lower.includes('year')) return '1 Year';
  return '1 Year';
}

/** Legal name is only meaningful when it differs from the trade name. */
function distinctLegalName(legal, client) {
  const l = (legal || '').trim();
  const c = (client || '').trim();
  return l && l.toLowerCase() !== c.toLowerCase() ? l : '';
}

export default function InvoiceModal({
  open, initialDocType, editingDoc, prefillDoc, convertFrom, onClose, onSave, onPreview, inline
}) {
  const { clients, invoices, showToast, stateRef } = useApp();
  const panelRef = useRef(null);

  const [docType, setDocType] = useState('invoice');
  const [country, setCountry] = useState('india');
  const [branch, setBranch] = useState('pune');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientAddr, setClientAddr] = useState('');
  const [gstApplicable, setGstApplicable] = useState('yes');
  const [hsn, setHsn] = useState('997331');
  const [clientGstin, setClientGstin] = useState('');
  const [clientLegalName, setClientLegalName] = useState('');
  const [items, setItems] = useState([blankItem()]);
  const [gstType, setGstType] = useState('cgst_sgst');
  const [gstRate, setGstRate] = useState('18');
  const [tdsRate, setTdsRate] = useState('0');
  const [tdsStatus, setTdsStatus] = useState('pending');
  const [payMode, setPayMode] = useState('UPI');
  const [status, setStatus] = useState('paid');
  const [received, setReceived] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [proformaDueDate, setProformaDueDate] = useState('');
  const [badField, setBadField] = useState(null);
  const [saving, setSaving] = useState(false);

  const fieldRefs = useRef({});
  const bind = (f) => (el) => { fieldRefs.current[f] = el; };
  const cls = (f) => 'form-input' + (badField === f ? ' field-error' : '');

  const isProforma = docType === 'proforma';
  const isEditing = !!editingDoc;
  // Converting a proforma seeds a brand-new tax invoice from it, so the form is
  // populated from a draft while still behaving as a new document.
  const isConverting = !!convertFrom && !isEditing;
  const sourceDoc = editingDoc || prefillDoc || null;
  const isDubai = branch === 'dubai';

  // Only the branches belonging to the chosen country — India offers Pune and
  // Bengaluru, Dubai offers Dubai alone.
  const branchChoices = BRANCHES.filter((b) => b.country === country);

  // Dubai wording: TRN instead of GSTIN, VAT instead of GST, AED amounts.
  const taxIdLabel = isDubai ? 'TRN' : 'GSTIN';
  const taxLabel = isDubai ? 'VAT' : 'GST';

  /* ---------- OPEN: populate ---------- */
  useEffect(() => {
    if (!open) return;
    setBadField(null);

    // `prefillDoc` seeds a NEW document (proforma → tax invoice conversion),
    // `editingDoc` loads an existing one — both populate the form identically.
    const source = editingDoc || prefillDoc;
    if (source) {
      const d = source;
      const b = d.branch || 'pune';
      setDocType(d.docType);
      setBranch(b);
      setCountry(b === 'dubai' ? 'dubai' : 'india');
      setInvoiceNo(d.invoiceNo || '');
      setInvoiceDate(dateToInput(d.invoiceDate));
      setClientId(d.clientId || '');
      setClientName(d.clientName || '');
      setClientAddr(d.clientAddress || '');
      setGstApplicable(d.gstApplicable || 'yes');
      setClientGstin(d.clientGstin || '');
      setClientLegalName(distinctLegalName(d.clientLegalName, d.clientName));
      setHsn(d.hsn || '997331');

      // Backward compat: invoices saved BEFORE multi-item support only have
      // top-level description/subType/etc — synthesise a one-row items array.
      const buildItem = (src) => {
        const isOthers = src.subType && !KNOWN_SUBTYPES.includes(src.subType);
        let total = src.totalAmount;
        if ((total == null || total === '') && src.netAmount) {
          const r = (+d.gstRate || 18) / 100;
          total = Math.round(+src.netAmount * (1 + r) * 100) / 100;
        }
        if ((total == null || total === '') && d.totalAmount && (!Array.isArray(d.items) || d.items.length === 0)) {
          total = d.totalAmount;
        }
        const st = isOthers ? 'Others' : (src.subType || 'New');
        return {
          description: src.description || 'CRM Application',
          subType: st,
          subTypeOther: isOthers ? src.subType : '',
          paymentDate: dateToInput(src.paymentDate) || '',
          noOfLicense: isBalanceOnly(st) ? '' : (src.noOfLicense || ''),
          validity: isBalanceOnly(st) ? '' : adaptValidity(src.validity),
          totalAmount: total || ''
        };
      };
      setItems(Array.isArray(d.items) && d.items.length > 0 ? d.items.map(buildItem) : [buildItem(d)]);

      setGstType(d.gstType || 'cgst_sgst');
      setGstRate(String(d.gstRate || (b === 'dubai' ? 5 : 18)));
      setTdsRate(String(d.tdsRate || 0));
      setTdsStatus(d.tdsStatus || 'pending');
      setPayMode(d.paymentMode || (b === 'dubai' ? 'BANK TRANSFER' : 'UPI'));
      setStatus(d.docType === 'proforma' ? 'due' : (d.status || 'paid'));
      // Receipts are stored as "amount received"; older documents only recorded
      // the outstanding balance, which receivedOf() back-derives.
      // Only meaningful while a balance is outstanding — a cleared invoice is
      // received in full by definition, and the field stays hidden.
      const rec = (d.docType === 'proforma' || d.status !== 'due') ? 0 : receivedOf(d);
      setReceived(rec ? String(rec) : '');
      setDueDate(dateToInput(d.dueDate));
      setProformaDueDate(dateToInput(d.dueDate));
    } else {
      const today = new Date().toISOString().slice(0, 10);
      setDocType(initialDocType || 'invoice');
      setCountry('india');
      setBranch('pune');
      setInvoiceDate(today);
      setClientId(''); setClientName(''); setClientAddr('');
      setGstApplicable('yes'); setClientGstin(''); setClientLegalName('');
      setHsn('997331');
      setItems([blankItem()]);
      setGstType('cgst_sgst');
      setGstRate('18');
      setTdsRate('0');
      setTdsStatus('pending');
      setPayMode(initialDocType === 'proforma' ? 'NEFT' : 'UPI');
      setStatus(initialDocType === 'proforma' ? 'due' : 'paid');
      setReceived(''); setDueDate(''); setProformaDueDate('');
    }
  }, [open, editingDoc, prefillDoc, initialDocType]);

  /* ---------- Invoice number autofill (new documents only) ---------- */
  useEffect(() => {
    if (!open || isEditing) return;
    // Prefix, padding and suffix all come from Settings → Numbering & Format.
    setInvoiceNo(nextDocNumber(stateRef.current.numbering, stateRef.current.invoices, docType, branch));
  }, [open, isEditing, docType, branch, stateRef]);

  // Keep the in-place editor on screen when it expands under a row near the fold.
  useEffect(() => {
    if (open && inline && panelRef.current) {
      panelRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [open, inline, editingDoc]);

  useEffect(() => { if (isProforma) setStatus('due'); }, [isProforma]);

  useEffect(() => {
    if (gstApplicable === 'no') { setClientGstin(''); setClientLegalName(''); }
  }, [gstApplicable]);

  /* ---------- GST Type follows the place of supply ----------
     The first two digits of a GSTIN are the client's state code. Matching the
     branch's own code (Pune 27 / Bengaluru 29) makes it an intra-state supply
     billed as CGST + SGST; any other state is inter-state, billed as IGST.
     Dubai is a VAT regime with no such split, so it is left untouched. */
  const branchName = (BRANCHES.find((b) => b.value === branch) || {}).name || branch;
  const branchStateCode = BRANCH_GST_STATE_CODE[branch] || '';
  const gstinStateCode = clientGstin.trim().substring(0, 2);
  const autoGstType = (!isDubai && gstApplicable !== 'no' && branchStateCode && gstinStateCode.length === 2)
    ? (gstinStateCode === branchStateCode ? 'cgst_sgst' : 'igst')
    : null;

  useEffect(() => {
    if (autoGstType) setGstType(autoGstType);
  }, [autoGstType]);

  /**
   * Dubai has a single branch and a flat VAT @ 5% — no CGST/SGST split, no HSN,
   * and Bank Transfer is the norm. Switching back to India restores the GST shape.
   */
  function onCountryChange(next) {
    setCountry(next);
    if (next === 'dubai') {
      setBranch('dubai');
      setGstType('igst'); // the IGST slot carries the single VAT line
      setGstRate('5');
      setPayMode((m) => (!m || ['UPI', 'NEFT', 'RTGS'].includes(m) ? 'BANK TRANSFER' : m));
    } else {
      setBranch((b) => (b === 'dubai' ? 'pune' : b));
      setGstRate((r) => (String(r) === '5' ? '18' : r));
      setGstType((t) => (t === 'igst' ? 'cgst_sgst' : t));
      setPayMode((m) => (m === 'BANK TRANSFER' ? 'UPI' : m));
    }
  }

  /* ---------- Amount calculation ----------
     Each item: user enters Total (incl. tax). Net = Total / (1 + rate/100). */
  const calc = useMemo(() => {
    const rate = parseFloat(gstRate) || (isDubai ? 5 : 18);
    let totalSum = 0, netSum = 0, gstSum = 0;
    for (const it of items) {
      const total = parseFloat(it.totalAmount) || 0;
      if (total <= 0) continue;
      const net = total / (1 + rate / 100);
      totalSum += total;
      netSum += net;
      gstSum += total - net;
    }
    const useIgstSlot = gstType === 'igst';
    return {
      total: totalSum ? totalSum.toFixed(2) : '',
      net: netSum ? netSum.toFixed(2) : '',
      cgst: (useIgstSlot ? 0 : gstSum / 2).toFixed(2),
      sgst: (useIgstSlot ? 0 : gstSum / 2).toFixed(2),
      igst: (useIgstSlot ? gstSum : 0).toFixed(2),
      tds: (netSum * (parseFloat(tdsRate) || 0) / 100) ? (netSum * (parseFloat(tdsRate) || 0) / 100).toFixed(2) : ''
    };
  }, [items, gstRate, gstType, tdsRate, isDubai]);

  /* ---------- Receipt vs balance ----------
     The client's transaction drives both figures: what came in counts towards
     revenue, and the remainder is the balance that stays under "due". */
  const totalVal = parseFloat(calc.total) || 0;
  const receivedVal = isProforma ? 0 : (status === 'due' ? Math.max(0, round2(received)) : totalVal);
  const outstandingVal = isProforma ? 0 : Math.max(0, round2(totalVal - receivedVal));

  // Live reconciliation figures for the proforma this invoice is raised against.
  const convertState = useMemo(
    () => (convertFrom ? proformaState(convertFrom, invoices) : null),
    [convertFrom, invoices]
  );
  // What the proforma still waits for drops by the money received here — raising
  // the invoice alone does not make the payment arrive.
  const proformaPendingAfter = convertState ? Math.max(0, round2(convertState.pending - receivedVal)) : 0;
  const overInvoicing = !!convertState && totalVal > convertState.unbilled + MONEY_EPS;
  const money = (n) => fmtMoneyForRegion(n, regionOf(branch));

  const updateItem = (idx, field, value) =>
    setItems((list) => list.map((it, i) => {
      if (i !== idx) return it;
      const next = { ...it, [field]: value };
      // Switching into "Balance Pay" clears the licence count and validity and
      // locks both; switching back out restores a usable default validity.
      if (field === 'subType') {
        if (isBalanceOnly(value)) { next.noOfLicense = ''; next.validity = ''; }
        else if (isBalanceOnly(it.subType)) { next.validity = next.validity || '1 Year'; }
      }
      return next;
    }));
  const addItemRow = () => setItems((list) => [...list, blankItem()]);
  const removeItemRow = (idx) => setItems((list) => (list.length <= 1 ? list : list.filter((_, i) => i !== idx)));

  // The picker sorts and filters these itself; it only needs value/label pairs.
  const clientOptions = useMemo(
    () => clients.map((c) => ({ value: c.id, label: c.name || '(unnamed client)' })),
    [clients]
  );

  /** Copy a saved client's details into the Bill To fields. */
  function fillFromClient(c) {
    setClientName(c.name);
    setClientAddr(c.address || '');
    setClientGstin(c.gstin || '');
    setClientLegalName(distinctLegalName(c.legalName, c.name));
    if (c.gstin) setGstApplicable('yes');
  }

  function onClientSelect(id) {
    setClientId(id);
    if (!id) return;
    const c = clients.find((x) => x.id === id);
    if (c) fillFromClient(c);
  }

  /**
   * Typing the Client Name is a second way into the same record: as soon as the
   * text matches a saved client the rest of Bill To is filled in from the
   * database, and a name that matches nothing is left alone to be typed out and
   * saved as a new client. Names are matched case-insensitively.
   */
  function onClientNameTyped(raw) {
    setClientName(raw);
    setBadField(null);
    const key = raw.trim().toLowerCase();
    const match = key ? clients.find((c) => (c.name || '').trim().toLowerCase() === key) : null;
    if (match) {
      if (match.id !== clientId) {
        setClientId(match.id);
        fillFromClient(match);
      }
    } else if (clientId) {
      // The name no longer belongs to the linked client — treat it as new so
      // saving creates the record rather than renaming an existing one.
      setClientId('');
    }
  }

  // Suggestions for the Client Name box, so the saved records are reachable by
  // typing as well as through the picker above.
  const clientNameList = useMemo(
    () => Array.from(new Set(clients.map((c) => (c.name || '').trim()).filter(Boolean))).sort(
      (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })
    ),
    [clients]
  );

  /** The saved record behind the current name, when there is one. */
  const linkedClient = useMemo(() => {
    const key = clientName.trim().toLowerCase();
    if (!key) return null;
    return clients.find((c) => c.id === clientId) || clients.find((c) => (c.name || '').trim().toLowerCase() === key) || null;
  }, [clients, clientId, clientName]);

  function fail(field, msg) {
    setBadField(field);
    const el = fieldRefs.current[field];
    if (el) { el.focus(); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    showToast(msg, 'error');
    return null;
  }

  function buildDocFromForm() {
    setBadField(null);

    if (items.length === 0) { showToast('Add at least one item', 'error'); return null; }
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const n = i + 1;
      if (!String(it.description || '').trim()) { showToast('Item ' + n + ': description is required', 'error'); return null; }
      if (!it.subType) { showToast('Item ' + n + ': sub-type is required', 'error'); return null; }
      if (it.subType === 'Others' && !String(it.subTypeOther || '').trim()) { showToast('Item ' + n + ': please specify the custom sub-type', 'error'); return null; }
      if (!it.paymentDate) { showToast('Item ' + n + ': payment date is required', 'error'); return null; }
      // Balance Pay carries neither — both print blank.
      if (!isBalanceOnly(it.subType)) {
        if (!String(it.noOfLicense || '').trim()) { showToast('Item ' + n + ': no of license is required', 'error'); return null; }
        if (!it.validity) { showToast('Item ' + n + ': validity is required', 'error'); return null; }
      }
      const amt = parseFloat(it.totalAmount);
      if (!amt || amt <= 0) { showToast('Item ' + n + ': total amount must be greater than zero', 'error'); return null; }
    }

    if (!invoiceNo.trim()) return fail('frmInvoiceNo', 'Invoice number is required');
    if (!invoiceDate) return fail('frmInvoiceDate', 'Invoice date is required');
    if (!clientName.trim()) return fail('frmClientName', 'Client name is required');
    if (!clientAddr.trim()) return fail('frmClientAddr', 'Client address is required');
    if (gstApplicable !== 'no') {
      if (!clientGstin.trim()) return fail('frmClientGstin', 'Client ' + taxIdLabel + ' is required');
      if (clientGstin.trim().length !== 15) {
        return fail('frmClientGstin', isDubai
          ? 'TRN must be exactly 15 digits'
          : 'GSTIN must be exactly 15 alphanumeric characters');
      }
    }
    if (isProforma) {
      if (!proformaDueDate) return fail('frmProformaDueDate', 'Payment due date is required');
    } else {
      if (!payMode) return fail('frmPayMode', 'Payment mode is required');
      if (status === 'due') {
        if (receivedVal > totalVal + MONEY_EPS) {
          return fail('frmReceived', 'Amount received cannot be more than the invoice total');
        }
        if (totalVal > 0 && receivedVal >= totalVal - MONEY_EPS) {
          return fail('frmReceived', 'The full amount is received — set Status to "Payments Cleared"');
        }
        if (!dueDate) return fail('frmDueDate', 'Payment due date is required');
      }
    }

    const docRate = parseFloat(gstRate) || (isDubai ? 5 : 18);
    const finalItems = items.map((it) => {
      let st = it.subType;
      const balanceOnly = isBalanceOnly(it.subType);
      if (st === 'Others') st = (it.subTypeOther || '').trim() || 'Others';
      const total = parseFloat(it.totalAmount) || 0;
      const net = total > 0 ? Math.round((total / (1 + docRate / 100)) * 100) / 100 : 0;
      const desc = String(it.description || 'CRM Application').trim();
      return {
        description: desc,
        subType: st,
        fullDescription: desc + ' ' + st,
        paymentDate: it.paymentDate,
        noOfLicense: balanceOnly ? '' : String(it.noOfLicense || '').trim(),
        validity: balanceOnly ? '' : it.validity,
        totalAmount: total,
        netAmount: net
      };
    });
    const first = finalItems[0];

    return {
      id: editingDoc ? editingDoc.id : null,
      docType,
      branch,
      invoiceNo: invoiceNo.trim(),
      invoiceDate,
      clientId: clientId || null,
      clientName: clientName.trim(),
      clientAddress: clientAddr.trim(),
      gstApplicable: gstApplicable === 'no' ? 'no' : 'yes',
      clientGstin: gstApplicable === 'no' ? '' : clientGstin.trim().toUpperCase(),
      clientLegalName: gstApplicable === 'no' ? '' : clientLegalName.trim(),
      hsn: isDubai ? '' : (hsn.trim() || '997331'),
      items: finalItems,
      // Top-level fields mirror the FIRST item for backward-compat
      description: first.description,
      subType: first.subType,
      fullDescription: first.fullDescription,
      paymentDate: first.paymentDate,
      noOfLicense: first.noOfLicense,
      validity: first.validity,
      gstType,
      gstRate: docRate,
      netAmount: parseFloat(calc.net) || 0,
      cgst: parseFloat(calc.cgst) || 0,
      sgst: parseFloat(calc.sgst) || 0,
      igst: parseFloat(calc.igst) || 0,
      totalAmount: parseFloat(calc.total) || 0,
      tdsRate: parseFloat(tdsRate) || 0,
      tdsAmount: parseFloat(calc.tds) || 0,
      tdsStatus,
      paymentMode: isProforma ? '' : payMode,
      status: isProforma ? 'due' : status,
      // What the client actually transacted, and the balance still owed on it.
      receivedAmount: receivedVal,
      amountDueOutstanding: outstandingVal,
      dueDate: isProforma ? proformaDueDate : dueDate,
      // Set when this tax invoice reconciles a proforma — the link that moves the
      // invoiced amount out of the proforma's pending payments.
      sourceProformaId: (sourceDoc && sourceDoc.sourceProformaId) || null,
      sourceProformaNo: (sourceDoc && sourceDoc.sourceProformaNo) || '',
      updatedAt: new Date().toISOString()
    };
  }

  /** `downloadAs` is 'word', 'pdf' or null — the format to hand back after saving. */
  async function submit(downloadAs) {
    if (saving) return;
    const doc = buildDocFromForm();
    if (!doc) return;
    setSaving(true);
    try {
      await onSave(doc, downloadAs, (field) => setBadField(field));
    } finally {
      setSaving(false);
    }
  }

  /** Render the document as it will be downloaded, without saving anything. */
  function doPreview() {
    const built = buildDocFromForm();
    if (!built) return;
    onPreview(built);
  }

  const footer = (
    <>
      <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
      {onPreview && (
        <button className="btn btn-secondary" onClick={doPreview} disabled={saving} title="See the finished document before downloading it">
          👁 Preview
        </button>
      )}
      <button className="btn btn-success" onClick={() => submit('word')} disabled={saving}>Save &amp; Word</button>
      <button className="btn btn-success" onClick={() => submit('pdf')} disabled={saving}>Save &amp; PDF</button>
      <button className="btn btn-primary" onClick={() => submit(null)} disabled={saving}>
        {saving ? 'Saving…' : (isConverting ? 'Create Tax Invoice' : 'Save')}
      </button>
    </>
  );

  const title = isConverting
    ? 'New Tax Invoice · reconciling ' + convertFrom.invoiceNo
    : isEditing
    ? 'Edit ' + (isProforma ? 'Proforma' : 'Tax Invoice') + (editingDoc.invoiceNo ? ' · ' + editingDoc.invoiceNo : '')
    : (initialDocType === 'invoice' ? 'New Tax Invoice' : 'New Proforma Invoice');

  const body = (
    <>
      {isConverting && convertState && (
        <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: 14, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, color: '#1E40AF', marginBottom: 8, fontSize: 13 }}>
            🔄 Reconciling proforma {convertFrom.invoiceNo} · {convertFrom.clientName}
          </div>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 12, color: '#1E3A8A' }}>
            <span>Proforma total: <strong>{money(convertState.total)}</strong></span>
            {convertState.invoiced > MONEY_EPS && (
              <span>Already invoiced: <strong>{money(convertState.invoiced)}</strong></span>
            )}
            <span>Not yet invoiced: <strong>{money(convertState.unbilled)}</strong></span>
            <span>Pending payment: <strong>{money(convertState.pending)}</strong></span>
            <span>This invoice: <strong>{money(totalVal)}</strong></span>
            <span>Received now: <strong>{money(receivedVal)}</strong></span>
            <span>Proforma pending after: <strong>{money(proformaPendingAfter)}</strong></span>
          </div>
          <div style={{ fontSize: 11, color: '#1E3A8A', marginTop: 8, lineHeight: 1.6 }}>
            Edit the items and the Payment Status below to match the transaction the client actually made.
            {' '}{money(receivedVal)} moves into Total Revenue and comes off the proforma&apos;s pending amount
            {outstandingVal > MONEY_EPS ? '; ' + money(outstandingVal) + ' stays as a balance under Due status' : ''}
            {proformaPendingAfter > MONEY_EPS
              ? '. ' + convertFrom.invoiceNo + ' keeps its own number and still shows ' + money(proformaPendingAfter) + ' pending'
              : '. ' + convertFrom.invoiceNo + ' is then settled in full'}.
          </div>
          {overInvoicing && (
            <div style={{ fontSize: 11, color: '#92400E', background: '#FEF3C7', borderRadius: 6, padding: '6px 10px', marginTop: 8 }}>
              ⚠ This invoice ({money(totalVal)}) is larger than the amount still to be invoiced on the proforma ({money(convertState.unbilled)}).
            </div>
          )}
        </div>
      )}

      <div className="form-grid">
        <div className="form-group">
          <label className="form-label">Document Type *</label>
          <select className="form-input" value={docType} onChange={(e) => setDocType(e.target.value)}>
            <option value="invoice">Tax Invoice</option>
            <option value="proforma">Proforma Invoice</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Country <span className="req">*</span></label>
          <select className="form-input" value={country} onChange={(e) => onCountryChange(e.target.value)}>
            <option value="india">🇮🇳 India</option>
            <option value="dubai">🇦🇪 Dubai</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Branch <span className="req">*</span></label>
          <select className="form-input" value={branch} disabled={isDubai} onChange={(e) => setBranch(e.target.value)}>
            {branchChoices.map((b) => <option key={b.value} value={b.value}>{b.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Invoice No *</label>
          <input ref={bind('frmInvoiceNo')} type="text" className={cls('frmInvoiceNo')}
            value={invoiceNo} onChange={(e) => { setInvoiceNo(e.target.value); setBadField(null); }} />
        </div>
        <div className="form-group">
          <label className="form-label">Invoice Date *</label>
          <input ref={bind('frmInvoiceDate')} type="date" className={cls('frmInvoiceDate')}
            value={invoiceDate} onChange={(e) => { setInvoiceDate(e.target.value); setBadField(null); }} />
        </div>
      </div>

      <hr className="section-divider" />
      <div className="card-title">Bill To</div>
      <div className="form-group">
        <label className="form-label">Client <span className="req">*</span></label>
        <SearchableSelect
          value={clientId}
          onChange={onClientSelect}
          options={clientOptions}
          placeholder="-- Select existing or enter new --"
          searchPlaceholder="Type to search clients..."
          emptyText="No matching client — type the details below to add a new one."
        />
      </div>
      <div className="form-grid">
        <div className="form-group form-grid-full">
          <label className="form-label">Client Name <span className="req">*</span></label>
          <input ref={bind('frmClientName')} type="text" className={cls('frmClientName')}
            list="clientNameSuggestions" autoComplete="off"
            placeholder="Start typing — saved clients fill themselves in"
            value={clientName} onChange={(e) => onClientNameTyped(e.target.value)} />
          <datalist id="clientNameSuggestions">
            {clientNameList.map((n) => <option key={n} value={n} />)}
          </datalist>
          <div className="password-hint">
            {linkedClient
              ? '✓ Matched saved client — address and ' + taxIdLabel + ' filled in from the database. Any edit below is saved back to this client.'
              : clientName.trim()
              ? '✦ New client — the details you enter here are saved to the database when the document is saved.'
              : 'Type a saved client’s name to pull its details, or enter a new one.'}
          </div>
        </div>
        <div className="form-group form-grid-full">
          <label className="form-label">Address <span className="req">*</span></label>
          <textarea ref={bind('frmClientAddr')} className={cls('frmClientAddr')} rows={2}
            value={clientAddr} onChange={(e) => { setClientAddr(e.target.value); setBadField(null); }} />
        </div>
        <div className="form-group">
          <label className="form-label">
            {isDubai ? 'Is TRN Available?' : 'Is GST Applicable?'} <span className="req">*</span>
          </label>
          <select className="form-input" value={gstApplicable} onChange={(e) => setGstApplicable(e.target.value)}>
            <option value="yes">{isDubai ? 'Yes — TRN available' : 'Yes — GST applicable'}</option>
            <option value="no">{isDubai ? 'No — TRN not available' : 'No — GST not applicable'}</option>
          </select>
          <div className="password-hint">
            {isDubai
              ? 'If "No", TRN will print as "NOT AVAILABLE" in the invoice'
              : 'If "No", GSTIN will print as "NOT APPLICABLE" in the invoice'}
          </div>
        </div>
        {!isDubai && (
          <div className="form-group">
            <label className="form-label">HSN/SAC</label>
            <input type="text" className="form-input" value={hsn} readOnly style={{ background: '#F3F4F6', cursor: 'not-allowed' }} />
            <div className="password-hint">Fixed for CRM Application services</div>
          </div>
        )}
        {gstApplicable !== 'no' && (
          <>
            <div className="form-group">
              <label className="form-label">{taxIdLabel} <span className="req">*</span></label>
              <input
                ref={bind('frmClientGstin')} type="text" className={cls('frmClientGstin')} maxLength={15}
                placeholder={isDubai ? '15-digit TRN' : '15-character GSTIN'}
                value={clientGstin}
                onChange={(e) => {
                  const raw = e.target.value;
                  const cleaned = isDubai
                    ? raw.replace(/[^0-9]/g, '').substring(0, 15)
                    : raw.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 15);
                  setClientGstin(cleaned);
                  setBadField(null);
                }}
              />
              <div className="password-hint">
                {isDubai
                  ? '15-digit Tax Registration Number (or set "Is TRN Available?" to No)'
                  : '15 alphanumeric characters · all uppercase (auto-formatted)'}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Legal Name</label>
              <input type="text" className="form-input" placeholder="Registered legal name (optional)"
                value={clientLegalName} onChange={(e) => setClientLegalName(e.target.value)} />
              <div className="password-hint">
                Optional · if entered, shown in invoice after {taxIdLabel} as (Legal Name). Leave blank if not applicable.
              </div>
            </div>
          </>
        )}
      </div>

      <hr className="section-divider" />
      <div className="card-title">Item Details</div>
      <div style={{ background: 'var(--brand-light)', padding: '10px 12px', borderRadius: 6, marginBottom: 12, fontSize: 12, color: 'var(--brand-dark)' }}>
        💡 Enter <strong>Total Amount</strong> (incl. {taxLabel}) for each item. Net Amount and {taxLabel} are auto-calculated. You can add multiple line items (e.g., CRM Renewal + Set-Up Fee on the same invoice).
      </div>
      <div>
        {items.map((it, idx) => (
          <div key={idx} className="card" style={{ marginBottom: 12, background: '#FAFBFC', border: '1px solid #E5E7EB', padding: 14, position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <strong style={{ color: 'var(--brand-dark)', fontSize: 13 }}>Item {idx + 1}</strong>
              {items.length > 1 && (
                <button type="button" className="icon-btn delete" onClick={() => removeItemRow(idx)} title="Remove this item">🗑</button>
              )}
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Description <span className="req">*</span></label>
                <input type="text" className="form-input" placeholder="e.g., CRM Application"
                  value={it.description} onChange={(e) => updateItem(idx, 'description', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Sub-type <span className="req">*</span></label>
                <select className="form-input" value={it.subType} onChange={(e) => updateItem(idx, 'subType', e.target.value)}>
                  {SUBTYPE_OPTIONS.map((o) => <option key={o} value={o}>{o === 'Others' ? 'Others (specify)' : o}</option>)}
                </select>
              </div>
              {it.subType === 'Others' && (
                <div className="form-group form-grid-full">
                  <label className="form-label">Specify Sub-type <span className="req">*</span></label>
                  <input type="text" className="form-input" placeholder="Enter custom sub-type description"
                    value={it.subTypeOther || ''} onChange={(e) => updateItem(idx, 'subTypeOther', e.target.value)} />
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Payment Date <span className="req">*</span></label>
                <input type="date" className="form-input" value={it.paymentDate || ''} onChange={(e) => updateItem(idx, 'paymentDate', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">No of License {!isBalanceOnly(it.subType) && <span className="req">*</span>}</label>
                <input type="text" className="form-input"
                  placeholder={isBalanceOnly(it.subType) ? '' : 'e.g., 30 or 50 Users'}
                  value={isBalanceOnly(it.subType) ? '' : (it.noOfLicense || '')}
                  disabled={isBalanceOnly(it.subType)}
                  style={isBalanceOnly(it.subType) ? lockedFieldStyle : undefined}
                  onChange={(e) => updateItem(idx, 'noOfLicense', e.target.value)} />
                {isBalanceOnly(it.subType) && <div className="password-hint">🔒 Blank on a {it.subType} line</div>}
              </div>
              <div className="form-group">
                <label className="form-label">Validity {!isBalanceOnly(it.subType) && <span className="req">*</span>}</label>
                {isBalanceOnly(it.subType) ? (
                  <>
                    <input type="text" className="form-input" value="" disabled readOnly style={lockedFieldStyle} />
                    <div className="password-hint">🔒 Blank on a {it.subType} line</div>
                  </>
                ) : (
                  <select className="form-input" value={it.validity} onChange={(e) => updateItem(idx, 'validity', e.target.value)}>
                    {VALIDITY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">
                  Total Amount (incl. {taxLabel}{isDubai ? ', AED' : ''}) <span className="req">*</span>
                </label>
                <input type="number" step="0.01" className="form-input" placeholder="e.g., 54000"
                  value={it.totalAmount} onChange={(e) => updateItem(idx, 'totalAmount', e.target.value)} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-secondary" onClick={addItemRow} style={{ marginTop: 8 }}>+ Add another item</button>

      {/* Dubai is a flat VAT @ 5% — there is no intra/inter-state split to choose */}
      {!isDubai && (
        <>
          <hr className="section-divider" />
          <div className="card-title">GST Type</div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">GST Type <span className="req">*</span></label>
              <select className="form-input" value={gstType} onChange={(e) => setGstType(e.target.value)}>
                <option value="cgst_sgst">CGST + SGST (Intra-state)</option>
                <option value="igst">IGST (Inter-state)</option>
              </select>
              <div className="password-hint">
                {autoGstType
                  ? 'Auto-selected: GSTIN starts ' + gstinStateCode + ' and ' + branchName + ' is ' + branchStateCode
                    + ' → ' + (autoGstType === 'cgst_sgst' ? 'Intra-state (CGST + SGST)' : 'Inter-state (IGST)')
                    + '. Change it here if the place of supply differs.'
                  : 'Set automatically from the client GSTIN once its first two digits are entered ('
                    + branchName + ' = ' + (branchStateCode || '—') + ' → Intra-state).'}
              </div>
            </div>
          </div>
        </>
      )}

      <hr className="section-divider" />
      <div className="card-title">Amount Calculation</div>
      <div style={{ background: 'var(--brand-light)', padding: 12, borderRadius: 8, marginBottom: 14, fontSize: 13, color: 'var(--brand-dark)' }}>
        {isDubai
          ? <>💡 <strong>Dubai:</strong> Total Amount is the sum of each item&apos;s Total in AED. Net Amount and VAT @ 5% are back-calculated.</>
          : <>💡 Total Amount is the sum of each item&apos;s Total. Net Amount and GST are back-calculated from Total at the configured GST rate.</>}
      </div>
      <div className="form-grid">
        <div className="form-group">
          <label className="form-label">
            {isDubai ? 'Total Amount (incl. VAT, AED) — auto-summed' : 'Total Amount (incl. GST) — auto-summed'}
          </label>
          <input type="number" step="0.01" className="form-input" value={calc.total} readOnly
            style={{ background: '#F3F4F6', cursor: 'not-allowed', fontWeight: 600 }} />
        </div>
        <div className="form-group">
          <label className="form-label">{taxLabel} Rate (%)</label>
          <input type="number" step="0.01" className="form-input" value={gstRate} onChange={(e) => setGstRate(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">{isDubai ? 'Net Amount (AED) — back-calculated' : 'Net Amount (back-calculated)'}</label>
          <input type="number" step="0.01" className="form-input" value={calc.net} readOnly
            style={{ background: '#F3F4F6', cursor: 'not-allowed' }} />
        </div>
        {!isDubai && (
          <>
            <div className="form-group">
              <label className="form-label">CGST (9%)</label>
              <input type="number" step="0.01" className="form-input" value={calc.cgst} readOnly />
            </div>
            <div className="form-group">
              <label className="form-label">SGST (9%)</label>
              <input type="number" step="0.01" className="form-input" value={calc.sgst} readOnly />
            </div>
          </>
        )}
        <div className="form-group">
          <label className="form-label">{isDubai ? 'VAT @ 5% (AED)' : 'IGST (18%)'}</label>
          <input type="number" step="0.01" className="form-input" value={calc.igst} readOnly />
        </div>
      </div>

      <hr className="section-divider" />
      <div className="card-title">TDS (Tax Deducted at Source)</div>
      <div style={{ background: '#FEF3C7', padding: '10px 12px', borderRadius: 6, marginBottom: 12, fontSize: 12, color: '#92400E' }}>
        🔒 TDS information is for internal/back-end records only — it will <strong>not</strong> appear on the invoice PDF.
      </div>
      <div className="form-grid">
        <div className="form-group">
          <label className="form-label">TDS Rate <span className="req">*</span></label>
          <select className="form-input" value={tdsRate} onChange={(e) => setTdsRate(e.target.value)}>
            <option value="0">No TDS (0%)</option>
            <option value="2">TDS @ 2%</option>
            <option value="10">TDS @ 10%</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">TDS Amount (auto)</label>
          <input type="number" step="0.01" className="form-input" value={calc.tds} readOnly />
          <div className="password-hint">Calculated as TDS Rate × Net Amount</div>
        </div>
        <div className="form-group">
          <label className="form-label">TDS Status</label>
          <select className="form-input" value={tdsStatus} onChange={(e) => setTdsStatus(e.target.value)}>
            <option value="pending">Pending</option>
            <option value="received">Received</option>
            <option value="not_applicable">Not Applicable</option>
          </select>
        </div>
      </div>

      <hr className="section-divider" />
      <div className="card-title">Payment Status</div>
      <div className="form-grid">
        {!isProforma && (
          <div className="form-group">
            <label className="form-label">Payment Mode <span className="req">*</span></label>
            <select ref={bind('frmPayMode')} className={cls('frmPayMode')} value={payMode} onChange={(e) => setPayMode(e.target.value)}>
              {PAYMENT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
        )}
        {!isProforma && (
          <div className="form-group">
            <label className="form-label">Status <span className="req">*</span></label>
            <select className="form-input" value={status} onChange={(e) => { setStatus(e.target.value); setBadField(null); }}>
              <option value="paid">Payments Cleared — full amount received</option>
              <option value="due">Amount Due — part or no payment received</option>
            </select>
          </div>
        )}
      </div>

      {!isProforma && status === 'due' && (
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Amount Received{isDubai ? ' (AED)' : ''}</label>
            <input ref={bind('frmReceived')} type="number" step="0.01" min="0" className={cls('frmReceived')}
              placeholder="0.00 — leave empty if nothing received yet"
              value={received} onChange={(e) => { setReceived(e.target.value); setBadField(null); }} />
            <div className="password-hint">Part payment the client has already transacted · counts towards Total Revenue</div>
          </div>
          <div className="form-group">
            <label className="form-label">Outstanding Amount Due — auto</label>
            <input type="number" step="0.01" className="form-input" value={outstandingVal.toFixed(2)}
              readOnly style={{ background: '#F3F4F6', cursor: 'not-allowed', fontWeight: 600 }} />
            <div className="password-hint">Total − Amount Received · the balance shown under Due status</div>
          </div>
          <div className="form-group">
            <label className="form-label">Payment Due Date <span className="req">*</span></label>
            <input ref={bind('frmDueDate')} type="date" className={cls('frmDueDate')}
              value={dueDate} onChange={(e) => { setDueDate(e.target.value); setBadField(null); }} />
          </div>
        </div>
      )}

      {!isProforma && status === 'paid' && totalVal > 0 && (
        <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#065F46' }}>
          ✓ {money(totalVal)} received in full · nothing outstanding on this invoice.
        </div>
      )}

      {isProforma && (
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Payment Due Date <span className="req">*</span></label>
            <input ref={bind('frmProformaDueDate')} type="date" className={cls('frmProformaDueDate')}
              value={proformaDueDate} onChange={(e) => { setProformaDueDate(e.target.value); setBadField(null); }} />
            <div className="password-hint">Date by which payment is expected on this proforma</div>
          </div>
        </div>
      )}
    </>
  );

  if (!open) return null;

  // Editing from a list opens the form in place, directly under the row that was
  // clicked, instead of floating a dialog over the page.
  if (inline) {
    return (
      <div className="inline-editor" ref={panelRef}>
        <div className="inline-editor-head">
          <div className="modal-title">{title}</div>
          <button className="modal-close" onClick={onClose} title="Close editor">&times;</button>
        </div>
        <div className="inline-editor-body">{body}</div>
        <div className="inline-editor-foot">{footer}</div>
      </div>
    );
  }

  return (
    <Modal open={open} title={title} onClose={onClose} footer={footer}>{body}</Modal>
  );
}
