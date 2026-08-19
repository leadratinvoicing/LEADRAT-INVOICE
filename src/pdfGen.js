import { jsPDF } from 'jspdf';
import { DUBAI_LOGO_DATA_URI, LOGO_DATA_URI } from './logo';
import { aedToWords, fmtDate, numberToWords } from './utils';
import { buildFilename, fmtMoneyAed, fmtMoneyDocx, titleCase } from './docxShared';

/* ============================================================
   PDF GENERATION
   --------------------------------------------------------------
   Produces the same layout as the Word document — title, header,
   bill-to, items, banking and footer blocks — so a client receives
   the identical invoice whichever format is downloaded.

   jsPDF has no table model, so this module carries a small bordered
   "cell" renderer: a cell holds paragraphs, a paragraph holds runs
   (text + bold), and runs wrap on word boundaries inside the cell.
   ============================================================ */

const FONT = 'helvetica';
// A4 in points, 0.5" margins — matches the DXA page setup of the .docx.
const PAGE = { w: 595.28, h: 841.89, margin: 36 };
const CONTENT_W = PAGE.w - PAGE.margin * 2;
const PAD_X = 4;
const PAD_Y = 4;
const LINE_H = 1.22;

// docx sizes are half-points: 18→9pt body, 16→8pt, 14→7pt, 28→14pt title.
const SZ = { title: 14, body: 9, proformaItem: 8, invoiceItem: 7 };

function imageFormat(uri) {
  return /^data:image\/jpe?g/i.test(String(uri || '')) ? 'JPEG' : 'PNG';
}

