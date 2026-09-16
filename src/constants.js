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
  'Engageto', 'Engageto Recharge', 'Engageto Renewal', 'Customization Charges', 'Set-Up Fee', 'Instalment', 'Others'
];

export const KNOWN_SUBTYPES = [
  'New', 'Renewal', 'Balance Pay', 'Additional User', 'Trial',
  'Engageto', 'Engageto Recharge', 'Engageto Renewal', 'Customization Charges', 'Set-Up Fee', 'Instalment'
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

// `label` carries the flag for filter dropdowns; `name` is the plain form used
// inside the invoice form, where the Country field already states the region.
export const BRANCHES = [
  { value: 'pune', name: 'Pune', label: '🇮🇳 Pune', country: 'india' },
  { value: 'bengaluru', name: 'Bengaluru', label: '🇮🇳 Bengaluru', country: 'india' },
  { value: 'dubai', name: 'Dubai', label: '🇦🇪 Dubai', country: 'dubai' },
  { value: 'abudhabi', name: 'Abu Dhabi', label: '🇦🇪 Abu Dhabi', country: 'dubai' }
];

/**
 * A user's `branchAccess` — which branches they may view and edit. Data outside
 * the selection is hidden from dashboards, invoice lists and the clients page.
 * Admins always have full access regardless of this setting.
 */
export const BRANCH_ACCESS_OPTIONS = [
  { value: 'all', label: '🌐 All Branches (India + UAE)', short: '🌐 All' },
  { value: 'india', label: '🇮🇳 India Only (Pune + Bengaluru)', short: '🇮🇳 India' },
  { value: 'pune', label: '🇮🇳 Pune Only', short: '🇮🇳 Pune' },
  { value: 'bengaluru', label: '🇮🇳 Bengaluru Only', short: '🇮🇳 Bengaluru' },
  { value: 'dubai', label: '🇦🇪 UAE (Dubai + Abu Dhabi)', short: '🇦🇪 UAE' },
  { value: 'dubaiOnly', label: '🇦🇪 Dubai Only', short: '🇦🇪 Dubai' },
  { value: 'abudhabi', label: '🇦🇪 Abu Dhabi Only', short: '🇦🇪 Abu Dhabi' }
];

/** The three region tabs shared by the dashboard and the clients page filter. */
export const REGION_TABS = [
  { value: 'all', label: '🌐 All' },
  { value: 'india', label: '🇮🇳 India' },
  { value: 'dubai', label: '🇦🇪 UAE' }
];

export const PERMISSION_MODULES = [
  { key: 'invoices', label: 'Tax Invoices', actions: ['view', 'create', 'edit', 'delete', 'export', 'generatePdf', 'assign'] },
  { key: 'proforma', label: 'Proforma Invoices', actions: ['view', 'create', 'edit', 'delete', 'export', 'generatePdf', 'assign'] },
  { key: 'clients', label: 'Clients', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'import', label: 'Bulk Import', actions: ['view', 'import', 'downloadTemplate'] },
  { key: 'settings', label: 'Settings', actions: ['view', 'editProfile', 'changePassword'] }
];

export const ACTION_LABELS = {
  view: 'View', create: 'Create', edit: 'Edit', delete: 'Delete', export: 'Export',
  generatePdf: 'Generate PDF', assign: 'Assign to Users', import: 'Import Excel',
  downloadTemplate: 'Download Template', editProfile: 'Edit Profile', changePassword: 'Change Password'
};

/**
 * How much of the data a user sees inside the branches they already have access
 * to. 'own' is the narrow view asked for by sales teams: a rep works their own
 * book and nothing else. Admins ignore this entirely.
 */
export const DATA_SCOPE_OPTIONS = [
  { value: 'all', label: 'All records in their branches', short: 'All records' },
  { value: 'own', label: 'Only records they created or are assigned', short: 'Own + assigned' }
];

/**
 * Roles carry permissions; departments stay as org structure. A role is stored
 * as { id, name, description, permissions, dataScope }, and these ship as the
 * starting set so an install has something usable before anyone edits them.
 */
export const BUILT_IN_ROLE_SEEDS = [
  { id: 'role_admin_ops', name: 'Finance Manager', description: 'Full access to every document and client record.', from: 'Finance', dataScope: 'all' },
  { id: 'role_sales_lead', name: 'Sales Lead', description: 'Creates and edits documents across the team, sees everything.', from: 'Sales', dataScope: 'all' },
  { id: 'role_sales_rep', name: 'Sales Manager', description: 'Works their own book — sees only what they raised or were assigned.', from: 'Sales', dataScope: 'own' },
  { id: 'role_cs', name: 'Customer Success', description: 'Manages renewals and client records for their own accounts.', from: 'Customer Success', dataScope: 'own' },
  { id: 'role_viewer', name: 'Read Only', description: 'Can view and export, but cannot change anything.', from: 'Development', dataScope: 'all' }
];

export const DEFAULT_DEPT_PERMISSIONS = {
  Sales: {
    invoices: { view: true, create: true, edit: true, delete: false, export: true, generatePdf: true, assign: true },
    proforma: { view: true, create: true, edit: true, delete: false, export: true, generatePdf: true, assign: true },
    clients: { view: true, create: true, edit: true, delete: false },
    import: { view: true, import: true, downloadTemplate: true },
    settings: { view: true, editProfile: true, changePassword: true }
  },
  Development: {
    invoices: { view: true, create: false, edit: false, delete: false, export: true, generatePdf: true, assign: false },
    proforma: { view: true, create: false, edit: false, delete: false, export: true, generatePdf: true, assign: false },
    clients: { view: true, create: false, edit: false, delete: false },
    import: { view: false, import: false, downloadTemplate: false },
    settings: { view: true, editProfile: true, changePassword: true }
  },
  HR: {
    invoices: { view: false, create: false, edit: false, delete: false, export: false, generatePdf: false, assign: false },
    proforma: { view: false, create: false, edit: false, delete: false, export: false, generatePdf: false, assign: false },
    clients: { view: false, create: false, edit: false, delete: false },
    import: { view: false, import: false, downloadTemplate: false },
    settings: { view: true, editProfile: true, changePassword: true }
  },
  'Customer Success': {
    invoices: { view: true, create: true, edit: true, delete: false, export: true, generatePdf: true, assign: true },
    proforma: { view: true, create: true, edit: true, delete: false, export: true, generatePdf: true, assign: true },
    clients: { view: true, create: true, edit: true, delete: false },
    import: { view: true, import: false, downloadTemplate: true },
    settings: { view: true, editProfile: true, changePassword: true }
  },
  Operations: {
    invoices: { view: true, create: true, edit: true, delete: false, export: true, generatePdf: true, assign: true },
    proforma: { view: true, create: true, edit: true, delete: false, export: true, generatePdf: true, assign: true },
    clients: { view: true, create: true, edit: true, delete: true },
    import: { view: true, import: true, downloadTemplate: true },
    settings: { view: true, editProfile: true, changePassword: true }
  },
  Finance: {
    invoices: { view: true, create: true, edit: true, delete: true, export: true, generatePdf: true, assign: true },
    proforma: { view: true, create: true, edit: true, delete: true, export: true, generatePdf: true, assign: true },
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
  invoices: { view: false, create: false, edit: false, delete: false, export: false, generatePdf: false, assign: false },
  proforma: { view: false, create: false, edit: false, delete: false, export: false, generatePdf: false, assign: false },
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
  // Abu Dhabi trades as the same UAE entity as Dubai, so the address, TRN and
  // licence are identical. Held as its own block rather than an alias, so the
  // two can be given separate details later without a data migration.
  abudhabi: {
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
  // Proformas run two independent series, matching the two tax regimes:
  // India (Pune + Bengaluru) and Dubai.
  proPrefix: 'DSL/26-27/PI-',
  proPrefixDbx: 'DSL/26-27/DB-PI-',
  invPrefixAbd: 'DSL/26-27/AD-',
  proPrefixAbd: 'DSL/26-27/AD-PI-',
  nextInvPune: 11,
  nextInvBlu: 7,
  nextInvDbx: 41, // starts after DB-040 per reference
  nextPro: 88,
  nextProDbx: 1,
  nextInvAbd: 1,
  nextProAbd: 1,
  // Format controls — a document number is prefix + zero-padded counter + suffix.
  invPadPune: 3,
  invPadBlu: 3,
  invPadDbx: 3,
  proPad: 3,
  proPadDbx: 3,
  invPadAbd: 3,
  proPadAbd: 3,
  invSuffixPune: '',
  invSuffixBlu: '',
  invSuffixDbx: '',
  proSuffix: '',
  proSuffixDbx: '',
  invSuffixAbd: '',
  proSuffixAbd: ''
};

/**
 * The five independent document series. Each one owns its own prefix, counter
 * and format, and the Settings → Numbering & Format tab is generated from this
 * list, so adding a series here is all it takes to expose it.
 */
export const NUMBER_SERIES = [
  {
    key: 'pune', label: 'Pune Tax Invoice', docType: 'invoice', branch: 'pune',
    prefixKey: 'invPrefixPune', nextKey: 'nextInvPune', padKey: 'invPadPune', suffixKey: 'invSuffixPune'
  },
  {
    key: 'bengaluru', label: 'Bengaluru Tax Invoice', docType: 'invoice', branch: 'bengaluru',
    prefixKey: 'invPrefixBlu', nextKey: 'nextInvBlu', padKey: 'invPadBlu', suffixKey: 'invSuffixBlu'
  },
  {
    key: 'dubai', label: 'Dubai Tax Invoice', docType: 'invoice', branch: 'dubai',
    prefixKey: 'invPrefixDbx', nextKey: 'nextInvDbx', padKey: 'invPadDbx', suffixKey: 'invSuffixDbx'
  },
  {
    key: 'proforma', label: 'India Proforma Invoice (Pune + Bengaluru)', docType: 'proforma', branch: 'india',
    prefixKey: 'proPrefix', nextKey: 'nextPro', padKey: 'proPad', suffixKey: 'proSuffix'
  },
  {
    key: 'proformaDubai', label: 'Dubai Proforma Invoice', docType: 'proforma', branch: 'dubai',
    prefixKey: 'proPrefixDbx', nextKey: 'nextProDbx', padKey: 'proPadDbx', suffixKey: 'proSuffixDbx'
  },
  {
    key: 'abudhabi', label: 'Abu Dhabi Tax Invoice', docType: 'invoice', branch: 'abudhabi',
    prefixKey: 'invPrefixAbd', nextKey: 'nextInvAbd', padKey: 'invPadAbd', suffixKey: 'invSuffixAbd'
  },
  {
    key: 'proformaAbuDhabi', label: 'Abu Dhabi Proforma Invoice', docType: 'proforma', branch: 'abudhabi',
    prefixKey: 'proPrefixAbd', nextKey: 'nextProAbd', padKey: 'proPadAbd', suffixKey: 'proSuffixAbd'
  }
];

export const DEFAULT_ADMIN_PASS = 'Beunited@12';

/**
 * GST state code of the branch raising the invoice. A client GSTIN starting
 * with the same two digits is an intra-state supply (CGST + SGST); anything
 * else is inter-state (IGST). Dubai has no GST, so it is absent here.
 */
export const BRANCH_GST_STATE_CODE = {
  pune: '27',      // Maharashtra
  bengaluru: '29'  // Karnataka
};

/** Sub-types billed against an earlier invoice — no licence count or validity of their own. */
export const NO_LICENSE_SUBTYPES = ['Balance Pay'];

/* ============================================================
   AUDIT LOG
   Every entry records WHO did WHAT and WHEN. The catalogue below drives the
   filter dropdown and the wording shown in the log, so adding an action means
   adding one line here rather than touching the page.
   ============================================================ */

export const AUDIT_ACTIONS = [
  { key: 'login', label: 'Signed in', icon: '🔑', group: 'Access' },
  { key: 'logout', label: 'Signed out', icon: '🚪', group: 'Access' },
  { key: 'invoice_created', label: 'Tax invoice created', icon: '🧾', group: 'Documents' },
  { key: 'invoice_updated', label: 'Tax invoice edited', icon: '✏️', group: 'Documents' },
  { key: 'invoice_deleted', label: 'Tax invoice deleted', icon: '🗑', group: 'Documents' },
  { key: 'proforma_created', label: 'Proforma created', icon: '📄', group: 'Documents' },
  { key: 'proforma_updated', label: 'Proforma edited', icon: '✏️', group: 'Documents' },
  { key: 'proforma_deleted', label: 'Proforma deleted', icon: '🗑', group: 'Documents' },
  { key: 'pi_converted', label: 'Proforma converted', icon: '🔄', group: 'Documents' },
  { key: 'doc_assigned', label: 'Document assigned', icon: '👤', group: 'Documents' },
  { key: 'doc_unassigned', label: 'Document unassigned', icon: '👤', group: 'Documents' },
  { key: 'number_collision', label: 'Number collision resolved', icon: '⚠️', group: 'Documents' },
  { key: 'client_created', label: 'Client added', icon: '🏢', group: 'Clients' },
  { key: 'client_updated', label: 'Client edited', icon: '🏢', group: 'Clients' },
  { key: 'client_deleted', label: 'Client deleted', icon: '🗑', group: 'Clients' },
  { key: 'clients_imported', label: 'Clients imported', icon: '📥', group: 'Clients' },
  { key: 'invoices_imported', label: 'Invoices imported', icon: '📥', group: 'Documents' },
  { key: 'user_created', label: 'User created', icon: '👥', group: 'Users' },
  { key: 'user_updated', label: 'User updated', icon: '👥', group: 'Users' },
  { key: 'user_deleted', label: 'User deleted', icon: '🗑', group: 'Users' },
  { key: 'role_saved', label: 'Role saved', icon: '🎭', group: 'Users' },
  { key: 'role_deleted', label: 'Role deleted', icon: '🎭', group: 'Users' },
  { key: 'company_updated', label: 'Company details changed', icon: '⚙️', group: 'Settings' },
  { key: 'numbering_updated', label: 'Numbering changed', icon: '⚙️', group: 'Settings' },
  { key: 'data_exported', label: 'Data exported', icon: '⬇', group: 'Settings' },
  { key: 'backup_restored', label: 'Backup restored', icon: '♻️', group: 'Settings' },
  { key: 'backup_downloaded', label: 'Backup downloaded', icon: '💾', group: 'Settings' },
  { key: 'doc_downloaded', label: 'Document downloaded', icon: '📄', group: 'Documents' },
  { key: 'tds_updated', label: 'TDS records updated', icon: '🧮', group: 'Documents' },
  { key: 'user_signup', label: 'Account self-registered', icon: '🆕', group: 'Access' },
  { key: 'password_changed', label: 'Password changed', icon: '🔒', group: 'Access' },
  { key: 'password_reset_sent', label: 'Password reset sent', icon: '✉️', group: 'Access' },
  { key: 'template_downloaded', label: 'Template downloaded', icon: '📋', group: 'Settings' },
  { key: 'tour_completed', label: 'Finished the app tour', icon: '🎓', group: 'Access' },
  { key: 'tour_replayed', label: 'Replayed the app tour', icon: '🧭', group: 'Access' }
];

export const AUDIT_ACTION_MAP = AUDIT_ACTIONS.reduce((m, a) => { m[a.key] = a; return m; }, {});

/** Entries kept. Old ones fall off the end; the log is a recent-activity trail. */
export const AUDIT_LIMIT = 2000;

/** A session idle longer than this resyncs everything on the next activity. */
export const IDLE_RESYNC_MS = 2 * 60 * 60 * 1000;

/* ============================================================
   INDIAN CITIES
   The city list offered when adding a client. Grouped by state so a long list
   stays scannable, and ordered with the biggest business hubs first inside
   each group. "Others" keeps the field open — a client in a town that is not
   listed is typed in rather than forced into the nearest match.
   ============================================================ */

export const OTHER_CITY = 'Others';

export const INDIAN_CITIES = [
  { state: 'Delhi NCR', cities: ['New Delhi', 'Gurugram', 'Noida', 'Greater Noida', 'Ghaziabad', 'Faridabad'] },
  { state: 'Maharashtra', cities: ['Mumbai', 'Navi Mumbai', 'Thane', 'Pune', 'Pimpri-Chinchwad', 'Nagpur', 'Nashik', 'Chhatrapati Sambhajinagar', 'Solapur', 'Kolhapur'] },
  { state: 'Karnataka', cities: ['Bengaluru', 'Mysuru', 'Mangaluru', 'Hubballi-Dharwad', 'Belagavi'] },
  { state: 'Telangana', cities: ['Hyderabad', 'Secunderabad', 'Warangal'] },
  { state: 'Tamil Nadu', cities: ['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem', 'Tiruppur'] },
  { state: 'Gujarat', cities: ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Gandhinagar', 'Bhavnagar'] },
  { state: 'West Bengal', cities: ['Kolkata', 'Howrah', 'Siliguri', 'Durgapur'] },
  { state: 'Rajasthan', cities: ['Jaipur', 'Jodhpur', 'Udaipur', 'Kota', 'Ajmer'] },
  { state: 'Uttar Pradesh', cities: ['Lucknow', 'Kanpur', 'Agra', 'Varanasi', 'Prayagraj', 'Meerut', 'Bareilly'] },
  { state: 'Kerala', cities: ['Kochi', 'Thiruvananthapuram', 'Kozhikode', 'Thrissur', 'Kollam'] },
  { state: 'Madhya Pradesh', cities: ['Indore', 'Bhopal', 'Jabalpur', 'Gwalior', 'Ujjain'] },
  { state: 'Andhra Pradesh', cities: ['Visakhapatnam', 'Vijayawada', 'Guntur', 'Tirupati', 'Nellore'] },
  { state: 'Punjab', cities: ['Ludhiana', 'Amritsar', 'Jalandhar', 'Mohali', 'Patiala'] },
  { state: 'Haryana', cities: ['Panipat', 'Karnal', 'Ambala', 'Hisar', 'Rohtak'] },
  { state: 'Odisha', cities: ['Bhubaneswar', 'Cuttack', 'Rourkela'] },
  { state: 'Bihar', cities: ['Patna', 'Gaya', 'Muzaffarpur', 'Bhagalpur'] },
  { state: 'Jharkhand', cities: ['Ranchi', 'Jamshedpur', 'Dhanbad'] },
  { state: 'Chhattisgarh', cities: ['Raipur', 'Bhilai', 'Bilaspur'] },
  { state: 'Uttarakhand', cities: ['Dehradun', 'Haridwar', 'Haldwani', 'Rudrapur'] },
  { state: 'Assam & North East', cities: ['Guwahati', 'Dibrugarh', 'Shillong', 'Imphal', 'Agartala', 'Itanagar'] },
  { state: 'Himachal Pradesh', cities: ['Shimla', 'Dharamshala', 'Solan'] },
  { state: 'Jammu, Kashmir & Ladakh', cities: ['Srinagar', 'Jammu', 'Leh'] },
  { state: 'Goa', cities: ['Panaji', 'Margao', 'Vasco da Gama'] },
  { state: 'Union Territories', cities: ['Chandigarh', 'Puducherry', 'Port Blair', 'Daman', 'Silvassa'] }
];

/** Fast membership test — tells a listed city from one typed under "Others". */
export const INDIAN_CITY_SET = new Set(INDIAN_CITIES.flatMap((g) => g.cities));
