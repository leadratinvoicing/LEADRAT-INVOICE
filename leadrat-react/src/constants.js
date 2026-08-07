/* ============================================================
   CONSTANTS — ported verbatim from the original HTML build
   ============================================================ */

export const EMAIL_DOMAIN = '@leadrat.com';

export const DEPARTMENTS = ['Sales', 'Development', 'HR', 'Customer Success', 'Operations', 'Finance'];

// value format: "ISO|dialCode|mobileLength"
export const COUNTRIES = [
  { value: 'IN|+91|10', label: '🇮🇳 +91 (India)' },
  { value: 'US|+1|10', label: '🇺🇸 +1 (USA)' },
  { value: 'GB|+44|10', label: '🇬🇧 +44 (UK)' },
  { value: 'AE|+971|9', label: '🇦🇪 +971 (UAE)' },
  { value: 'SG|+65|8', label: '🇸🇬 +65 (Singapore)' },
  { value: 'AU|+61|9', label: '🇦🇺 +61 (Australia)' },
  { value: 'CA|+1|10', label: '🇨🇦 +1 (Canada)' },
  { value: 'DE|+49|11', label: '🇩🇪 +49 (Germany)' },
  { value: 'FR|+33|9', label: '🇫🇷 +33 (France)' },
  { value: 'JP|+81|10', label: '🇯🇵 +81 (Japan)' },
  { value: 'CN|+86|11', label: '🇨🇳 +86 (China)' },
  { value: 'MY|+60|10', label: '🇲🇾 +60 (Malaysia)' },
  { value: 'NZ|+64|9', label: '🇳🇿 +64 (New Zealand)' },
  { value: 'ZA|+27|9', label: '🇿🇦 +27 (South Africa)' },
  { value: 'BR|+55|11', label: '🇧🇷 +55 (Brazil)' },
  { value: 'SA|+966|9', label: '🇸🇦 +966 (Saudi Arabia)' },
  { value: 'QA|+974|8', label: '🇶🇦 +974 (Qatar)' },
  { value: 'OM|+968|8', label: '🇴🇲 +968 (Oman)' },
  { value: 'BH|+973|8', label: '🇧🇭 +973 (Bahrain)' },
  { value: 'KW|+965|8', label: '🇰🇼 +965 (Kuwait)' },
  { value: 'LK|+94|9', label: '🇱🇰 +94 (Sri Lanka)' },
  { value: 'BD|+880|10', label: '🇧🇩 +880 (Bangladesh)' },
  { value: 'NP|+977|10', label: '🇳🇵 +977 (Nepal)' }
];

export const VALIDITY_OPTIONS = ['1 Month', '3 Months', '6 Months', '1 Year', 'Current'];

export const SUBTYPE_OPTIONS = [
  'New', 'Renewal', 'Balance Pay', 'Additional User', 'Trial',
  'Engageto', 'Engageto Recharge', 'Customization Charges', 'Set-Up Fee', 'Instalment', 'Others'
];

export const KNOWN_SUBTYPES = [
  'New', 'Renewal', 'Balance Pay', 'Additional User', 'Trial',
  'Engageto', 'Engageto Recharge', 'Customization Charges', 'Set-Up Fee', 'Instalment'
];

export const PAYMENT_MODES = [
  { value: 'UPI', label: 'UPI' },
  { value: 'NEFT', label: 'NEFT' },
  { value: 'BANK TRANSFER', label: 'Bank Transfer' },
  { value: 'PAYMENT GATEWAY', label: 'Payment Gateway' },
  { value: 'RTGS', label: 'RTGS' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'CASH', label: 'Cash' }
];

export const BRANCHES = [
  { value: 'pune', label: '🇮🇳 Pune', country: 'india' },
  { value: 'bengaluru', label: '🇮🇳 Bengaluru', country: 'india' },
  { value: 'dubai', label: '🇦🇪 Dubai', country: 'dubai' }
];

export const PERMISSION_MODULES = [
  { key: 'invoices', label: 'Tax Invoices', actions: ['view', 'create', 'edit', 'delete', 'export', 'generatePdf'] },
  { key: 'proforma', label: 'Proforma Invoices', actions: ['view', 'create', 'edit', 'delete', 'export', 'generatePdf'] },
  { key: 'clients', label: 'Clients', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'import', label: 'Bulk Import', actions: ['view', 'import', 'downloadTemplate'] },
  { key: 'settings', label: 'Settings', actions: ['view', 'editProfile', 'changePassword'] }
];

export const ACTION_LABELS = {
  view: 'View', create: 'Create', edit: 'Edit', delete: 'Delete', export: 'Export',
  generatePdf: 'Generate PDF', import: 'Import Excel', downloadTemplate: 'Download Template',
  editProfile: 'Edit Profile', changePassword: 'Change Password'
};

