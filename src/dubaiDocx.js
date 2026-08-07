import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun,
  AlignmentType, WidthType, BorderStyle, VerticalAlign, PageOrientation
} from 'docx';
import { saveAs } from 'file-saver';
import { DUBAI_LOGO_DATA_URI } from './logo';
import { aedToWords, fmtDate } from './utils';
import { RUN_FONT, buildFilename, dataUriBytes, fmtMoneyAed, titleCase } from './docxShared';

/* =====================================================================
   DUBAI WORD INVOICE
   Differences from the India layout:
     • Currency AED (no Rs.)
     • "TRN No:" instead of "GST IN:"
     • "LICENSE NO." instead of "CIN"
     • No HSN/SAC row
     • Items table is 4 columns: Description | No of License | Validity | Net Amount
     • Two rows at the bottom for VAT @ 5% and Total Amount
     • RAK BANK with IBAN + A/C No + Currency
     • Amount in words reads "UAE Dirham … Only."
   ===================================================================== */
export async function generateDubaiDocx(d, isProforma, co, bank) {
  const PAGE_W = 11906, PAGE_H = 16838, MARGIN_LR = 720;
  const TOTAL_WIDTH = PAGE_W - 2 * MARGIN_LR;

  // Every table reuses these three column boundaries. Separate tables in Word
  // only look aligned when their column widths match exactly.
  const LEFT_W = Math.round(TOTAL_WIDTH * 0.55);
  const MID_W = Math.round(TOTAL_WIDTH * 0.18);
  const RIGHT_W = TOTAL_WIDTH - LEFT_W - MID_W;

  const thin = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
  const ALL_BORDERS = { top: thin, bottom: thin, left: thin, right: thin };

  function R(text, opts) {
    opts = opts || {};
    let t = String(text == null ? '' : text);
    if (opts.upper) t = t.toUpperCase();
    else if (!opts.raw) t = titleCase(t, /^AED\s/);
    return new TextRun({ text: t, bold: !!opts.bold, size: opts.size || 18, font: RUN_FONT });
  }
  function RP(runs, opts) {
    opts = opts || {};
    return new Paragraph({
      alignment: opts.align || AlignmentType.LEFT,
      spacing: { before: 0, after: 0, line: 240 },
      children: runs
    });
  }
  function P(text, opts) { opts = opts || {}; return RP([R(text, opts)], opts); }
  function cell(opts) {
    return new TableCell({
      width: { size: opts.width, type: WidthType.DXA },
      borders: ALL_BORDERS,
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      verticalAlign: opts.vAlign || VerticalAlign.CENTER,
      columnSpan: opts.colSpan,
      rowSpan: opts.rowSpan,
      children: opts.children
    });
  }
  function aligned(runs, align) {
    return new Paragraph({ alignment: align || AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: runs });
  }

  const money = fmtMoneyAed;
  const trnAvailable = d.gstApplicable !== 'no';
  const trnValue = trnAvailable ? (d.clientGstin || 'NOT AVAILABLE') : 'NOT AVAILABLE';
  const payDateLabel = isProforma ? 'Payment Due Date:' : 'Payment Date:';
  const payDateVal = fmtDate(d.dueDate || d.invoiceDate || (d.items && d.items[0] && d.items[0].paymentDate));

  /* ---------- TABLE 1: Bill From + logo + invoice no/date + Bill To ---------- */
  const billFromChildren = [
    P('BILL FROM:', { bold: true, upper: true }),
    P(co.name || 'DHINWA SOLUTIONS TRADING L.L.C', { bold: true, upper: true }),
    ...(co.address || '').split('\n').filter((x) => x.trim()).map((l) => P(l, { bold: true, upper: true })),
    RP([R('LICENSE NO. ', { bold: true, upper: true }), R(co.licenseNo || '1451890', { bold: true, raw: true })]),
    RP([R('TRN No: ', { bold: true, raw: true }), R(co.trn || '104804338200003', { bold: true, raw: true })])
  ];

  const logoInfo = dataUriBytes(DUBAI_LOGO_DATA_URI);
  const logoChildren = logoInfo
    ? [new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 80, after: 80 },
      children: [new ImageRun({ data: logoInfo.bytes, type: logoInfo.type, transformation: { width: 200, height: 60 } })]
    })]
    : [P('Dhinwa Solutions Trading L.L.C', { bold: true, size: 22 })];

  const billToChildren = [
    P('BILL TO:', { bold: true, upper: true }),
    P(d.clientName || '', { bold: true, upper: true }),
    ...(d.clientAddress || '').split('\n').filter((x) => x.trim()).map((l) => P(l, { bold: true, upper: true })),
    RP([R('TRN NO: ', { bold: true, upper: true }), R(trnValue, { bold: true, upper: true, raw: true })])
  ];

  const topTable = new Table({
    width: { size: TOTAL_WIDTH, type: WidthType.DXA },
    columnWidths: [LEFT_W, MID_W, RIGHT_W],
    rows: [
      new TableRow({
        children: [
          cell({ width: LEFT_W, rowSpan: 3, vAlign: VerticalAlign.TOP, children: billFromChildren }),
          cell({ width: MID_W + RIGHT_W, colSpan: 2, children: logoChildren })
        ]
      }),
      new TableRow({
        children: [
          cell({ width: MID_W, children: [P('Invoice No:', { bold: true })] }),
          cell({ width: RIGHT_W, children: [P(d.invoiceNo || '', { raw: true })] })
        ]
      }),
      new TableRow({
        children: [
          cell({ width: MID_W, children: [P('Invoice Date:', { bold: true })] }),
          cell({ width: RIGHT_W, children: [P(fmtDate(d.invoiceDate), { raw: true })] })
        ]
      }),
      new TableRow({
        children: [
          cell({ width: LEFT_W, vAlign: VerticalAlign.TOP, children: billToChildren }),
          cell({ width: MID_W, children: [P(payDateLabel, { bold: true })] }),
          cell({ width: RIGHT_W, children: [P(payDateVal, { raw: true })] })
        ]
      })
    ]
  });

  /* ---------- TABLE 2: items ---------- */
  const itemRows = (Array.isArray(d.items) && d.items.length > 0) ? d.items : [{
    description: d.description || 'Leadrat CRM Software',
    subType: d.subType || '',
    fullDescription: d.fullDescription || ((d.description || 'Leadrat CRM Software') + (d.subType ? ' ' + d.subType : '')),
    noOfLicense: d.noOfLicense,
    validity: d.validity,
    netAmount: +d.netAmount || 0
  }];

  const itemsCols = [
    Math.round(TOTAL_WIDTH * 0.44),
    Math.round(TOTAL_WIDTH * 0.16),
    Math.round(TOTAL_WIDTH * 0.16)
  ];
  itemsCols.push(TOTAL_WIDTH - itemsCols.reduce((s, x) => s + x, 0));

  const headRow = new TableRow({
    tableHeader: true,
    children: ['DESCRIPTION', 'NO OF LICENSE', 'VALIDITY', 'NET AMOUNT'].map((h, i) => cell({
      width: itemsCols[i],
      children: [aligned([R(h, { bold: true, size: 16, upper: true })])]
    }))
  });

  const dataRows = itemRows.map((it) => new TableRow({
    children: [
      cell({ width: itemsCols[0], children: [aligned([R(it.fullDescription || (it.description + (it.subType ? ' ' + it.subType : '')), { size: 16 })])] }),
      cell({ width: itemsCols[1], children: [aligned([R(it.noOfLicense || '', { size: 16 })])] }),
      cell({ width: itemsCols[2], children: [aligned([R(it.validity || '', { size: 16 })])] }),
      cell({ width: itemsCols[3], children: [aligned([R(money(it.netAmount), { size: 16, raw: true })], AlignmentType.RIGHT)] })
    ]
  }));

  const itemsTable = new Table({
    width: { size: TOTAL_WIDTH, type: WidthType.DXA },
    columnWidths: itemsCols,
    rows: [headRow, ...dataRows]
  });

  /* ---------- TABLE 3: banking + VAT + total + footer ---------- */
  const bankChildren = [
    P('Banking Information:', { bold: true }),
    RP([R('IBAN: ', { bold: true, upper: true }), R(bank.iban || bank.accNo || '', { raw: true })]),
    RP([R('A/C No: ', { bold: true }), R(bank.accNo || '', { raw: true })]),
    RP([R('Currency: ', { bold: true }), R(bank.currency || 'AED', { raw: true })]),
    RP([R('Bank name: ', { bold: true }), R(bank.name || 'RAK BANK', { raw: true })]),
    RP([R('Account Name: ', { bold: true }), R(bank.accName || 'DHINWA SOLUTIONS TRADING LLC', { raw: true })])
  ];

  const netTotal = +d.netAmount || 0;
  const vatAmt = (+d.igst) || ((+d.cgst || 0) + (+d.sgst || 0)) || (netTotal * 0.05);
  const grandTotal = (+d.totalAmount) || (netTotal + vatAmt);

  const fullRow = (children) => new TableRow({ children: [cell({ width: TOTAL_WIDTH, colSpan: 3, children })] });

  const bottomTable = new Table({
    width: { size: TOTAL_WIDTH, type: WidthType.DXA },
    columnWidths: [LEFT_W, MID_W, RIGHT_W],
    rows: [
      new TableRow({
        children: [
          cell({ width: LEFT_W, rowSpan: 2, vAlign: VerticalAlign.TOP, children: bankChildren }),
          cell({ width: MID_W, children: [aligned([R('VAT @ 5%', { bold: true, upper: true })])] }),
          cell({ width: RIGHT_W, children: [aligned([R(money(vatAmt), { bold: true, raw: true })], AlignmentType.RIGHT)] })
        ]
      }),
      new TableRow({
        children: [
          cell({ width: MID_W, children: [aligned([R('Total Amount', { bold: true })])] }),
          cell({ width: RIGHT_W, children: [aligned([R(money(grandTotal), { bold: true, raw: true })], AlignmentType.RIGHT)] })
        ]
      }),
      fullRow([RP([R('Payment Mode: ', { bold: true }), R(d.paymentMode || 'Bank Transfer', { raw: true })])]),
      fullRow([RP([R(isProforma ? 'Amount Due in Words: ' : 'Amount Paid in Words: ', { bold: true }), R(aedToWords(grandTotal), { raw: true })])]),
      fullRow([RP([R('Note: ', { bold: true }), R('Electronically Generated Invoice No Signature Necessary.')])]),
      fullRow([RP([R('Terms & Conditions: ', { bold: true }), R('Clear payment within 15 days of receiving this invoice. There will be a 1.5% interest charge per month on late invoices. (Ignore If invoice is already cleared)')])])
    ]
  });

  const titlePara = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 120 },
    children: [new TextRun({ text: isProforma ? 'PROFORMA INVOICE' : 'TAX INVOICE', bold: true, size: 28, font: RUN_FONT })]
  });

  // Near-zero-height paragraph removes the gap Word inserts between adjacent tables.
  const gap = () => new Paragraph({ spacing: { before: 0, after: 0, line: 20 }, children: [] });

  const wordDoc = new Document({
    creator: 'Leadrat Invoicing',
    title: (isProforma ? 'Proforma ' : '') + 'Invoice ' + (d.invoiceNo || ''),
    styles: { default: { document: { run: { font: RUN_FONT, size: 18 } } } },
    sections: [{
      properties: {
        page: {
          size: { width: PAGE_W, height: PAGE_H, orientation: PageOrientation.PORTRAIT },
          margin: { top: 720, right: MARGIN_LR, bottom: 720, left: MARGIN_LR }
        }
      },
      children: [titlePara, topTable, gap(), itemsTable, gap(), bottomTable]
    }]
  });

  const fname = buildFilename(d);
  const blob = await Packer.toBlob(wordDoc);
  saveAs(blob, fname);
  return fname;
}