function createRenderer(doc) {
  let y = PAGE.margin;

  const setFont = (bold, size) => {
    doc.setFont(FONT, bold ? 'bold' : 'normal');
    doc.setFontSize(size);
  };
  const textW = (t, bold, size) => {
    setFont(bold, size);
    return doc.getTextWidth(t);
  };

  /** Break a paragraph's runs into lines that fit `maxW`. */
  function layout(runs, size, maxW) {
    const tokens = [];
    for (const r of runs || []) {
      for (const part of String(r.text == null ? '' : r.text).split(/(\s+)/)) {
        if (part === '') continue;
        tokens.push({ text: part, bold: !!r.bold, space: /^\s+$/.test(part) });
      }
    }

    const lines = [];
    let cur = [];
    let curW = 0;
    const flush = () => { if (cur.length) { lines.push({ runs: cur, w: curW }); cur = []; curW = 0; } };

    for (const t of tokens) {
      const w = textW(t.text, t.bold, size);
      if (t.space && !cur.length) continue; // never start a line with a space
      // A single token wider than the cell (long GSTIN, unbroken address) is
      // split by character rather than allowed to bleed past the border.
      if (!t.space && w > maxW) {
        flush();
        let chunk = '';
        for (const ch of t.text) {
          if (chunk && textW(chunk + ch, t.bold, size) > maxW) {
            lines.push({ runs: [{ text: chunk, bold: t.bold, w: textW(chunk, t.bold, size) }], w: maxW });
            chunk = ch;
          } else {
            chunk += ch;
          }
        }
        if (chunk) { cur = [{ text: chunk, bold: t.bold, w: textW(chunk, t.bold, size) }]; curW = cur[0].w; }
        continue;
      }
      if (!t.space && cur.length && curW + w > maxW) flush();
      cur.push({ text: t.text, bold: t.bold, w });
      curW += w;
    }
    flush();
    if (!lines.length) lines.push({ runs: [], w: 0 });
    return lines;
  }

  function cellHeight(cell, w) {
    const inner = w - PAD_X * 2;
    let h = PAD_Y * 2;
    if (cell.image) h += cell.image.h;
    for (const p of cell.paras || []) h += layout(p.runs, p.size || SZ.body, inner).length * (p.size || SZ.body) * LINE_H;
    return Math.max(h, cell.minH || 0);
  }

  function drawCell(cell, x, top, w, h) {
    doc.setLineWidth(0.5);
    doc.setDrawColor(0, 0, 0);
    if (!cell.noBorder) doc.rect(x, top, w, h);

    const inner = w - PAD_X * 2;
    const blocks = [];
    let contentH = 0;
    if (cell.image) { blocks.push({ image: cell.image }); contentH += cell.image.h; }
    for (const p of cell.paras || []) {
      const size = p.size || SZ.body;
      const ls = layout(p.runs, size, inner);
      blocks.push({ para: p, size, lines: ls });
      contentH += ls.length * size * LINE_H;
    }

    let cy = cell.valign === 'middle' ? top + (h - contentH) / 2 : top + PAD_Y;

    for (const b of blocks) {
      if (b.image) {
        doc.addImage(b.image.uri, imageFormat(b.image.uri), x + (w - b.image.w) / 2, cy, b.image.w, b.image.h);
        cy += b.image.h;
        continue;
      }
      for (const line of b.lines) {
        const align = b.para.align || 'left';
        let lx = x + PAD_X;
        if (align === 'center') lx = x + (w - line.w) / 2;
        else if (align === 'right') lx = x + w - PAD_X - line.w;
        const baseline = cy + b.size * 0.92;
        let rx = lx;
        for (const r of line.runs) {
          setFont(r.bold, b.size);
          doc.text(r.text, rx, baseline);
          rx += r.w;
        }
        cy += b.size * LINE_H;
      }
    }
  }

  function ensureSpace(h) {
    if (y + h > PAGE.h - PAGE.margin) {
      doc.addPage();
      y = PAGE.margin;
    }
  }

  return {
    get y() { return y; },
    gap(h) { y += (h === undefined ? 4 : h); },

    title(text) {
      ensureSpace(SZ.title * 1.6);
      setFont(true, SZ.title);
      doc.text(text, PAGE.w / 2, y + SZ.title, { align: 'center' });
      y += SZ.title * 1.7;
    },

    row(cells, widths) {
      const h = Math.max(...cells.map((c, i) => cellHeight(c, widths[i])));
      ensureSpace(h);
      let x = PAGE.margin;
      cells.forEach((c, i) => { drawCell(c, x, y, widths[i], h); x += widths[i]; });
      y += h;
    },

    /**
     * One tall left cell beside a stack of right-hand rows — the shape the Word
     * header and bill-to tables get from a rowSpan. A right row with a single
     * cell spans both right columns.
     */
    splitRow(leftCell, rightRows, widths) {
      const [lw, aw, bw] = widths;
      const heights = rightRows.map((r) => (r.length === 1
        ? cellHeight(r[0], aw + bw)
        : Math.max(cellHeight(r[0], aw), cellHeight(r[1], bw))));
      const rightTotal = heights.reduce((s, v) => s + v, 0);
      const total = Math.max(cellHeight(leftCell, lw), rightTotal);
      const extra = (total - rightTotal) / (heights.length || 1);

      ensureSpace(total);
      drawCell(leftCell, PAGE.margin, y, lw, total);
      let ry = y;
      rightRows.forEach((r, i) => {
        const h = heights[i] + extra;
        if (r.length === 1) {
          drawCell(r[0], PAGE.margin + lw, ry, aw + bw, h);
        } else {
          drawCell(r[0], PAGE.margin + lw, ry, aw, h);
          drawCell(r[1], PAGE.margin + lw + aw, ry, bw, h);
        }
        ry += h;
      });
      y += total;
    }
  };
}

/* ---------- cell/paragraph shorthands ---------- */
const cellOf = (paras, opts) => ({ paras, ...(opts || {}) });
const para = (runs, opts) => ({ runs, ...(opts || {}) });

/** Render the document — shared by the download and the on-screen preview. */
function buildPdfDocument(d, company) {
  if (!d) throw new Error('Document not found');
  const isDubai = d.branch === 'dubai';
  const co = company[d.branch] || company.pune;
  const bank = isDubai ? (company.dubaiBank || company.bank) : company.bank;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  if (isDubai) buildDubaiPdf(doc, d, co, bank);
  else buildIndiaPdf(doc, d, co, bank);
  return doc;
}

