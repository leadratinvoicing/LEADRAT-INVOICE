/* ============================================================
   APP TOUR
   A short walkthrough of the sections a person can actually reach. Every step
   names the element it points at with a `data-tour` attribute rather than a
   class or position, so restyling the app never silently breaks the tour.

   `page` moves the app to that section before the step is shown. `perm` hides
   a step from anyone who cannot see that section — there is no point pointing
   at a nav tab that is not there.
   ============================================================ */

export const TOUR_VERSION = 1;

export const TOUR_STEPS = [
  {
    id: 'welcome',
    target: null, // centred — nothing to point at yet
    title: 'Welcome to Leadrat Invoicing',
    body: 'A two-minute tour of the parts you will use most. You can leave it and come back any '
      + 'time from the ❓ Help button in the top bar.'
  },
  {
    id: 'dashboard',
    target: '[data-tour="nav-dashboard"]',
    page: 'dashboard',
    title: 'Dashboard',
    body: 'Your headline numbers: invoices raised, revenue received, tax collected and what is still '
      + 'outstanding. Every card is clickable and opens the documents behind it. Use the region tabs '
      + 'and the date range to narrow everything on the page at once.'
  },
  {
    id: 'invoices',
    target: '[data-tour="nav-invoices"]',
    page: 'invoices',
    perm: 'invoices',
    title: 'Tax Invoices',
    body: 'Every tax invoice you can see, with search, status, branch and date filters. '
      + 'Use ⚙ Columns to choose which columns you want — the choice is remembered for you alone.'
  },
  {
    id: 'newInvoice',
    target: '[data-tour="new-doc"]',
    page: 'invoices',
    perm: 'invoices',
    permAction: 'create',
    title: 'Raising a document',
    body: 'The invoice number is filled in for you with the next free number in the series, and you '
      + 'can type your own instead — a number already in use is refused rather than silently changed. '
      + 'Enter the Total including tax; net and GST/VAT are worked out for you.'
  },
  {
    id: 'rowActions',
    target: '[data-tour="row-actions"]',
    page: 'invoices',
    perm: 'invoices',
    title: 'What you can do with a document',
    body: 'Preview it, download it as Word or PDF, assign it to a colleague, edit or delete it. '
      + 'On a proforma there is also 🔄 Convert, which raises the tax invoice against it and keeps '
      + 'the two linked.'
  },
  {
    id: 'proforma',
    target: '[data-tour="nav-proforma"]',
    page: 'proforma',
    perm: 'proforma',
    title: 'Proforma Invoices',
    body: 'Proformas request payment; converting one raises the tax invoice and keeps both documents '
      + 'cross-linked, so the proforma still shows what is left to invoice and to collect.'
  },
  {
    id: 'clients',
    target: '[data-tour="nav-clients"]',
    page: 'clients',
    perm: 'clients',
    title: 'Clients',
    body: 'Your client book. A client can hold more than one GSTIN, each with its own billing '
      + 'address — the invoice form then asks which to bill. Click a client name to see every '
      + 'document raised for them.'
  },
  {
    id: 'export',
    target: '[data-tour="export"]',
    page: 'invoices',
    perm: 'invoices',
    permAction: 'export',
    title: 'Exporting',
    body: 'Export what the filters are currently showing as Excel, CSV or JSON. What you see on '
      + 'screen is exactly what goes into the file.'
  },
  {
    id: 'settings',
    target: '[data-tour="nav-settings"]',
    page: 'settings',
    perm: 'settings',
    title: 'Settings',
    body: 'Your profile and password live here. Admins also control company details per branch, '
      + 'the document numbering series, and message templates.'
  },
  {
    id: 'help',
    target: '[data-tour="help"]',
    title: 'That is the tour',
    body: 'Everything is saved to the shared database as you work, so colleagues see your documents '
      + 'and you see theirs. Run this tour again any time from ❓ Help.'
  }
];

/**
 * The steps this person should actually be shown. A step tied to a section they
 * cannot open is dropped rather than pointing at something that is not there.
 */
export function stepsFor(can, isAdmin) {
  return TOUR_STEPS.filter((s) => {
    if (!s.perm) return true;
    if (isAdmin) return true;
    return can(s.perm, s.permAction || 'view');
  });
}
