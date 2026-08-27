/**
 * Same markup/behaviour as the original `.modal-backdrop` blocks: clicking the
 * backdrop (but not the card) closes it.
 *
 * `hideClose` drops the ✕ and the backdrop dismissal, for the few dialogs the
 * user has to answer rather than walk away from.
 */
export default function Modal({ open, title, onClose, maxWidth, children, footer, hideClose }) {
  if (!open) return null;
  return (
    <div
      className="modal-backdrop show"
      onClick={(e) => { if (!hideClose && e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal" style={maxWidth ? { maxWidth } : undefined}>
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          {!hideClose && <button className="modal-close" onClick={onClose}>&times;</button>}
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