export async function generatePdf(d, company) {
  const doc = buildPdfDocument(d, company);
  const fname = buildFilename(d, 'pdf');
  doc.save(fname);
  return fname;
}

/**
 * The exact same PDF as the download, handed back as an object URL so it can be
 * shown in an iframe before anyone commits to downloading it. The caller owns
 * the URL and must revoke it.
 */
export async function generatePdfPreview(d, company) {
  const doc = buildPdfDocument(d, company);
  return {
    url: URL.createObjectURL(doc.output('blob')),
    filename: buildFilename(d, 'pdf')
  };
}

/* ============================================================
   INDIA — Rs., GSTIN/CIN, CGST/SGST/IGST
   ============================================================ */
function buildIndiaPdf(doc, d, co, bank) {
  const r = createRenderer(doc);
  const isProforma = d.docType === 'proforma';
  const money = fmtMoneyDocx;
  const MONEY_RE = /^Rs\.\s/;

  // Same casing rules as the Word build: raw keeps codes/amounts untouched.
  const T = (text, opts) => {
    opts = opts || {};
    let t = String(text == null ? '' : text);
    if (opts.upper) t = t.toUpperCase();
    else if (!opts.raw) t = titleCase(t, MONEY_RE);
    return { text: t, bold: !!opts.bold };
  };
  const line = (text, opts) => para([T(text, opts)], { size: (opts && opts.size) || SZ.body, align: opts && opts.align });

  const LEFT_W = Math.round(CONTENT_W * 0.55);
  const RIGHT_W = CONTENT_W - LEFT_W;
  const LABEL_W = Math.round(RIGHT_W * 0.4);
  const VAL_W = RIGHT_W - LABEL_W;
  const COLS = [LEFT_W, LABEL_W, VAL_W];

  r.title(isProforma ? 'PROFORMA INVOICE' : 'TAX INVOICE');

  /* ---------- header ---------- */
  const billFrom = cellOf([
    line('BILL FROM:', { bold: true, upper: true }),
    line(co.name, { bold: true }),
    ...String(co.address || '').split('\n').map((l) => line(l)),
    para([T('GST IN: ', { bold: true, upper: true }), T(co.gstin, { bold: true, raw: true })], { size: SZ.body }),
    para([T('CIN: ', { bold: true, upper: true }), T(co.cin, { bold: true, raw: true })], { size: SZ.body })
  ]);
  const logoCell = cellOf([], { image: { uri: LOGO_DATA_URI, w: 98, h: 28 }, valign: 'middle' });

  r.splitRow(billFrom, [
    [logoCell],
    [cellOf([line('Invoice No:', { bold: true })]), cellOf([line(d.invoiceNo || '', { raw: true })])],
    [cellOf([line('Invoice Date:', { bold: true })]), cellOf([line(fmtDate(d.invoiceDate), { raw: true })])]
  ], COLS);
  r.gap();

  /* ---------- bill to ---------- */
  const gstApplicable = d.gstApplicable !== 'no';
  let gstinPara;
  if (gstApplicable) {
    const runs = [T('GST IN: ', { bold: true, upper: true }), T(d.clientGstin || '', { bold: true, raw: true })];
    const legal = String(d.clientLegalName || '').trim();
    if (legal && legal.toLowerCase() !== String(d.clientName || '').trim().toLowerCase()) {
      runs.push(T(' (' + legal + ')', { bold: true, upper: true }));
    }
    gstinPara = para(runs, { size: SZ.body });
  } else {
    gstinPara = para([T('GST IN: ', { bold: true, upper: true }), T('NOT APPLICABLE', { bold: true, upper: true })], { size: SZ.body });
  }

  const billTo = cellOf([
    line('BILL TO:', { bold: true, upper: true }),
    line(d.clientName || '', { bold: true, upper: true }),
    ...String(d.clientAddress || '').split('\n').filter((x) => x.trim()).map((l) => line(l, { bold: true, upper: true })),
    gstinPara
  ]);

  let amountDueValue, dueDateValue;
  if (isProforma) {
    amountDueValue = money(d.totalAmount);
    dueDateValue = fmtDate(d.dueDate || d.invoiceDate);
  } else if (d.status === 'due') {
    const outstanding = (d.amountDueOutstanding !== undefined && d.amountDueOutstanding !== null && d.amountDueOutstanding !== '')
      ? d.amountDueOutstanding : d.totalAmount;
    amountDueValue = money(outstanding);
    dueDateValue = fmtDate(d.dueDate || d.invoiceDate);
  } else {
    amountDueValue = 'Payments Cleared';
    dueDateValue = 'Payments Cleared';
  }

  r.splitRow(billTo, [
    [cellOf([line('HSN / SAC:', { bold: true, raw: true })]), cellOf([line(d.hsn || '997331', { raw: true })])],
    [cellOf([line('Amount Due:', { bold: true })]), cellOf([line(amountDueValue, { raw: true })])],
    [cellOf([line('Due Date:', { bold: true })]), cellOf([line(dueDateValue, { raw: true })])]
  ], COLS);
  r.gap();

  /* ---------- items ---------- */
  const perItem = allocateItems(d);
  const centered = (text, opts) => cellOf(
    [para([T(text, opts)], { size: (opts && opts.size) || SZ.body, align: 'center' })],
    { valign: 'middle' }
  );

  if (isProforma) {
    const cols = fractions([0.16, 0.13, 0.10, 0.12, 0.14, 0.13]);
    const size = SZ.proformaItem;
    r.row(
      ['Description', 'Payment Due Date', 'No of License', 'Billing Type', 'Net Amount', 'GST/ IGST', 'Total Due']
        .map((h) => centered(h, { bold: true, upper: true, size })),
      cols
    );
    for (const it of perItem) {
      const gst = (it.cgst || 0) + (it.sgst || 0) + (it.igst || 0);
      r.row([
        centered(it.fullDescription || (it.description + (it.subType ? ' ' + it.subType : '')), { size }),
        centered(fmtDate(d.dueDate || d.invoiceDate), { size, raw: true }),
        centered(it.noOfLicense || '', { size }),
        centered(it.validity || '', { size }),
        centered(money(it.netAmount), { size, raw: true }),
        centered(money(gst), { size, raw: true }),
        centered(money(it.lineTotal), { size, raw: true })
      ], cols);
    }
    if (perItem.length > 1) {
      const gstSum = (+d.cgst || 0) + (+d.sgst || 0) + (+d.igst || 0);
      const labelW = cols[0] + cols[1] + cols[2] + cols[3];
      r.row([
        cellOf([para([T('Total Due:', { bold: true })], { size, align: 'right' })], { valign: 'middle' }),
        centered(money(d.netAmount), { bold: true, size, raw: true }),
        centered(money(gstSum), { bold: true, size, raw: true }),
        centered(money(d.totalAmount), { bold: true, size, raw: true })
      ], [labelW, cols[4], cols[5], cols[6]]);
    }
  } else {
    const cols = fractions([0.13, 0.09, 0.07, 0.07, 0.13, 0.11, 0.11, 0.11]);
    const size = SZ.invoiceItem;
    r.row(
      ['Description', 'Payment Date', 'No of License', 'Validity', 'Net Amount', 'CGST', 'SGST', 'IGST', 'TOTAL AMOUNT']
        .map((h) => centered(h, { bold: true, upper: true, size })),
      cols
    );
    for (const it of perItem) {
      r.row([
        centered(it.fullDescription || (it.description + (it.subType ? ' ' + it.subType : '')), { size }),
        centered(it.paymentDate ? fmtDate(it.paymentDate) : '', { size, raw: true }),
        centered(it.noOfLicense || '', { size }),
        centered(it.validity || '', { size }),
        centered(money(it.netAmount), { size, raw: true }),
        centered(money(it.cgst), { size, raw: true }),
        centered(money(it.sgst), { size, raw: true }),
        centered(money(it.igst), { size, raw: true }),
        centered(money(it.lineTotal), { size, raw: true })
      ], cols);
    }
    if (perItem.length > 1) {
      const labelW = cols[0] + cols[1] + cols[2] + cols[3];
      r.row([
        cellOf([para([T((d.status === 'paid' ? 'Total Paid' : 'Total Due') + ':', { bold: true })], { size, align: 'right' })], { valign: 'middle' }),
        centered(money(d.netAmount), { bold: true, size, raw: true }),
        centered(money(d.cgst), { bold: true, size, raw: true }),
        centered(money(d.sgst), { bold: true, size, raw: true }),
        centered(money(d.igst), { bold: true, size, raw: true }),
        centered(money(d.totalAmount), { bold: true, size, raw: true })
      ], [labelW, cols[4], cols[5], cols[6], cols[7], cols[8]]);
    }
  }
  r.gap();

  /* ---------- banking + amount due ---------- */
  const bankCell = cellOf([
    line('Banking Information:', { bold: true }),
    para([T('Bank Name: ', { bold: true }), T(bank.name, { raw: true })], { size: SZ.body }),
    para([T('A/C Name: ', { bold: true }), T(bank.accName, { raw: true })], { size: SZ.body }),
    para([T('Account No: ', { bold: true }), T(bank.accNo, { raw: true })], { size: SZ.body }),
    para([T('IFSC No: ', { bold: true, raw: true }), T(bank.ifsc, { raw: true })], { size: SZ.body }),
    para([T('Account Type: ', { bold: true }), T(bank.type)], { size: SZ.body })
  ]);

  let dueLabelText, dueValueText;
  if (isProforma) {
    dueLabelText = 'Total Amount Due';
    dueValueText = money(d.totalAmount);
  } else {
    dueLabelText = 'Amount Due After Payment';
    if (d.status === 'due') {
      const outstanding = (d.amountDueOutstanding !== undefined && d.amountDueOutstanding !== null && d.amountDueOutstanding !== '')
        ? d.amountDueOutstanding : d.totalAmount;
      dueValueText = money(outstanding);
    } else {
      dueValueText = money(0);
    }
  }
  const bankMid = Math.round(RIGHT_W * 0.55);
  r.row([
    bankCell,
    centered(dueLabelText, { bold: true }),
    centered(dueValueText, { bold: true, raw: true })
  ], [LEFT_W, bankMid, RIGHT_W - bankMid]);
  r.gap();

  /* ---------- footer ---------- */
  const footerRows = [];
  if (!isProforma) {
    footerRows.push([T('Payment Mode: ', { bold: true }), T(d.paymentMode || '', { raw: true })]);
  }
  footerRows.push([
    T(isProforma ? 'Amount Due in Words: ' : 'Amount Paid in Words: ', { bold: true }),
    T(numberToWords(d.totalAmount))
  ]);
  footerRows.push([T('Note: ', { bold: true }), T('Electronically Generated Invoice No Signature Necessary.')]);
  footerRows.push([
    T('Terms & Conditions: ', { bold: true }),
    T('Clear payment within 15 days of receiving this invoice. There will be a 1.5% interest charge per month on late invoices. (Ignore If invoice is already cleared)')
  ]);
  if (isProforma) {
    footerRows.push([T('Payment Gateway: ', { bold: true }), T('Payments via payment gateways attract 2.5% transaction charges.')]);
  }
  for (const runs of footerRows) r.row([cellOf([para(runs, { size: SZ.body })])], [CONTENT_W]);
}

