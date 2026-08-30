import { useCallback, useState } from 'react';
import { useApp } from './AppContext';
import { LOGO_DATA_URI } from './logo';
import { signOutFirebase } from './auth';
import { generateDocx } from './docxGen';
import { generatePdf } from './pdfGen';
import {
  downloadClientTemplate, downloadDubaiTemplate, downloadInvoiceTemplate,
  exportInvoicesToExcel, normaliseBranch, pickCol, readSheetRows
} from './excelOps';
import { buildRestorePrompt, downloadBackupFile, parseBackupFile } from './backupOps';
import { NUMBER_SERIES } from './constants';
import {
  deepClone, fmtMoneyForRegion, formatExcelDate, invoicesForProforma, isValidEmail, MONEY_EPS,
  nextAvailableNumber, nextDocNumber, pad, proformaState, receivedOf, regionOf, round2,
  sameEmail, seriesConfig, seriesKeyFor, uid, visibleDocsFor
} from './utils';

import Dashboard from './components/Dashboard';
import InvoiceListPage from './components/InvoiceListPage';
import ClientsPage from './components/ClientsPage';
import BulkImportPage from './components/BulkImportPage';
import UsersPage from './components/UsersPage';
import SettingsPage from './components/SettingsPage';
import InvoiceModal from './components/InvoiceModal';
import ClientModal from './components/ClientModal';
import ClientBulkModal from './components/ClientBulkModal';
import UserModal from './components/UserModal';
import CreateUserModal from './components/CreateUserModal';
import AssignModal from './components/AssignModal';
import ForcePasswordModal from './components/ForcePasswordModal';
import UserDetailsModal from './components/UserDetailsModal';
import TdsModal from './components/TdsModal';
import DocumentPreviewModal from './components/DocumentPreviewModal';

const NAV = [
  { page: 'dashboard', label: 'Dashboard', perm: 'dashboard' },
  { page: 'invoices', label: 'Invoices', perm: 'invoices' },
  { page: 'proforma', label: 'Proforma', perm: 'proforma' },
  { page: 'clients', label: 'Clients', perm: 'clients' },
  { page: 'import', label: 'Bulk Import', perm: 'import' },
  { page: 'users', label: 'Users & Permissions', perm: 'admin_only' },
  { page: 'settings', label: 'Settings', perm: 'settings' }
];

const CLOSED_INVOICE_MODAL = { open: false, docType: 'invoice', editing: null, prefill: null, convertFrom: null };

