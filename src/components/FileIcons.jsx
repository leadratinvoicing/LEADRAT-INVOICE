/**
 * Document-format icons drawn inline, so Word and PDF are told apart at a
 * glance rather than by reading the label. Both share the same page-with-a-
 * folded-corner silhouette and differ only in colour and mark — the shorthand
 * people already know from a file manager.
 */

/** The page body and its folded corner, shared by both formats. */
function Page({ fill, fold }) {
  return (
    <>
      <path d="M5 2.5h8.2L19 8.3V20a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4 20V4a1.5 1.5 0 0 1 1-1.5z" fill={fill} />
      <path d="M13.2 2.5L19 8.3h-4.6a1.2 1.2 0 0 1-1.2-1.2V2.5z" fill={fold} />
    </>
  );
}

/**
 * 22px is the floor at which the mark inside the page still reads. Below that
 * the lettering collapses into a smudge, so colour and silhouette would be
 * doing all the work — the caption under the button covers that case anyway.
 */
const SIZE = 22;

/** Word — the blue page with a bold white W. */
export function WordIcon() {
  return (
    <svg viewBox="0 0 24 24" width={SIZE} height={SIZE} aria-hidden="true" focusable="false">
      <Page fill="#2B579A" fold="#1B3A66" />
      <path
        d="M6.4 11.2l1.3 5.4 1.55-3.8 1.55 3.8 1.3-5.4"
        fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * PDF — the red page with the extension set in a white band across the foot,
 * the convention every file manager uses. The band runs past the left edge of
 * the page so the three letters get the width they need to stay legible.
 */
export function PdfIcon() {
  return (
    <svg viewBox="0 0 24 24" width={SIZE} height={SIZE} aria-hidden="true" focusable="false">
      <Page fill="#C8302B" fold="#8F1E1A" />
      <rect x="1.5" y="12.6" width="18" height="7.4" rx="1.4" fill="#fff" />
      <text
        x="10.5" y="18.35" textAnchor="middle" fill="#C8302B"
        fontSize="6.4" fontWeight="800" fontFamily="Segoe UI, Tahoma, Verdana, sans-serif"
      >
        PDF
      </text>
    </svg>
  );
}