/* ============================================================
   DUBAI — AED, TRN/LICENSE NO, flat VAT @ 5%
   ============================================================ */
function buildDubaiPdf(doc, d, co, bank) {
  const r = createRenderer(doc);
  const isProforma = d.docType === 'proforma';
  const money = fmtMoneyAed;
  const MONEY_RE = /^AED\s/;

  const T = (text, opts) => {
    opts = opts || {};
    let t = String(text == null ? '' : text);
    if (opts.upper) t = t.toUpperCase();
    else if (!opts.raw) t = titleCase(t, MONEY_RE);
    return { text: t, bold: !!opts.bold };
  };
  const line = (text, opts) => para([T(text, opts)], { size: (opts && opts.size) || SZ.body, align: opts && opts.align });
  const centered = (text, opts) => cellOf(
    [para([T(text, opts)], { size: (opts && opts.size) || SZ.body, align: 'center' })],
    { valign: 'middle' }
  );

  const LEFT_W = Math.round(CONTENT_W * 0.55);
  const MID_W = Math.round(CONTENT_W * 0.18);
  const RIGHT_W = CONTENT_W - LEFT_W - MID_W;
  const COLS = [LEFT_W, MID_W, RIGHT_W];

  r.title(isProforma ? 'PROFORMA INVOICE' : 'TAX INVOICE');

  const billFrom = cellOf([
    line('BILL FROM:', { bold: true, upper: true }),
    line(co.name || 'DHINWA SOLUTIONS TRADING L.L.C', { bold: true, upper: true }),
    ...String(co.address || '').split('\n').filter((x) => x.trim()).map((l) => line(l, { bold: true, upper: true })),
    para([T('LICENSE NO. ', { bold: true, upper: true }), T(co.licenseNo || '1451890', { bold: true, raw: true })], { size: SZ.body }),
    para([T('TRN No: ', { bold: true, raw: true }), T(co.trn || '104804338200003', { bold: true, raw: true })], { size: SZ.body })
  ]);
  const logoCell = cellOf([], { image: { uri: DUBAI_LOGO_DATA_URI, w: 150, h: 45 }, valign: 'middle' });

  r.splitRow(billFrom, [
    [logoCell],
    [cellOf([line('Invoice No:', { bold: true })]), cellOf([line(d.invoiceNo || '', { raw: true })])],
    [cellOf([line('Invoice Date:', { bold: true })]), cellOf([line(fmtDate(d.invoiceDate), { raw: true })])]
  ], COLS);

  const trnAvailable = d.gstApplicable !== 'no';
  const billTo = cellOf([
    line('BILL TO:', { bold: true, upper: true }),
    line(d.clientName || '', { bold: true, upper: true }),
    ...String(d.clientAddress || '').split('\n').filter((x) => x.trim()).map((l) => line(l, { bold: true, upper: true })),
    para([T('TRN NO: ', { bold: true, upper: true }), T(trnAvailable ? (d.clientGstin || 'NOT AVAILABLE') : 'NOT AVAILABLE', { bold: true, upper: true, raw: true })], { size: SZ.body })
  ]);
  r.row([
    billTo,
    cellOf([line(isProforma ? 'Payment Due Date:' : 'Payment Date:', { bold: true })], { valign: 'middle' }),
    cellOf([line(fmtDate(d.dueDate || d.invoiceDate || (d.items && d.items[0] && d.items[0].paymentDate)), { raw: true })], { valign: 'middle' })
  ], COLS);
  r.gap();

  /* ---------- items ---------- */
  const itemRows = (Array.isArray(d.items) && d.items.length > 0) ? d.items : [{
    description: d.description || 'Leadrat CRM Software',
    subType: d.subType || '',
    fullDescription: d.fullDescription || ((d.description || 'Leadrat CRM Software') + (d.subType ? ' ' + d.subType : '')),
    noOfLicense: d.noOfLicense,
    validity: d.validity,
    netAmount: +d.netAmount || 0
  }];

  const itemCols = fractions([0.44, 0.16, 0.16]);
  const size = SZ.proformaItem;
  r.row(
    ['DESCRIPTION', 'NO OF LICENSE', 'VALIDITY', 'NET AMOUNT'].map((h) => centered(h, { bold: true, upper: true, size })),
    itemCols
  );
  for (const it of itemRows) {
    r.row([
      centered(it.fullDescription || (it.description + (it.subType ? ' ' + it.subType : '')), { size }),
      centered(it.noOfLicense || '', { size }),
      centered(it.validity || '', { size }),
      centered(money(it.netAmount), { size, raw: true })
    ], itemCols);
  }
  r.gap();

  /* ---------- banking + VAT + totals ---------- */
  const netTotal = +d.netAmount || 0;
  const vatAmt = (+d.igst) || ((+d.cgst || 0) + (+d.sgst || 0)) || (netTotal * 0.05);
  const grandTotal = (+d.totalAmount) || (netTotal + vatAmt);

  const bankCell = cellOf([
    line('Banking Information:', { bold: true }),
    para([T('IBAN: ', { bold: true, upper: true }), T(bank.iban || bank.accNo || '', { raw: true })], { size: SZ.body }),
    para([T('A/C No: ', { bold: true }), T(bank.accNo || '', { raw: true })], { size: SZ.body }),
    para([T('Currency: ', { bold: true }), T(bank.currency || 'AED', { raw: true })], { size: SZ.body }),
    para([T('Bank name: ', { bold: true }), T(bank.name || 'RAK BANK', { raw: true })], { size: SZ.body }),
    para([T('Account Name: ', { bold: true }), T(bank.accName || 'DHINWA SOLUTIONS TRADING LLC', { raw: true })], { size: SZ.body })
  ]);

  r.splitRow(bankCell, [
    [centered('VAT @ 5%', { bold: true, upper: true }), centered(money(vatAmt), { bold: true, raw: true })],
    [centered('Total Amount', { bold: true }), centered(money(grandTotal), { bold: true, raw: true })]
  ], COLS);

  const footerRows = [
    [T('Payment Mode: ', { bold: true }), T(d.paymentMode || 'Bank Transfer', { raw: true })],
    [T(isProforma ? 'Amount Due in Words: ' : 'Amount Paid in Words: ', { bold: true }), T(aedToWords(grandTotal), { raw: true })],
    [T('Note: ', { bold: true }), T('Electronically Generated Invoice No Signature Necessary.')],
    [T('Terms & Conditions: ', { bold: true }), T('Clear payment within 15 days of receiving this invoice. There will be a 1.5% interest charge per month on late invoices. (Ignore If invoice is already cleared)')]
  ];
  for (const runs of footerRows) r.row([cellOf([para(runs, { size: SZ.body })])], [CONTENT_W]);
}

