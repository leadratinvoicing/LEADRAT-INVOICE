/* ============================================================
   APTOS NARROW — PDF FONT DATA
   --------------------------------------------------------------
   The Word documents ask for "Aptos Narrow" by name (docxShared.RUN_FONT) and
   Word loads it from the machine. A PDF has no such luxury: jsPDF only ships the
   14 standard PDF fonts, so the typeface has to travel inside the file, which
   means the .ttf has to be compiled into the app as base64.

   This file is regenerated from the real font files by:

       npm run embed-font

   which copies Aptos Narrow out of the Windows font folder (or from paths you
   pass it). Until that is run these stay empty and pdfGen falls back to
   Helvetica — the layout is identical either way, only the typeface differs.
   ============================================================ */

export const APTOS_NARROW_REGULAR = '';
export const APTOS_NARROW_BOLD = '';
