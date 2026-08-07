# Leadrat Invoicing — React + Firebase

A React (Vite) port of `leadrat-invoicing_12.html`. The UI, styling and behaviour are
carried over unchanged; storage moved from Supabase/`window.storage` to **Cloud Firestore**,
and user login moved from the old client-side password hash to **Firebase Authentication**
(email/password **and** Google).

## Feature coverage

Everything from the HTML build is present:

| Area | What's included |
|---|---|
| Dashboard | Region tabs (🌐 All / 🇮🇳 India / 🇦🇪 Dubai), currency-aware stat cards that are clickable and deep-link with a status filter, branch column on recent documents, admin-only recent-users panel, Download/Load Backup |
| Invoices & Proforma | Branch column, GSTIN/TRN header, Dubai branch filter, per-row currency (₹ / AED), proforma → tax invoice **Convert** with "✓ Invoiced" reconciliation badge |
| Invoice form | Country selector (India / Dubai). Dubai reshapes the form: TRN instead of GSTIN, no HSN, no CGST/SGST split, flat VAT @ 5%, AED labels, Bank Transfer default |
| Word export | Separate India and Dubai templates. Dubai uses the AED layout with TRN + LICENSE NO, a 4-column items table, RAK BANK / IBAN, and "UAE Dirham … Only." in words |
| Bulk import | India **and** Dubai Excel templates; rows sharing an `invoice_no` merge into one multi-item invoice (flagged MERGE in the preview) |
| Clients | Search, add/edit/delete, Excel template, bulk upload with duplicate detection |
| Users & Permissions | Per-user module/action matrix, per-department defaults editor, view/edit/suspend/delete |
| Settings | Profile, Change Password, and Company Info with Pune / Bengaluru / **Dubai** branch tabs — editable and savable when signed in as admin, read-only otherwise |
| TDS | TDS manager modal with rate/status/received-date editing (hidden on the Dubai dashboard tab — UAE VAT has no TDS) |
| Backup | Portable JSON snapshot, downloadable from the dashboard and loadable from the dashboard **or the login screen** |

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production bundle in dist/
npm run preview  # serve the built bundle
```

## Firebase console setup (required)

The app points at the `leadrat-invoicing` project. Three things must be switched on there
or sign-in and saving will fail:

### 1. Authentication → Sign-in method
Enable all three providers:

| Provider | Why |
|---|---|
| **Email/Password** | Sign Up / Sign In for `name@leadrat.com` accounts |
| **Google** | The "Sign in with Google" button |
| **Anonymous** | The Admin tab logs in anonymously so Firestore rules can require auth |

### 2. Authentication → Settings → Authorized domains
Add every domain you serve from (`localhost` is there by default). Without this,
Google sign-in fails with `auth/unauthorized-domain`.

### 3. Firestore Database
Create the database, then set rules. All app data lives in one collection,
`app_storage`, with one document per key (`users`, `invoices`, `clients`,
`numbering`, `company`, `deptPermissions`, `adminPass`).

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /app_storage/{key} {
      allow read, write: if request.auth != null;
    }
  }
}
```

If you skip the Anonymous provider, the admin login can't authenticate to Firestore —
either enable it or loosen the rule to `if true` (development only).

## What changed from the HTML version

| Area | Before | Now |
|---|---|---|
| User sign-up / sign-in | Custom `hashPassword()` compared against a stored `passHash` | Firebase Authentication (email/password) |
| Google sign-in | — | Added. A first-time Google user gets a profile created automatically with no department and minimal permissions until an admin assigns them |
| Change own password | Rewrote `passHash` in storage | Firebase re-authenticate + `updatePassword` |
| Admin resets a user's password | Typed a new password directly | **Sends a password reset email.** Firebase's client SDK cannot set another account's password; that needs the Admin SDK on a server |
| Data storage | Supabase `app_storage` table (unconfigured) → `window.storage` | Cloud Firestore `app_storage` collection, with a localStorage fallback for offline reads |
| Admin login | Shared password `Beunited@12` | Unchanged, plus an anonymous Firebase sign-in so Firestore stays authenticated |

Everything else — the invoice/proforma forms, multi-item tax back-calculation, TDS
manager, department permission matrix, Excel import/export, backup/restore, and both
Word (.docx) invoice generators — is a direct port and produces identical output.

Deleting a user here removes their profile and access. Their Firebase sign-in record
must be deleted separately from the Firebase console.

## Layout

```
src/
  main.jsx           entry
  App.jsx            auth screen vs. main app
  MainApp.jsx        topbar, navigation, persistence handlers, modal wiring
  AppContext.jsx     all app state, storage helpers, session restore
  firebase.js        Firebase init (auth, Firestore, analytics)
  auth.js            sign-up / sign-in / Google / password helpers
  store.js           get(key)/set(key,value) over Firestore
  constants.js       departments, countries, branches, permission matrix, company details
  utils.js           formatting (₹ / AED), validation, numbering helpers
  docxShared.js      helpers shared by both Word generators
  docxGen.js         India Word invoice generator + Dubai dispatch
  dubaiDocx.js       Dubai (AED / VAT / TRN) Word invoice generator
  excelOps.js        India + Dubai Excel templates, import parsing, export
  backupOps.js       backup file build / parse / restore prompt
  logo.js            embedded Leadrat and Dubai-entity logos
  styles.css         the original stylesheet, verbatim
  components/        auth screen, pages, modals
```