/* ---------- shared helpers ---------- */

/** Column widths from fractions of the content width; the last column absorbs the rounding. */
function fractions(list) {
  const cols = list.map((f) => Math.round(CONTENT_W * f));
  cols.push(CONTENT_W - cols.reduce((s, x) => s + x, 0));
  return cols;
}

/**
 * Spread the document's tax and total across its line items exactly as the Word
 * generator does, so both formats show identical per-line figures.
 */
function allocateItems(d) {
  const itemRows = (Array.isArray(d.items) && d.items.length > 0) ? d.items : [{
    description: d.description || 'CRM Application',
    subType: d.subType || '',
    fullDescription: d.fullDescription || ((d.description || 'CRM Application') + (d.subType ? ' ' + d.subType : '')),
    paymentDate: d.paymentDate,
    noOfLicense: d.noOfLicense,
    validity: d.validity,
    netAmount: +d.netAmount || 0
  }];

  const totalNet = itemRows.reduce((s, it) => s + (+it.netAmount || 0), 0);
  const totCgst = +d.cgst || 0, totSgst = +d.sgst || 0, totIgst = +d.igst || 0;
  const docTotal = +d.totalAmount || 0;

  const allocate = (total, idx, isLast, accumulated) => {
    if (totalNet <= 0) return 0;
    if (isLast) return Math.round((total - accumulated) * 100) / 100;
    return Math.round(((+itemRows[idx].netAmount || 0) / totalNet) * total * 100) / 100;
  };

  let cgstAcc = 0, sgstAcc = 0, igstAcc = 0, lineTotalAcc = 0;
  return itemRows.map((it, i) => {
    const isLast = i === itemRows.length - 1;
    const cgst = allocate(totCgst, i, isLast, cgstAcc);
    const sgst = allocate(totSgst, i, isLast, sgstAcc);
    const igst = allocate(totIgst, i, isLast, igstAcc);
    cgstAcc += cgst; sgstAcc += sgst; igstAcc += igst;
    const lineTotal = isLast
      ? Math.round((docTotal - lineTotalAcc) * 100) / 100
      : Math.round(((+it.netAmount || 0) + cgst + sgst + igst) * 100) / 100;
    lineTotalAcc += lineTotal;
    return { ...it, cgst, sgst, igst, lineTotal };
  });
}