export const DEFAULT_DEPT_PERMISSIONS = {
  Sales: {
    invoices: { view: true, create: true, edit: true, delete: false, export: true, generatePdf: true },
    proforma: { view: true, create: true, edit: true, delete: false, export: true, generatePdf: true },
    clients: { view: true, create: true, edit: true, delete: false },
    import: { view: true, import: true, downloadTemplate: true },
    settings: { view: true, editProfile: true, changePassword: true }
  },
  Development: {
    invoices: { view: true, create: false, edit: false, delete: false, export: true, generatePdf: true },
    proforma: { view: true, create: false, edit: false, delete: false, export: true, generatePdf: true },
    clients: { view: true, create: false, edit: false, delete: false },
    import: { view: false, import: false, downloadTemplate: false },
    settings: { view: true, editProfile: true, changePassword: true }
  },
  HR: {
    invoices: { view: false, create: false, edit: false, delete: false, export: false, generatePdf: false },
    proforma: { view: false, create: false, edit: false, delete: false, export: false, generatePdf: false },
    clients: { view: false, create: false, edit: false, delete: false },
    import: { view: false, import: false, downloadTemplate: false },
    settings: { view: true, editProfile: true, changePassword: true }
  },
  'Customer Success': {
    invoices: { view: true, create: true, edit: true, delete: false, export: true, generatePdf: true },
    proforma: { view: true, create: true, edit: true, delete: false, export: true, generatePdf: true },
    clients: { view: true, create: true, edit: true, delete: false },
    import: { view: true, import: false, downloadTemplate: true },
    settings: { view: true, editProfile: true, changePassword: true }
  },
  Operations: {
    invoices: { view: true, create: true, edit: true, delete: false, export: true, generatePdf: true },
    proforma: { view: true, create: true, edit: true, delete: false, export: true, generatePdf: true },
    clients: { view: true, create: true, edit: true, delete: true },
    import: { view: true, import: true, downloadTemplate: true },
    settings: { view: true, editProfile: true, changePassword: true }
  },
  Finance: {
    invoices: { view: true, create: true, edit: true, delete: true, export: true, generatePdf: true },
    proforma: { view: true, create: true, edit: true, delete: true, export: true, generatePdf: true },
    clients: { view: true, create: true, edit: true, delete: true },
    import: { view: true, import: true, downloadTemplate: true },
    settings: { view: true, editProfile: true, changePassword: true }
  }
};

/**
 * Given to a Google account that signs in before an admin has assigned it a
 * department — everything locked except the user's own settings. Dashboard is
 * always reachable, matching userCanAccess().
 */
export const MINIMAL_PERMISSIONS = {
  invoices: { view: false, create: false, edit: false, delete: false, export: false, generatePdf: false },
  proforma: { view: false, create: false, edit: false, delete: false, export: false, generatePdf: false },
  clients: { view: false, create: false, edit: false, delete: false },
  import: { view: false, import: false, downloadTemplate: false },
  settings: { view: true, editProfile: true, changePassword: true }
};

export const DEFAULT_COMPANY = {
  pune: {
    name: 'DHINWA SOLUTIONS PVT. LTD.',
    address: 'PUNE: 5TH FLOOR, 505,\nBUSINESS BAY\nBANER SUS ROAD PUNE-411045',
    gstin: '27AAJCD9183B1ZI',
    cin: 'U62099KA2023PTC171870'
  },
  bengaluru: {
    name: 'DHINWA SOLUTIONS PVT. LTD.',
    address: 'Bengaluru: #1596, 3rd Floor, HSR Layout 1st Sector,\nBeside Highlander Motor Garage, Agara Village, Bengaluru – 560102.',
    gstin: '29AAJCD9183B1ZE',
    cin: 'U62099KA2023PTC171870'
  },
  // Dubai branch — different legal entity, currency (AED), tax regime
  // (VAT @ 5% instead of GST). Uses TRN + LICENSE NO instead of GSTIN + CIN.
  dubai: {
    name: 'DHINWA SOLUTIONS TRADING L.L.C',
    address: 'PHASE - 1, BLOCK - J, UNIT # 7 - 8,\nDUBAI INDUSTRIAL CITY, DUBAI U.A.E',
    trn: '104804338200003',
    licenseNo: '1451890'
  },
  bank: {
    name: 'ICICI BANK',
    accName: 'DHINWA SOLUTIONS PRIVATE LIMITED',
    accNo: '729505500142',
    ifsc: 'ICIC0007295',
    type: 'Current'
  },
  // Separate banking for Dubai — RAK BANK, IBAN-based
  dubaiBank: {
    name: 'RAK BANK',
    accName: 'DHINWA SOLUTIONS TRADING LLC',
    accNo: '0333498420001',
    iban: 'AE640400000333498420001',
    currency: 'AED'
  }
};

export const DEFAULT_NUMBERING = {
  invPrefixPune: 'DSLM/26-27/',
  invPrefixBlu: 'DSLK/26-27/',
  invPrefixDbx: 'DSL/26-27/DB-',
  proPrefix: 'DSL/26-27/PI-',
  nextInvPune: 11,
  nextInvBlu: 7,
  nextInvDbx: 41, // starts after DB-040 per reference
  nextPro: 88
};

export const DEFAULT_ADMIN_PASS = 'Beunited@12';
