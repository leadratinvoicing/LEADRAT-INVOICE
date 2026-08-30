import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun,
  AlignmentType, WidthType, BorderStyle, VerticalAlign, PageOrientation
} from 'docx';
import { saveAs } from 'file-saver';
import { LOGO_DATA_URI } from './logo';
import { fmtDate, numberToWords } from './utils';
import {
  NOTE_ELECTRONIC, PROFORMA_NOTES, RUN_FONT, buildFilename, dataUriBytes, fmtMoneyDocx, titleCase
} from './docxShared';
import { generateDubaiDocx } from './dubaiDocx';

/* ============================================================
   DOCX GENERATION
   --------------------------------------------------------------
   Generates a fully editable Microsoft Word .docx file matching the
   original Leadrat invoice layout.

   - Amounts use "Rs." prefix for consistency across machines that may
     lack a Unicode font.
   - GSTIN section: if "gstApplicable === 'no'" we print "NOT APPLICABLE"
     instead of the GSTIN line.
   - The downloaded filename follows: "<last3>-<CLIENT> (<SUBTYPE>).docx"
   ============================================================ */

export async function generateDocx(d, company) {
  if (!d) throw new Error('Document not found');

  const isProforma = d.docType === 'proforma';
  const isDubai = d.branch === 'dubai';
  const co = company[d.branch] || company.pune;
  const bank = isDubai ? (company.dubaiBank || company.bank) : company.bank;
  const money = fmtMoneyDocx;

  // Dubai uses a different layout entirely: VAT @ 5%, AED, TRN + LICENSE NO,
  // RAK BANK / IBAN, four-column items table, "UAE Dirham" in words.
  if (isDubai) return generateDubaiDocx(d, isProforma, co, bank);

  // ---- Layout constants (DXA: 1440 = 1 inch). A4 portrait with 0.5" margins. ----
  const PAGE_W = 11906;
  const PAGE_H = 16838;
  const MARGIN_LR = 720;
  const TOTAL_WIDTH = PAGE_W - 2 * MARGIN_LR;
  const LEFT_W = Math.round(TOTAL_WIDTH * 0.55);
  const RIGHT_W = TOTAL_WIDTH - LEFT_W;
  const RIGHT_LABEL_W = Math.round(RIGHT_W * 0.4);
  const RIGHT_VAL_W = RIGHT_W - RIGHT_LABEL_W;

  const thin = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
  const ALL_BORDERS = { top: thin, bottom: thin, left: thin, right: thin };

  // ----------------------------------------------------------------
  // CASING RULES
  // Keep ALL CAPS only for "BILL TO", "GSTIN" (the "GST IN:" label prefix),
  // and "LEGAL NAME". All other text uses Title Case.
  // ----------------------------------------------------------------
  function R(text, opts) {
    opts = opts || {};
    let t = String(text == null ? '' : text);
    if (opts.upper) t = t.toUpperCase();
    else if (!opts.raw) t = titleCase(t, /^Rs\.\s/);
    return new TextRun({
      text: t,
      bold: !!opts.bold,
      size: opts.size || 18,
      font: RUN_FONT
    });
  }
  function RP(runs, opts) {
    opts = opts || {};
    return new Paragraph({
      alignment: opts.align || AlignmentType.LEFT,
      spacing: { before: 0, after: 0, line: 240 },
      children: runs
    });
  }
  function P(text, opts) {
    opts = opts || {};
    return RP([R(text, opts)], opts);
  }

  function cell(opts) {
    return new TableCell({
      width: { size: opts.width, type: WidthType.DXA },
      columnSpan: opts.colSpan,
      rowSpan: opts.rowSpan,
      verticalAlign: opts.vAlign || VerticalAlign.TOP,
      borders: opts.borders || ALL_BORDERS,
      shading: opts.shading,
      margins: { top: 80, bottom: 80, left: 100, right: 100 },
      children: opts.children
    });
  }

  // ---------- TITLE ----------
  const titlePara = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 200 },
    children: [new TextRun({ text: isProforma ? 'PROFORMA INVOICE' : 'TAX INVOICE', bold: true, size: 28, font: RUN_FONT })]
  });

  // ---------- HEADER TABLE ----------
  const COL_GRID = [LEFT_W, RIGHT_LABEL_W, RIGHT_VAL_W];

  const billFromChildren = [
    P('BILL FROM:', { bold: true, upper: true }),
    P(co.name, { bold: true }),
    ...co.address.split('\n').map((l) => P(l)),
    RP([R('GST IN: ', { bold: true, upper: true }), R(co.gstin, { bold: true, raw: true })]),
    RP([R('CIN: ', { bold: true, upper: true }), R(co.cin, { bold: true, raw: true })])
  ];

  const logoInfo = dataUriBytes(LOGO_DATA_URI);
  const logoChildren = [];
  if (logoInfo) {
    logoChildren.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 40, after: 40 },
      children: [new ImageRun({ data: logoInfo.bytes, type: logoInfo.type, transformation: { width: 130, height: 38 } })]
    }));
  } else {
    logoChildren.push(P('Leadrat', { bold: true, size: 32 }));
  }

  const headerRows = [
    new TableRow({
      children: [
        cell({ width: LEFT_W, rowSpan: 3, children: billFromChildren }),
        cell({ width: RIGHT_LABEL_W + RIGHT_VAL_W, colSpan: 2, vAlign: VerticalAlign.CENTER, children: logoChildren })
      ]
    }),
    new TableRow({
      children: [
        cell({ width: RIGHT_LABEL_W, children: [P('Invoice No:', { bold: true })] }),
        cell({ width: RIGHT_VAL_W, children: [P(d.invoiceNo || '', { raw: true })] })
      ]
    }),
    new TableRow({
      children: [
        cell({ width: RIGHT_LABEL_W, children: [P('Invoice Date:', { bold: true })] }),
        cell({ width: RIGHT_VAL_W, children: [P(fmtDate(d.invoiceDate), { raw: true })] })
      ]
    })
  ];
  const headerTable = new Table({
    width: { size: TOTAL_WIDTH, type: WidthType.DXA },
    columnWidths: COL_GRID,
    rows: headerRows
  });

  // ---------- BILL TO TABLE ----------
  const gstApplicable = d.gstApplicable !== 'no';
  let gstinChildren;
  if (gstApplicable) {
    const runs = [
      R('GST IN: ', { bold: true, upper: true }),
      R(d.clientGstin || '', { bold: true, raw: true })
    ];
    if (d.clientLegalName && d.clientLegalName.trim()) {
      // Only show the legal name when it differs from the client (trade) name —
      // repeating an identical name in parentheses is noise.
      const legal = d.clientLegalName.trim();
      const client = (d.clientName || '').trim();
      if (legal.toLowerCase() !== client.toLowerCase()) {
        runs.push(R(' (' + legal + ')', { bold: true, upper: true }));
      }
    }
    gstinChildren = RP(runs);
  } else {
    gstinChildren = RP([R('GST IN: ', { bold: true, upper: true }), R('NOT APPLICABLE', { bold: true, upper: true })]);
  }

  const billToChildren = [
    P('BILL TO:', { bold: true, upper: true }),
    P(d.clientName || '', { bold: true, upper: true }),
    ...(d.clientAddress || '').split('\n').filter((x) => x.trim()).map((l) => P(l, { bold: true, upper: true })),
    gstinChildren
  ];

  let rightAmountDueLabel, rightAmountDueValue, rightDueDateValue;
  if (isProforma) {
    rightAmountDueLabel = 'Amount Due:';
    rightAmountDueValue = money(d.totalAmount);
    rightDueDateValue = fmtDate(d.dueDate || d.invoiceDate);
  } else if (d.status === 'due') {
    rightAmountDueLabel = 'Amount Due:';
    const outstanding = (d.amountDueOutstanding !== undefined && d.amountDueOutstanding !== null && d.amountDueOutstanding !== '') ? d.amountDueOutstanding : d.totalAmount;
    rightAmountDueValue = money(outstanding);
    rightDueDateValue = fmtDate(d.dueDate || d.invoiceDate);
  } else {
    rightAmountDueLabel = 'Amount Due:';
    rightAmountDueValue = 'Payments Cleared';
    rightDueDateValue = 'Payments Cleared';
  }

  const billToRows = [
    new TableRow({
      children: [
        cell({ width: LEFT_W, rowSpan: 3, children: billToChildren }),
        cell({ width: RIGHT_LABEL_W, children: [P('HSN / SAC:', { bold: true, raw: true })] }),
        cell({ width: RIGHT_VAL_W, children: [P(d.hsn || '997331', { raw: true })] })
      ]
    }),
    new TableRow({
      children: [
        cell({ width: RIGHT_LABEL_W, children: [P(rightAmountDueLabel, { bold: true })] }),
        cell({ width: RIGHT_VAL_W, children: [P(rightAmountDueValue, { raw: true })] })
      ]
    }),
    new TableRow({
      children: [
        cell({ width: RIGHT_LABEL_W, children: [P('Due Date:', { bold: true })] }),
        cell({ width: RIGHT_VAL_W, children: [P(rightDueDateValue, { raw: true })] })
      ]
    })
  ];
  const billToTable = new Table({
    width: { size: TOTAL_WIDTH, type: WidthType.DXA },
    columnWidths: COL_GRID,
    rows: billToRows
  });

  // ---------- ITEMS TABLE ----------
  const itemRows = (Array.isArray(d.items) && d.items.length > 0) ? d.items : [{
    description: d.description || 'Leadrat CRM Application',
    subType: d.subType || '',
    fullDescription: d.fullDescription || ((d.description || 'Leadrat CRM Application') + (d.subType ? ' ' + d.subType : '')),
    paymentDate: d.paymentDate,
    noOfLicense: d.noOfLicense,
    validity: d.validity,
    netAmount: +d.netAmount || 0
  }];

  const totalNet = itemRows.reduce((s, it) => s + (+it.netAmount || 0), 0);
  const totCgst = +d.cgst || 0, totSgst = +d.sgst || 0, totIgst = +d.igst || 0;
  function allocate(total, idx, isLast, proportional) {
    if (totalNet <= 0) return 0;
    if (isLast) return Math.round((total - proportional) * 100) / 100;
    return Math.round(((+itemRows[idx].netAmount || 0) / totalNet) * total * 100) / 100;
  }
  let cgstAcc = 0, sgstAcc = 0, igstAcc = 0, lineTotalAcc = 0;
  const docTotal = +d.totalAmount || 0;
  const perItem = itemRows.map((it, i) => {
    const isLast = i === itemRows.length - 1;
    const cgst = allocate(totCgst, i, isLast, cgstAcc);
    const sgst = allocate(totSgst, i, isLast, sgstAcc);
    const igst = allocate(totIgst, i, isLast, igstAcc);
    cgstAcc += cgst; sgstAcc += sgst; igstAcc += igst;
    let lineTotal;
    if (isLast) {
      lineTotal = Math.round((docTotal - lineTotalAcc) * 100) / 100;
    } else {
      lineTotal = Math.round(((+it.netAmount || 0) + cgst + sgst + igst) * 100) / 100;
    }
    lineTotalAcc += lineTotal;
    return { ...it, cgst, sgst, igst, lineTotal };
  });

  let itemsTable;
  if (isProforma) {
    const cols = [
      Math.round(TOTAL_WIDTH * 0.16),
      Math.round(TOTAL_WIDTH * 0.13),
      Math.round(TOTAL_WIDTH * 0.10),
      Math.round(TOTAL_WIDTH * 0.12),
      Math.round(TOTAL_WIDTH * 0.14),
      Math.round(TOTAL_WIDTH * 0.13)
    ];
    cols.push(TOTAL_WIDTH - cols.reduce((s, x) => s + x, 0));
    // Every column in this table is centred, headers and values alike.
    const rawIdx = new Set([1, 4, 5, 6]);
    const headLabels = ['Description', 'Payment Due Date', 'No of License', 'Billing Type', 'Net Amount', 'GST/ IGST', 'Total Due'];
    const headRow = new TableRow({
      tableHeader: true,
      children: headLabels.map((h, i) => cell({
        width: cols[i],
        vAlign: VerticalAlign.CENTER,
        children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [R(h, { bold: true, upper: true, size: 16 })] })]
      }))
    });
    const dataRows = perItem.map((it) => {
      const totalGst = (it.cgst || 0) + (it.sgst || 0) + (it.igst || 0);
      const valLabels = [
        (it.fullDescription || (it.description + (it.subType ? ' ' + it.subType : ''))),
        fmtDate(d.dueDate || d.invoiceDate),
        it.noOfLicense || '',
        it.validity || '',
        money(it.netAmount),
        money(totalGst),
        money(it.lineTotal)
      ];
      return new TableRow({
        children: valLabels.map((v, i) => cell({
          width: cols[i],
          vAlign: VerticalAlign.CENTER,
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 0, after: 0 },
            children: [R(v, { size: 16, raw: rawIdx.has(i) })]
          })]
        }))
      });
    });
    const summaryRows = [];
    if (perItem.length > 1) {
      const totalGstSum = (+d.cgst || 0) + (+d.sgst || 0) + (+d.igst || 0);
      const summaryCells = [
        cell({
          width: cols[0] + cols[1] + cols[2] + cols[3],
          colSpan: 4,
          vAlign: VerticalAlign.CENTER,
          children: [new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 0, after: 0 }, children: [R('Total Due:', { bold: true, size: 16 })] })]
        }),
        cell({ width: cols[4], vAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [R(money(d.netAmount), { bold: true, size: 16, raw: true })] })] }),
        cell({ width: cols[5], vAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [R(money(totalGstSum), { bold: true, size: 16, raw: true })] })] }),
        cell({ width: cols[6], vAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [R(money(d.totalAmount), { bold: true, size: 16, raw: true })] })] })
      ];
      summaryRows.push(new TableRow({ children: summaryCells }));
    }
    itemsTable = new Table({
      width: { size: TOTAL_WIDTH, type: WidthType.DXA },
      columnWidths: cols,
      rows: [headRow, ...dataRows, ...summaryRows]
    });
  } else {
    const cols = [
      Math.round(TOTAL_WIDTH * 0.13),
      Math.round(TOTAL_WIDTH * 0.09),
      Math.round(TOTAL_WIDTH * 0.07),
      Math.round(TOTAL_WIDTH * 0.07),
      Math.round(TOTAL_WIDTH * 0.13),
      Math.round(TOTAL_WIDTH * 0.11),
      Math.round(TOTAL_WIDTH * 0.11),
      Math.round(TOTAL_WIDTH * 0.11)
    ];
    cols.push(TOTAL_WIDTH - cols.reduce((s, x) => s + x, 0));
    // All headers and values bold/centred, matching the proforma layout.
    const headLabels = ['Description', 'Payment Date', 'No of License', 'Validity', 'Net Amount', 'CGST', 'SGST', 'IGST', 'TOTAL AMOUNT'];
    const headRow = new TableRow({
      tableHeader: true,
      children: headLabels.map((h, i) => cell({
        width: cols[i],
        vAlign: VerticalAlign.CENTER,
        children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [R(h, { bold: true, size: 14, upper: true })] })]
      }))
    });
    const dataRows = perItem.map((it) => {
      const valCells = [
        { v: it.fullDescription || (it.description + (it.subType ? ' ' + it.subType : '')) },
        { v: it.paymentDate ? fmtDate(it.paymentDate) : '', raw: true },
        { v: it.noOfLicense || '' },
        { v: it.validity || '' },
        { v: money(it.netAmount), raw: true },
        { v: money(it.cgst), raw: true },
        { v: money(it.sgst), raw: true },
        { v: money(it.igst), raw: true },
        { v: money(it.lineTotal), raw: true }
      ];
      return new TableRow({
        children: valCells.map((cv, i) => cell({
          width: cols[i],
          vAlign: VerticalAlign.CENTER,
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 0, after: 0 },
            children: [R(cv.v, { size: 14, raw: !!cv.raw })]
          })]
        }))
      });
    });
    const summaryRows = [];
    if (perItem.length > 1) {
      const summaryLabel = (d.status === 'paid') ? 'Total Paid' : 'Total Due';
      const summaryCells = [
        cell({
          width: cols[0] + cols[1] + cols[2] + cols[3],
          colSpan: 4,
          vAlign: VerticalAlign.CENTER,
          children: [new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 0, after: 0 }, children: [R(summaryLabel + ':', { bold: true, size: 14 })] })]
        }),
        cell({ width: cols[4], vAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [R(money(d.netAmount), { bold: true, size: 14, raw: true })] })] }),
        cell({ width: cols[5], vAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [R(money(d.cgst), { bold: true, size: 14, raw: true })] })] }),
        cell({ width: cols[6], vAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [R(money(d.sgst), { bold: true, size: 14, raw: true })] })] }),
        cell({ width: cols[7], vAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [R(money(d.igst), { bold: true, size: 14, raw: true })] })] }),
        cell({ width: cols[8], vAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [R(money(d.totalAmount), { bold: true, size: 14, raw: true })] })] })
      ];
      summaryRows.push(new TableRow({ children: summaryCells }));
    }
    itemsTable = new Table({
      width: { size: TOTAL_WIDTH, type: WidthType.DXA },
      columnWidths: cols,
      rows: [headRow, ...dataRows, ...summaryRows]
    });
  }

  // ---------- BANKING + AMOUNT DUE ----------
  const bankChildren = [
    P('Banking Information:', { bold: true }),
    RP([R('Bank Name: ', { bold: true }), R(bank.name, { raw: true })]),
    RP([R('A/C Name: ', { bold: true }), R(bank.accName, { raw: true })]),
    RP([R('Account No: ', { bold: true }), R(bank.accNo, { raw: true })]),
    RP([R('IFSC No: ', { bold: true, raw: true }), R(bank.ifsc, { raw: true })]),
    RP([R('Account Type: ', { bold: true }), R(bank.type)])
  ];

  let dueLabelText, dueValueText;
  if (isProforma) {
    dueLabelText = 'Total Amount Due';
    dueValueText = money(d.totalAmount);
  } else {
    dueLabelText = 'Amount Due After Payment';
    if (d.status === 'due') {
      const outstanding = (d.amountDueOutstanding !== undefined && d.amountDueOutstanding !== null && d.amountDueOutstanding !== '') ? d.amountDueOutstanding : d.totalAmount;
      dueValueText = money(outstanding);
    } else {
      dueValueText = money(0);
    }
  }
  const bankCols = [LEFT_W, Math.round(RIGHT_W * 0.55), RIGHT_W - Math.round(RIGHT_W * 0.55)];

  const bankRow = new TableRow({
    children: [
      cell({ width: bankCols[0], children: bankChildren }),
      cell({
        width: bankCols[1], vAlign: VerticalAlign.CENTER,
        children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [R(dueLabelText, { bold: true })] })]
      }),
      cell({
        width: bankCols[2], vAlign: VerticalAlign.CENTER,
        children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [R(dueValueText, { bold: true, raw: true })] })]
      })
    ]
  });
  const bankTable = new Table({
    width: { size: TOTAL_WIDTH, type: WidthType.DXA },
    columnWidths: bankCols,
    rows: [bankRow]
  });

  // ---------- FULL-WIDTH FOOTER ROWS ----------
  function fullRow(children) {
    return new TableRow({ children: [cell({ width: TOTAL_WIDTH, children })] });
  }

  const footerRows = [];
  if (!isProforma) {
    footerRows.push(fullRow([
      RP([R('Payment Mode: ', { bold: true }), R(d.paymentMode || '', { raw: true })])
    ]));
  }
  const wordsLabel = isProforma ? 'Amount Due in Words: ' : 'Amount Paid in Words: ';
  footerRows.push(fullRow([
    RP([R(wordsLabel, { bold: true }), R(numberToWords(d.totalAmount))])
  ]));
  // A proforma carries a numbered Notes block; a tax invoice keeps the one line.
  // Every note is raw — title-casing would turn "Section 194J" into "Section 194j".
  if (isProforma) {
    footerRows.push(fullRow([
      RP([R('Notes: ', { bold: true }), R('1. ' + PROFORMA_NOTES[0], { raw: true })]),
      ...PROFORMA_NOTES.slice(1).map((note, i) => RP([R((i + 2) + '. ' + note, { raw: true })]))
    ]));
  } else {
    footerRows.push(fullRow([
      RP([R('Note: ', { bold: true }), R(NOTE_ELECTRONIC, { raw: true })])
    ]));
  }
  const termsRuns = [
    R('Terms & Conditions: ', { bold: true }),
    R('Clear payment within 15 days of receiving this invoice. There will be a 1.5% interest charge per month on late invoices. (Ignore If invoice is already cleared)')
  ];
  if (isProforma) {
    termsRuns.push(new TextRun({ text: ' ', font: RUN_FONT, size: 18 }));
  }
  footerRows.push(fullRow([RP(termsRuns)]));
  if (isProforma) {
    footerRows.push(fullRow([
      RP([R('Payment Gateway: ', { bold: true }), R('Payments via payment gateways attract 2.5% transaction charges.')])
    ]));
  }
  const footerTable = new Table({
    width: { size: TOTAL_WIDTH, type: WidthType.DXA },
    columnWidths: [TOTAL_WIDTH],
    rows: footerRows
  });

  // docx places adjacent tables flush against each other unless an empty
  // paragraph sits between them.
  const spacer = () => new Paragraph({ spacing: { before: 0, after: 0, line: 60 }, children: [new TextRun({ text: '', size: 2 })] });

  // ---------- BUILD DOCUMENT ----------
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
      children: [
        titlePara,
        headerTable,
        spacer(),
        billToTable,
        spacer(),
        itemsTable,
        spacer(),
        bankTable,
        spacer(),
        footerTable
      ]
    }]
  });

  const fname = buildFilename(d);
  const blob = await Packer.toBlob(wordDoc);
  saveAs(blob, fname);
  return fname;
}