export default function MainApp() {
  const {
    currentUser, users, stateRef,
    saveInvoices, saveClients, saveUsers, saveNumbering,
    reloadInvoices, reloadClients, reloadUsers, reloadRoles,
    buildBackupPayload, restoreBackup,
    clearSession, userCanAccess, refreshSessionUser, showToast
  } = useApp();

  const [page, setPage] = useState('dashboard');
  // Set when a dashboard card deep-links into a list with a filter pre-applied.
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState('');
  const [docRegionFilter, setDocRegionFilter] = useState('');
  const [clientRegionFilter, setClientRegionFilter] = useState('');
  // Set when the Clients page opens a list narrowed to one client's documents.
  const [docClientFilter, setDocClientFilter] = useState('');

  // `prefill` seeds a new document from an existing one and `convertFrom` is the
  // proforma being reconciled — both empty for a plain new/edit.
  const [invoiceModal, setInvoiceModal] = useState(CLOSED_INVOICE_MODAL);
  const [clientModal, setClientModal] = useState({ open: false, editing: null });
  const [clientBulk, setClientBulk] = useState({ open: false, rows: [] });
  const [userModal, setUserModal] = useState({ open: false, email: null });
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [assignModal, setAssignModal] = useState({ open: false, id: null });
  const [userDetails, setUserDetails] = useState({ open: false, email: null });
  const [tdsOpen, setTdsOpen] = useState(false);
  // `doc` may be an unsaved draft from the form; `sourceId` is set when the
  // preview was opened from a list row, so Edit knows what to reopen.
  const [preview, setPreview] = useState({ open: false, doc: null, sourceId: null });
  const [pendingImport, setPendingImport] = useState(null);

  const isAdmin = currentUser && currentUser.role === 'admin';
  const perms = (currentUser && currentUser.permissions) || {};

  /* ---------------- PERMISSION GATE ----------------
     Every action checks this, and every handler re-checks it rather than
     trusting that the button was hidden — a hidden control is a convenience,
     not enforcement. `mod` is a PERMISSION_MODULES key ('invoices',
     'proforma', 'clients', 'import'); admins pass everything. */
  const can = useCallback(
    (mod, action) => !!isAdmin || !!((perms[mod] || {})[action]),
    [isAdmin, perms]
  );

  /** Documents are governed by the module matching their type. */
  const modOf = (docType) => (docType === 'proforma' ? 'proforma' : 'invoices');

  /** Refuse an action the user has no right to, with a reason they can act on. */
  const deny = useCallback((what) => {
    showToast('You do not have permission to ' + what, 'error');
    return false;
  }, [showToast]);

  /* ---------------- NAVIGATION ---------------- */
  /**
   * `filter` is a status on the document lists and a region on the clients page;
   * `region` narrows a document list to India (Pune + Bengaluru) or Dubai, so a
   * dashboard card opened from the Dubai tab lands on Dubai documents only.
   */
  const navigate = useCallback(async (next, filter, region, clientId) => {
    if (!userCanAccess(next)) {
      showToast('You do not have permission to access this section', 'error');
      return;
    }
    setPage(next);
    if (next === 'invoices' || next === 'proforma') {
      setInvoiceStatusFilter(next === 'invoices' ? (filter || '') : '');
      setDocRegionFilter(region || '');
      setDocClientFilter(clientId || '');
    } else if (next === 'clients') setClientRegionFilter(filter || '');
    // Refresh shared data so this tab sees anything created in other sessions.
    try {
      if (next === 'users') await Promise.all([reloadUsers(), reloadRoles()]);
      else if (next === 'dashboard') await Promise.all([reloadUsers(), reloadRoles(), reloadInvoices(), reloadClients()]);
      else if (next === 'invoices' || next === 'proforma') await Promise.all([reloadInvoices(), reloadClients()]);
      else if (next === 'clients') await reloadClients();
    } catch (e) { console.warn('Refresh failed', e); }
  }, [userCanAccess, showToast, reloadUsers, reloadRoles, reloadInvoices, reloadClients]);

  async function doSignOut() {
    // Drop the local session first — the auth observer restores an admin session
    // from storage, so it must already be gone when Firebase reports the sign-out.
    clearSession();
    await signOutFirebase();
  }

  /* ---------------- INVOICES ---------------- */
  const openInvoiceForm = (docType) => {
    if (!can(modOf(docType), 'create')) return deny('create ' + (docType === 'proforma' ? 'proformas' : 'tax invoices'));
    setInvoiceModal({ ...CLOSED_INVOICE_MODAL, open: true, docType });
  };

  const editInvoice = (id) => {
    // Clicking edit again on the row already being edited closes the editor.
    if (invoiceModal.open && invoiceModal.editing && invoiceModal.editing.id === id) {
      return setInvoiceModal(CLOSED_INVOICE_MODAL);
    }
    const d = stateRef.current.invoices.find((x) => x.id === id);
    if (!d) return;
    if (!can(modOf(d.docType), 'edit')) return deny('edit this document');
    setTdsOpen(false);
    setInvoiceModal({ ...CLOSED_INVOICE_MODAL, open: true, docType: d.docType, editing: d });
  };

  async function deleteInvoice(id) {
    const doomed = stateRef.current.invoices.find((x) => x.id === id);
    if (doomed && !can(modOf(doomed.docType), 'delete')) return deny('delete this document');
    const linkedNo = doomed && doomed.sourceProformaNo;
    const msg = linkedNo
      ? 'Delete this tax invoice? This cannot be undone.\n\nIts amount goes back to pending on proforma ' + linkedNo + '.'
      : 'Delete this document? This cannot be undone.';
    if (!confirm(msg)) return;

    let next = stateRef.current.invoices.filter((d) => d.id !== id);
    // Deleting a tax invoice reopens that slice of its proforma, so the stamps
    // pointing at it have to go too.
    if (doomed && doomed.sourceProformaId) {
      const stillLinked = invoicesForProforma(next, doomed.sourceProformaId);
      const last = stillLinked[stillLinked.length - 1] || null;
      next = next.map((x) => (x.id !== doomed.sourceProformaId ? x : {
        ...x,
        convertedInvoiceIds: stillLinked.map((v) => v.id),
        convertedToInvoiceId: last ? last.id : null,
        convertedToInvoiceNo: last ? last.invoiceNo : '',
        updatedAt: new Date().toISOString()
      }));
    }
    await saveInvoices(next);
    showToast('Deleted');
  }

  /** `format` is 'word' or 'pdf' — both render the same layout. */
  async function downloadDocument(id, format) {
    const d = stateRef.current.invoices.find((x) => x.id === id);
    if (!d) return showToast('Document not found', 'error');
    if (!can(modOf(d.docType), 'generatePdf')) return deny('generate documents');
    const label = format === 'pdf' ? 'PDF' : 'Word doc';
    try {
      const fname = format === 'pdf'
        ? await generatePdf(d, stateRef.current.company)
        : await generateDocx(d, stateRef.current.company);
      showToast(label + ' downloaded: ' + fname);
    } catch (err) {
      console.error(err);
      showToast('Failed to generate ' + label + ': ' + (err.message || err), 'error');
    }
  }
  const downloadInvoice = (id) => downloadDocument(id, 'word');
  const downloadInvoicePdf = (id) => downloadDocument(id, 'pdf');

  /** Preview a saved document straight from its list row. */
  function previewDocument(id) {
    const d = stateRef.current.invoices.find((x) => x.id === id);
    if (!d) return showToast('Document not found', 'error');
    setPreview({ open: true, doc: d, sourceId: id });
  }

  /** Preview an unsaved draft handed over by the invoice form. */
  function previewDraft(draft) {
    setPreview({ open: true, doc: draft, sourceId: null });
  }

  const closePreview = () => setPreview({ open: false, doc: null, sourceId: null });

  /** Download the previewed document — it may not be saved yet, so use the object. */
  async function downloadPreviewed(format) {
    const d = preview.doc;
    if (!d) return;
    const label = format === 'pdf' ? 'PDF' : 'Word doc';
    try {
      const fname = format === 'pdf'
        ? await generatePdf(d, stateRef.current.company)
        : await generateDocx(d, stateRef.current.company);
      showToast(label + ' downloaded: ' + fname);
    } catch (err) {
      console.error(err);
      showToast('Failed to generate ' + label + ': ' + (err.message || err), 'error');
    }
  }

  function exportToExcel(docType) {
    if (!can(modOf(docType), 'export')) return deny('export this data');
    const list = visibleDocsFor(stateRef.current.invoices, currentUser).filter((d) => d.docType === docType);
    if (list.length === 0) return showToast('No data to export', 'warn');
    exportInvoicesToExcel(list, docType, stateRef.current.invoices);
    showToast('Exported');
  }

  async function saveInvoiceDoc(doc, downloadAs, setBadField) {
    const isNew = !doc.id;
    // The write itself is gated, not just the button that opened the form.
    const mod = modOf(doc.docType);
    if (!can(mod, isNew ? 'create' : 'edit')) {
      return deny(isNew ? 'create documents' : 'edit this document');
    }
    if (downloadAs && !can(mod, 'generatePdf')) return deny('generate documents');
    // Reload so we catch invoices created since this tab loaded.
    const latest = await reloadInvoices();

    const d = { ...doc };
    if (isNew) d.id = uid();
    const existing = latest.find((x) => x.id === d.id);
    d.createdAt = existing ? (existing.createdAt || new Date().toISOString()) : new Date().toISOString();

    // Who raised the document, and who touched it last — the list shows the author.
    const me = currentUser || {};
    if (existing) {
      d.createdBy = existing.createdBy || '';
      d.createdByEmail = existing.createdByEmail || '';
      // Assignment lives outside the form, so an edit must carry it across —
      // otherwise saving a document would silently unassign it.
      d.assignedTo = existing.assignedTo || '';
      d.assignedToName = existing.assignedToName || '';
      d.assignedAt = existing.assignedAt || '';
      d.assignedBy = existing.assignedBy || '';
      d.assignmentNote = existing.assignmentNote || '';
    } else {
      d.createdBy = me.name || me.email || '';
      d.createdByEmail = me.email || '';
      d.assignedTo = d.assignedTo || '';
    }
    d.updatedBy = me.name || me.email || '';

    // === DUPLICATE PROTECTION ===
    const clash = latest.find((x) => x.invoiceNo === d.invoiceNo && x.id !== d.id);
    if (clash) {
      if (!isNew) {
        showToast('Invoice number "' + d.invoiceNo + '" already exists for ' + (clash.clientName || 'another invoice') + '. Please use a unique number.', 'error');
        setBadField('frmInvoiceNo');
        return;
      }
      // New invoice — auto-bump to the next available number on the actual prefix.
      const cfg = seriesConfig(stateRef.current.numbering, seriesKeyFor(d.docType, d.branch));
      let { prefix, pad: padLen, suffix } = cfg;
      // A hand-typed number outside the configured series keeps its own shape.
      if (!d.invoiceNo.startsWith(prefix)) {
        const m = d.invoiceNo.match(/^(.*?)(\d+)(\D*)$/);
        if (m) { prefix = m[1]; padLen = m[2].length; suffix = m[3]; }
      }
      d.invoiceNo = prefix + pad(nextAvailableNumber(latest, prefix, 1), padLen) + suffix;
      showToast('Invoice number was bumped to ' + d.invoiceNo + ' to prevent a duplicate.', 'warn');
    }

    // The Bill To block is the client record: link it by id or by name, create
    // it when the name is new, and write any details typed here back so the
    // database stays the single source the next invoice fills itself from.
    let clientList = stateRef.current.clients;
    if (d.clientName) {
      const byName = (c) => (c.name || '').trim().toLowerCase() === d.clientName.trim().toLowerCase();
      const found = (d.clientId && clientList.find((c) => c.id === d.clientId)) || clientList.find(byName);
      if (found) {
        d.clientId = found.id;
        // Only fields the form actually carries are considered, and a blank is
        // never allowed to wipe a detail already on record.
        const patch = {};
        if (d.clientName.trim() && d.clientName.trim() !== (found.name || '')) patch.name = d.clientName.trim();
        if (d.clientAddress && d.clientAddress !== (found.address || '')) patch.address = d.clientAddress;
        if (d.clientGstin && d.clientGstin !== (found.gstin || '')) patch.gstin = d.clientGstin;
        if (d.clientLegalName && d.clientLegalName !== (found.legalName || '')) patch.legalName = d.clientLegalName;
        if (Object.keys(patch).length) {
          patch.updatedAt = new Date().toISOString();
          clientList = clientList.map((c) => (c.id === found.id ? { ...c, ...patch } : c));
          await saveClients(clientList);
        }
      } else {
        const newClient = {
          id: uid(),
          name: d.clientName,
          legalName: d.clientLegalName || d.clientName,
          address: d.clientAddress,
          gstin: d.clientGstin,
          createdAt: new Date().toISOString()
        };
        clientList = [...clientList, newClient];
        d.clientId = newClient.id;
        await saveClients(clientList);
      }
    }

    // Reconciliation links live on the documents rather than in the form, so
    // carry them across an edit — otherwise saving a document would silently
    // break a proforma → tax invoice link.
    if (existing) {
      if (!d.sourceProformaId && existing.sourceProformaId) {
        d.sourceProformaId = existing.sourceProformaId;
        d.sourceProformaNo = existing.sourceProformaNo || '';
      }
      if (existing.docType === 'proforma') {
        d.convertedToInvoiceId = existing.convertedToInvoiceId || null;
        d.convertedToInvoiceNo = existing.convertedToInvoiceNo || '';
        d.convertedInvoiceIds = existing.convertedInvoiceIds || [];
      }
    }

    const nextInvoices = isNew || !existing
      ? [...latest, d]
      : latest.map((x) => (x.id === d.id ? d : x));

    // Stamp the proforma this tax invoice reconciles. Pending amounts are always
    // derived from the linked invoices, so these fields are only for display.
    let reconciled = null;
    if (d.docType === 'invoice' && d.sourceProformaId) {
      const idx = nextInvoices.findIndex((x) => x.id === d.sourceProformaId && x.docType === 'proforma');
      if (idx !== -1) {
        const source = nextInvoices[idx];
        const stamped = {
          ...source,
          convertedToInvoiceId: d.id,
          convertedToInvoiceNo: d.invoiceNo,
          convertedInvoiceIds: Array.from(new Set([...(source.convertedInvoiceIds || []), d.id])),
          updatedAt: new Date().toISOString()
        };
        nextInvoices[idx] = stamped;
        reconciled = { proforma: stamped, state: proformaState(stamped, nextInvoices) };
      }
    }

    if (isNew) {
      const n = stateRef.current.numbering;
      const bumped = { ...n };
      for (const s of NUMBER_SERIES) {
        const c = seriesConfig(n, s.key);
        bumped[s.nextKey] = nextAvailableNumber(nextInvoices, c.prefix, c.next);
      }
      await saveNumbering(bumped);
    }
    await saveInvoices(nextInvoices);

    setInvoiceModal(CLOSED_INVOICE_MODAL);
    if (reconciled) {
      const region = regionOf(d.branch);
      const pending = reconciled.state.pending;
      // The new tax invoice belongs to the Invoices section — go show it there.
      if (isNew && userCanAccess('invoices')) navigate('invoices', '', regionOf(d.branch));
      showToast('\u2713 ' + d.invoiceNo + ' ' + (isNew ? 'created from ' : 'updated against ') + reconciled.proforma.invoiceNo +
        ' \u00B7 ' + fmtMoneyForRegion(receivedOf(d), region) + ' received' +
        (pending > MONEY_EPS
          ? ' \u00B7 ' + fmtMoneyForRegion(pending, region) + ' still to be received on ' + reconciled.proforma.invoiceNo
          : ' \u00B7 ' + reconciled.proforma.invoiceNo + ' settled in full'));
    } else {
      showToast('Saved successfully');
    }
    if (downloadAs) {
      const label = downloadAs === 'pdf' ? 'PDF' : 'Word doc';
      try {
        const fname = downloadAs === 'pdf'
          ? await generatePdf(d, stateRef.current.company)
          : await generateDocx(d, stateRef.current.company);
        showToast(label + ' downloaded: ' + fname);
      } catch (err) {
        showToast('Failed to generate ' + label + ': ' + (err.message || err), 'error');
      }
    }
  }

  /**
   * Reconcile a proforma into a tax invoice. This opens the tax invoice form
   * seeded from the proforma so the items, amounts and the receipt can be edited
   * to match the transaction the client actually made; saving it is what moves
   * the money out of the proforma's pending payments (see saveInvoiceDoc).
   *
   * A proforma can be invoiced in parts — every tax invoice carries
   * `sourceProformaId`, and whatever those invoices do not cover stays pending.
   */
  async function startProformaConversion(proformaId) {
    if (!userCanAccess('invoices', 'create')) {
      return showToast('You do not have permission to create tax invoices', 'error');
    }
    const latest = await reloadInvoices();
    const p = latest.find((x) => x.id === proformaId);
    if (!p || p.docType !== 'proforma') return showToast('Proforma not found', 'error');

    const st = proformaState(p, latest);
    if (st.unbilled <= MONEY_EPS) {
      const last = st.linked[st.linked.length - 1] || null;
      return showToast('Proforma ' + p.invoiceNo + ' is already fully invoiced' +
        (last ? ' (' + last.invoiceNo + ')' : '') +
        (st.pending > MONEY_EPS
          ? ' — record the balance received on that tax invoice instead.'
          : '. Edit or delete that tax invoice to redo it.'), 'error');
    }

    const branch = p.branch || 'pune';
    const today = new Date().toISOString().slice(0, 10);
    const draft = {
      ...deepClone(p),
      id: null,
      docType: 'invoice',
      invoiceNo: nextDocNumber(stateRef.current.numbering, latest, 'invoice', branch),
      invoiceDate: today,
      paymentMode: p.paymentMode || (branch === 'dubai' ? 'BANK TRANSFER' : 'NEFT'),
      // Converting normally means the money has arrived; the form's Payment
      // Status can be switched to "Amount Due" to record a part payment instead.
      status: 'paid',
      receivedAmount: null,
      amountDueOutstanding: 0,
      dueDate: p.dueDate || today,
      sourceProformaId: p.id,
      sourceProformaNo: p.invoiceNo
    };
    delete draft.convertedToInvoiceId;
    delete draft.convertedToInvoiceNo;
    delete draft.convertedInvoiceIds;
    delete draft.createdAt;
    delete draft.updatedAt;

    // A proforma that has already been part-invoiced opens as a single balance
    // line, so the default is the amount still pending — not the full proforma.
    if (st.invoiced > MONEY_EPS) {
      const src = (Array.isArray(p.items) && p.items[0]) || p;
      const rate = +p.gstRate || (branch === 'dubai' ? 5 : 18);
      draft.items = [{
        ...deepClone(src),
        subType: 'Balance Pay',
        paymentDate: today,
        totalAmount: st.unbilled,
        netAmount: round2(st.unbilled / (1 + rate / 100))
      }];
      draft.totalAmount = st.unbilled;
    }

    setTdsOpen(false);
    setInvoiceModal({ open: true, docType: 'invoice', editing: null, prefill: draft, convertFrom: p });
  }

  /* ---------------- BACKUP / RESTORE ---------------- */
  function onDownloadBackup() {
    try {
      const payload = buildBackupPayload();
      downloadBackupFile(payload);
      showToast('Backup downloaded (' + payload._counts.invoices + ' invoices, ' + payload._counts.clients + ' clients, ' + payload._counts.users + ' users)');
    } catch (e) {
      console.error('Backup failed', e);
      showToast('Backup failed: ' + (e.message || e), 'error');
    }
  }

  async function onLoadBackup(file) {
    try {
      const payload = await parseBackupFile(file);
      const s = stateRef.current;
      const current = {
        invoices: (s.invoices || []).length,
        clients: (s.clients || []).length,
        users: (s.users || []).length
      };
      if (!confirm(buildRestorePrompt(payload, current))) return;
      const counts = await restoreBackup(payload.data);
      showToast('Backup loaded: ' + counts.invoices + ' invoices, ' + counts.clients + ' clients, ' + counts.users + ' users');
    } catch (e) {
      console.error('Restore failed', e);
      showToast('Restore failed: ' + (e.message || e), 'error');
    }
  }

  /* ---------------- CLIENTS ---------------- */
  const openClientForm = () => {
    if (!can('clients', 'create')) return deny('add clients');
    setClientModal({ open: true, editing: null });
  };
  const editClient = (id) => {
    if (!can('clients', 'edit')) return deny('edit clients');
    setClientModal({ open: true, editing: stateRef.current.clients.find((c) => c.id === id) || null });
  };

  async function saveClientRecord(data) {
    const editing = clientModal.editing;
    if (!can('clients', editing ? 'edit' : 'create')) return deny(editing ? 'edit clients' : 'add clients');
    const list = editing
      ? stateRef.current.clients.map((c) => (c.id === editing.id ? { ...c, ...data } : c))
      : [...stateRef.current.clients, { id: uid(), ...data, createdAt: new Date().toISOString() }];
    await saveClients(list);
    setClientModal({ open: false, editing: null });
    showToast('Client saved');
  }

  async function deleteClient(id) {
    if (!can('clients', 'delete')) return deny('delete clients');
    if (!confirm('Delete this client? Invoices for this client will not be deleted but will lose link.')) return;
    await saveClients(stateRef.current.clients.filter((c) => c.id !== id));
    showToast('Client deleted');
  }

  function onDownloadClientTemplate() {
    try {
      downloadClientTemplate();
      showToast('Template downloaded — fill it in and upload via Bulk Upload');
    } catch (e) {
      showToast('Failed to build template: ' + (e.message || e), 'error');
    }
  }

  async function handleClientBulkFile(file) {
    try {
      const rows = await readSheetRows(file);
      if (rows.length === 0) throw new Error('Sheet is empty');

      const latest = await reloadClients();
      const existingGstins = new Set(latest.map((c) => (c.gstin || '').toUpperCase()).filter(Boolean));
      const existingNames = new Set(latest.map((c) => (c.name || '').trim().toLowerCase()));

      const parsed = rows.map((r, i) => {
        const name = pickCol(r, 'client_name', 'clientname', 'name');
        const legalName = pickCol(r, 'legal_name', 'legalname', 'registeredname');
        const address = pickCol(r, 'address', 'clientaddress', 'addr');
        const city = pickCol(r, 'city', 'town');
        const gstin = pickCol(r, 'gstin', 'client_gstin', 'gst').toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 15);
        const email = pickCol(r, 'email', 'email_id', 'client_email', 'emailaddress');
        const phone = pickCol(r, 'contact_number', 'contact', 'phone', 'mobile', 'client_contact', 'contactno');

        const errors = [];
        if (name.toLowerCase().startsWith('note:')) {
          errors.push('comment row, skipped');
        } else {
          if (!name) errors.push('client_name missing');
          if (!address) errors.push('address missing');
          if (!gstin) errors.push('gstin missing');
          else if (gstin.length !== 15) errors.push('gstin must be 15 characters');
          if (name && existingNames.has(name.toLowerCase())) errors.push('client name already exists');
          if (gstin && existingGstins.has(gstin)) errors.push('gstin already exists');
          // Optional columns — only block the row when what's there is unusable.
          if (email && !isValidEmail(email)) errors.push('email is not valid');
          if (phone) {
            const digits = phone.replace(/\D/g, '');
            if (digits.length < 7 || digits.length > 15) errors.push('contact_number must be 7–15 digits');
          }
        }
        return { rowNo: i + 2, name, legalName, address, city, gstin, email, phone, errors, valid: errors.length === 0 };
      });

      setClientBulk({ open: true, rows: parsed });
    } catch (err) {
      console.error(err);
      showToast('Failed to read file: ' + (err.message || err), 'error');
    }
  }

  async function confirmClientBulkImport() {
    const valid = clientBulk.rows.filter((r) => r.valid);
    if (valid.length === 0) return showToast('No valid rows to import', 'error');

    const latest = await reloadClients();
    const existingGstins = new Set(latest.map((c) => (c.gstin || '').toUpperCase()).filter(Boolean));
    const existingNames = new Set(latest.map((c) => (c.name || '').trim().toLowerCase()));

    const next = [...latest];
    let added = 0, skippedNow = 0;
    const now = new Date().toISOString();
    for (const r of valid) {
      if (existingGstins.has(r.gstin) || existingNames.has(r.name.toLowerCase())) { skippedNow++; continue; }
      next.push({
        id: uid(), name: r.name, legalName: r.legalName, address: r.address, city: r.city,
        gstin: r.gstin, email: r.email, phone: r.phone, createdAt: now
      });
      existingGstins.add(r.gstin);
      existingNames.add(r.name.toLowerCase());
      added++;
    }
    await saveClients(next);
    setClientBulk({ open: false, rows: [] });
    let msg = 'Imported ' + added + ' client' + (added === 1 ? '' : 's');
    if (skippedNow > 0) msg += ' · ' + skippedNow + ' skipped (duplicates added by another user just now)';
    showToast(msg);
  }

  /* ---------------- BULK INVOICE IMPORT ---------------- */
  async function handleExcelUpload(file) {
    try {
      const rows = await readSheetRows(file, { cellDates: true });
      if (rows.length === 0) return showToast('Excel is empty', 'error');
      setPendingImport(rows);
    } catch (err) {
      showToast('Failed to read Excel: ' + err.message, 'error');
    }
  }

  async function confirmImport() {
    if (!pendingImport) return;
    const nextClients = [...stateRef.current.clients];
    const nextInvoices = [...stateRef.current.invoices];

    // Rows sharing an invoice_no become one multi-item invoice: shared fields
    // (client, branch, dates) come from the FIRST row, and each row contributes
    // one line item.
    const groups = new Map();
    const orderedInvoiceNos = [];
    let skipped = 0;
    for (const r of pendingImport) {
      if (String(r.doc_type || '').toUpperCase() === 'NOTE') continue; // template help row
      if (!r.invoice_no || !r.client_name) { skipped++; continue; }
      const key = String(r.invoice_no).trim();
      if (!groups.has(key)) { groups.set(key, []); orderedInvoiceNos.push(key); }
      groups.get(key).push(r);
    }

    let added = 0, mergedItems = 0;
    for (const invoiceNo of orderedInvoiceNos) {
      const rowsForInvoice = groups.get(invoiceNo);
      const first = rowsForInvoice[0];

      const branch = normaliseBranch(first.branch);
      const isDubai = branch === 'dubai';
      const docType = String(first.doc_type || 'invoice').toLowerCase().includes('pro') ? 'proforma' : 'invoice';
      const dt = formatExcelDate(first.invoice_date);
      const dueD = formatExcelDate(first.due_date);
      const status = String(first.status || 'paid').toLowerCase().includes('due') ? 'due' : 'paid';

      // India uses client_gstin, Dubai uses client_trn — accept either column.
      const taxId = String(first.client_trn || first.client_gstin || '').trim();

      const rowEmail = String(first.client_email || '').trim();
      const rowPhone = String(first.client_contact || first.contact_number || '').trim();

      let client = nextClients.find((c) => (c.name || '').toLowerCase() === String(first.client_name).toLowerCase());
      if (!client) {
        client = {
          id: uid(),
          name: first.client_name,
          address: first.client_address || '',
          gstin: taxId,
          email: rowEmail,
          phone: rowPhone,
          country: isDubai ? 'dubai' : 'india',
          createdAt: new Date().toISOString()
        };
        nextClients.push(client);
      } else if ((rowEmail && !client.email) || (rowPhone && !client.phone)) {
        // Fill blanks on an existing client, but never overwrite what's there.
        const filled = { ...client, email: client.email || rowEmail, phone: client.phone || rowPhone };
        nextClients[nextClients.indexOf(client)] = filled;
        client = filled;
      }

      const items = rowsForInvoice.map((r) => {
        const baseDesc = r.description || (isDubai ? 'Leadrat CRM Software' : 'CRM Application');
        const subType = r.sub_type || '';
        return {
          description: baseDesc,
          subType,
          fullDescription: subType ? baseDesc + ' ' + subType : baseDesc,
          paymentDate: formatExcelDate(r.payment_date),
          noOfLicense: String(r.no_of_license || ''),
          validity: r.validity || '1 Year',
          netAmount: parseFloat(r.net_amount) || 0,
          totalAmount: parseFloat(r.total_amount) || 0
        };
      });
      if (items.length > 1) mergedItems += items.length - 1;

      const netSum = items.reduce((s, it) => s + (it.netAmount || 0), 0);
      const totalSum = items.reduce((s, it) => s + (it.totalAmount || 0), 0);

      // Dubai's single vat_amount collapses into the IGST slot.
      let cgstSum = 0, sgstSum = 0, igstSum = 0;
      if (isDubai) {
        igstSum = rowsForInvoice.reduce((s, r) => s + (parseFloat(r.vat_amount) || 0), 0);
        if (igstSum === 0 && totalSum > 0 && netSum > 0) igstSum = Math.round((totalSum - netSum) * 100) / 100;
      } else {
        cgstSum = rowsForInvoice.reduce((s, r) => s + (parseFloat(r.cgst) || 0), 0);
        sgstSum = rowsForInvoice.reduce((s, r) => s + (parseFloat(r.sgst) || 0), 0);
        igstSum = rowsForInvoice.reduce((s, r) => s + (parseFloat(r.igst) || 0), 0);
      }

      // Older templates had no amount_due column — fall back to the total.
      const explicitAmtDue = parseFloat(first.amount_due);
      const outstandingAmt = !isNaN(explicitAmtDue) && explicitAmtDue > 0
        ? explicitAmtDue
        : (status === 'due' ? totalSum : 0);

      nextInvoices.push({
        id: uid(),
        docType,
        branch,
        invoiceNo,
        invoiceDate: dt,
        clientId: client.id,
        clientName: first.client_name,
        clientAddress: first.client_address || '',
        clientGstin: taxId,
        // Only set when the sheet says so — never default to the client name.
        clientLegalName: String(first.legal_name || '').trim(),
        gstApplicable: taxId ? 'yes' : 'no',
        hsn: isDubai ? '' : (first.hsn_sac || '997331'),
        items,
        // Top-level mirror for back-compat (uses the first item)
        description: items[0].description,
        subType: items[0].subType,
        fullDescription: items[0].fullDescription,
        paymentDate: items[0].paymentDate,
        noOfLicense: items[0].noOfLicense,
        validity: items[0].validity,
        gstType: isDubai ? 'igst' : (String(first.gst_type || '').toLowerCase().includes('igst') ? 'igst' : 'cgst_sgst'),
        gstRate: isDubai ? 5 : 18,
        netAmount: netSum,
        cgst: cgstSum,
        sgst: sgstSum,
        igst: igstSum,
        totalAmount: totalSum,
        paymentMode: first.payment_mode || (isDubai ? 'BANK TRANSFER' : 'NEFT'),
        status,
        amountDueOutstanding: outstandingAmt,
        dueDate: dueD,
        tdsRate: 0,
        tdsAmount: 0,
        tdsStatus: isDubai ? 'not_applicable' : 'pending',
        createdAt: new Date().toISOString(),
        createdBy: (currentUser && (currentUser.name || currentUser.email)) || '',
        createdByEmail: (currentUser && currentUser.email) || ''
      });
      added++;
    }

    await saveInvoices(nextInvoices);
    await saveClients(nextClients);
    setPendingImport(null);
    const mergeMsg = mergedItems > 0 ? ' · ' + mergedItems + ' extra rows merged as line-items' : '';
    showToast('Imported ' + added + ' invoice' + (added === 1 ? '' : 's') + mergeMsg +
      (skipped ? ' (' + skipped + ' rows skipped for missing invoice_no/client)' : ''));
    navigate('invoices');
  }

  /* ---------------- ASSIGNMENT ---------------- */
  const openAssign = (id) => {
    const d = stateRef.current.invoices.find((x) => x.id === id);
    if (d && !can(modOf(d.docType), 'assign')) return deny('assign documents');
    setAssignModal({ open: true, id });
  };

  /**
   * Hand a document to a colleague. The assignee sees it even on the narrow data
   * scope, so this is how work reaches someone who did not raise it.
   */
  async function assignDocument(id, patch) {
    const latest = await reloadInvoices();
    const target = latest.find((x) => x.id === id);
    if (target && !can(modOf(target.docType), 'assign')) { setAssignModal({ open: false, id: null }); return deny('assign documents'); }
    if (!target) {
      setAssignModal({ open: false, id: null });
      return showToast('That document no longer exists', 'error');
    }
    const me = currentUser || {};
    const stamped = {
      ...target,
      ...patch,
      assignedAt: patch.assignedTo ? new Date().toISOString() : '',
      assignedBy: patch.assignedTo ? (me.name || me.email || '') : '',
      updatedAt: new Date().toISOString()
    };
    await saveInvoices(latest.map((x) => (x.id === id ? stamped : x)));
    setAssignModal({ open: false, id: null });
    showToast(patch.assignedTo
      ? (target.invoiceNo || 'Document') + ' assigned to ' + (patch.assignedToName || patch.assignedTo)
      : (target.invoiceNo || 'Document') + ' unassigned');
  }

  /* ---------------- USERS ---------------- */
  async function saveUserEdit(updated) {
    await saveUsers(stateRef.current.users.map((u) => (u.email === updated.email ? updated : u)));
    setUserModal({ open: false, email: null });
    // The edited user may be the one signed in — re-resolve their session so a
    // permission or scope change takes effect without a sign-out.
    if (sameEmail(updated.email, currentUser && currentUser.email)) refreshSessionUser();
    showToast('User updated successfully');
  }

  /**
   * Admin-created accounts. The Firebase login is made by CreateUserModal
   * against a secondary app; all that is left here is storing the profile.
   */
  async function createUserProfile(profile, initialPassword) {
    const latest = await reloadUsers();
    if (latest.some((u) => sameEmail(u.email, profile.email))) {
      return showToast('A profile for ' + profile.email + ' already exists', 'error');
    }
    await saveUsers([...latest, profile]);
    setCreateUserOpen(false);
    showToast(profile.name + ' created · username ' + profile.email + ' · password ' + initialPassword);
    // The password is shown once and never stored, so make it hard to miss.
    alert(
      'Account created.\n\n' +
      'Username: ' + profile.email + '\n' +
      'Password: ' + initialPassword + '\n\n' +
      (profile.mustChangePassword ? 'They will be asked to choose a new password at first sign-in.\n\n' : '') +
      'This password is not stored anywhere — copy it now and share it with them directly.'
    );
  }

  /** Clear the flag once the user has chosen their own password. */
  async function completeForcedPasswordChange() {
    const latest = await reloadUsers();
    await saveUsers(latest.map((u) => (sameEmail(u.email, currentUser && currentUser.email)
      ? { ...u, mustChangePassword: false, passwordChangedAt: new Date().toISOString() }
      : u)));
    refreshSessionUser();
  }

  async function deleteUser(email) {
    if (!confirm('Delete this user account? This cannot be undone.')) return;
    await saveUsers(stateRef.current.users.filter((u) => u.email !== email));
    showToast('User deleted · their Firebase sign-in must be removed from the Firebase console separately');
  }

  /* ---------------- TDS ---------------- */
  async function saveTdsChanges(pending) {
    const ids = Object.keys(pending);
    if (ids.length === 0) return showToast('No changes to save', 'warn');
    const next = stateRef.current.invoices.map((inv) => {
      const ch = pending[inv.id];
      if (!ch) return inv;
      return { ...inv, ...ch, updatedAt: new Date().toISOString() };
    });
    await saveInvoices(next);
    setTdsOpen(false);
    showToast('Updated TDS records for ' + ids.length + ' invoice' + (ids.length > 1 ? 's' : ''));
  }

  /* ---------------- RENDER ---------------- */
  const navVisible = (item) => {
    if (item.perm === 'admin_only') return isAdmin;
    if (isAdmin) return true;
    if (item.perm === 'dashboard') return true;
    const mod = perms[item.perm];
    return !!(mod && mod.view);
  };

  const selectedUser = userModal.email ? users.find((u) => u.email === userModal.email) : null;
  const detailsUser = userDetails.email ? users.find((u) => u.email === userDetails.email) : null;
  const assignTarget = assignModal.id ? stateRef.current.invoices.find((x) => x.id === assignModal.id) : null;
  // An admin-set temporary password gates the app until the user picks their own.
  // Google accounts have no password to change, so they are never held here.
  const mustChangePassword = !!currentUser && currentUser.role !== 'admin' &&
    !!currentUser.mustChangePassword && currentUser.authProvider !== 'google';

  // Editing a document from its list row expands the form under that row; every
  // other entry point (new document, TDS manager) still uses the dialog.
  const editingDoc = invoiceModal.open ? invoiceModal.editing : null;
  const listHostsEditor = !!editingDoc && (
    (page === 'invoices' && editingDoc.docType === 'invoice') ||
    (page === 'proforma' && editingDoc.docType === 'proforma')
  );
  const closeEditor = () => setInvoiceModal(CLOSED_INVOICE_MODAL);
  const inlineEditor = listHostsEditor ? (
    <InvoiceModal
      key={editingDoc.id}
      open
      inline
      initialDocType={invoiceModal.docType}
      editingDoc={editingDoc}
      onClose={closeEditor}
      onSave={saveInvoiceDoc}
      onPreview={previewDraft}
    />
  ) : null;

  // Converting a proforma always uses the dialog — the new tax invoice belongs
  // to the invoices list, not to the proforma row it was started from.

  return (
    <div className="app show">
      <div className="topbar">
        <div className="topbar-left">
          <div className="topbar-logo"><img src={LOGO_DATA_URI} alt="Leadrat" /></div>
          <div className="topbar-nav">
            {NAV.filter(navVisible).map((item) => (
              <button
                key={item.page}
                className={'nav-btn' + (page === item.page ? ' active' : '')}
                onClick={() => navigate(item.page)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="topbar-right">
          <span className="user-badge">
            {currentUser.role === 'admin' ? 'Admin: ' + currentUser.name : currentUser.name}
          </span>
          <button className="btn btn-secondary btn-sm" onClick={doSignOut}>Sign Out</button>
        </div>
      </div>

      <div className="main">
        {page === 'dashboard' && (
          <Dashboard
            onOpenTds={() => setTdsOpen(true)}
            onViewUser={(email) => setUserDetails({ open: true, email })}
            onNavigate={navigate}
            onDownloadBackup={onDownloadBackup}
            onLoadBackup={onLoadBackup}
          />
        )}
        {(page === 'invoices' || page === 'proforma') && (
          <InvoiceListPage
            key={page}
            docType={page === 'invoices' ? 'invoice' : 'proforma'}
            initialStatus={page === 'invoices' ? invoiceStatusFilter : ''}
            initialRegion={docRegionFilter}
            initialClientId={docClientFilter}
            onNew={openInvoiceForm}
            onPreview={previewDocument}
            onEdit={editInvoice}
            onDelete={deleteInvoice}
            onDownload={downloadInvoice}
            onDownloadPdf={downloadInvoicePdf}
            onExport={exportToExcel}
            onConvert={startProformaConversion}
            onAssign={openAssign}
            can={can}
            editingId={listHostsEditor ? editingDoc.id : null}
            editor={inlineEditor}
          />
        )}
        {page === 'clients' && (
          <ClientsPage
            initialRegion={clientRegionFilter}
            onAdd={openClientForm}
            onEdit={editClient}
            onDelete={deleteClient}
            can={can}
            onDownloadTemplate={onDownloadClientTemplate}
            onBulkFile={handleClientBulkFile}
            onOpenDocuments={(target, clientId) => navigate(target, '', '', clientId)}
          />
        )}
        {page === 'import' && (
          <BulkImportPage
            pendingImport={pendingImport}
            onFile={handleExcelUpload}
            onConfirm={confirmImport}
            onCancel={() => setPendingImport(null)}
            onDownloadIndiaTemplate={() => {
              downloadInvoiceTemplate();
              showToast('India template downloaded. Rows sharing invoice_no merge as multi-item. Fill amount_due for status=due.');
            }}
            onDownloadDubaiTemplate={() => {
              downloadDubaiTemplate();
              showToast('Dubai template downloaded. AED currency, TRN, VAT @ 5%. Fill amount_due for status=due.');
            }}
          />
        )}
        {page === 'users' && (
          <UsersPage
            onView={(email) => setUserDetails({ open: true, email })}
            onEdit={(email) => setUserModal({ open: true, email })}
            onDelete={deleteUser}
            onCreate={() => setCreateUserOpen(true)}
          />
        )}
        {page === 'settings' && <SettingsPage />}
      </div>

      <InvoiceModal
        open={invoiceModal.open && !listHostsEditor}
        initialDocType={invoiceModal.docType}
        editingDoc={invoiceModal.editing}
        prefillDoc={invoiceModal.prefill}
        convertFrom={invoiceModal.convertFrom}
        onClose={closeEditor}
        onSave={saveInvoiceDoc}
        onPreview={previewDraft}
      />

      <ClientModal
        open={clientModal.open}
        editingClient={clientModal.editing}
        onClose={() => setClientModal({ open: false, editing: null })}
        onSave={saveClientRecord}
      />

      <ClientBulkModal
        open={clientBulk.open}
        rows={clientBulk.rows}
        onClose={() => setClientBulk({ open: false, rows: [] })}
        onConfirm={confirmClientBulkImport}
      />

      <UserModal
        open={userModal.open && !!selectedUser}
        user={selectedUser}
        onClose={() => setUserModal({ open: false, email: null })}
        onSave={saveUserEdit}
      />

      <CreateUserModal
        open={createUserOpen}
        onClose={() => setCreateUserOpen(false)}
        onCreated={createUserProfile}
      />

      <AssignModal
        open={assignModal.open && !!assignTarget}
        doc={assignTarget}
        onClose={() => setAssignModal({ open: false, id: null })}
        onAssign={assignDocument}
      />

      <ForcePasswordModal
        open={mustChangePassword}
        onDone={completeForcedPasswordChange}
        onSignOut={doSignOut}
      />

      <UserDetailsModal
        open={userDetails.open && !!detailsUser}
        user={detailsUser}
        onClose={() => setUserDetails({ open: false, email: null })}
        onEdit={(email) => { setUserDetails({ open: false, email: null }); setUserModal({ open: true, email }); }}
      />

      <TdsModal
        open={tdsOpen}
        onClose={() => setTdsOpen(false)}
        onSave={saveTdsChanges}
        onEditInvoice={editInvoice}
      />

      <DocumentPreviewModal
        open={preview.open}
        doc={preview.doc}
        onClose={closePreview}
        onEdit={() => {
          const id = preview.sourceId;
          closePreview();
          // From a list row: reopen that document's editor. From the form: the
          // form is still open underneath, so closing the preview is enough.
          if (id) editInvoice(id);
        }}
        onDownloadWord={() => downloadPreviewed('word')}
        onDownloadPdf={() => downloadPreviewed('pdf')}
      />
    </div>
  );
}
