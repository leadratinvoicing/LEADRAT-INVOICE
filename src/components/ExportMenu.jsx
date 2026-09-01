import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EXPORT_FORMATS } from '../excelOps';

const PANEL_WIDTH = 250;
const EDGE = 8;

/**
 * Format picker for exporting a list. Portalled and positioned in fixed
 * coordinates for the same reason the column picker is: the page actions bar
 * wraps and sits inside scroll containers that would otherwise clip the panel.
 *
 * `count` is shown so it is obvious the export follows the filters currently
 * applied, not the whole table.
 */
export default function ExportMenu({ onExport, count, disabled }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const wrapRef = useRef(null);
  const panelRef = useRef(null);

  const reposition = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - EDGE;
    const above = r.top - EDGE;
    const dropUp = below < 200 && above > below;
    const left = Math.max(EDGE, Math.min(r.right - PANEL_WIDTH, window.innerWidth - PANEL_WIDTH - EDGE));
    setPos({
      left,
      top: dropUp ? undefined : r.bottom + 6,
      bottom: dropUp ? window.innerHeight - r.top + 6 : undefined
    });
  }, []);

  useLayoutEffect(() => { if (open) reposition(); }, [open, reposition]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      const inTrigger = wrapRef.current && wrapRef.current.contains(e.target);
      const inPanel = panelRef.current && panelRef.current.contains(e.target);
      if (!inTrigger && !inPanel) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const onMove = () => reposition();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, reposition]);

  function pick(ext) {
    setOpen(false);
    onExport(ext);
  }

  return (
    <div className="export-menu" ref={wrapRef}>
      <button
        type="button" className="btn btn-secondary" disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        title="Export the rows currently listed"
      >
        ⬇ Export <span style={{ fontSize: 9, opacity: 0.7 }}>▾</span>
      </button>

      {open && pos && createPortal(
        <div ref={panelRef} className="export-panel" style={{ left: pos.left, top: pos.top, bottom: pos.bottom }}>
          <div className="export-panel-head">
            Export {count !== undefined ? <strong>{count}</strong> : ''} row{count === 1 ? '' : 's'} as
          </div>
          {EXPORT_FORMATS.map((f) => (
            <button key={f.ext} type="button" className="export-option" onClick={() => pick(f.ext)}>
              <span className="export-option-icon">{f.icon}</span>
              <span>
                <span className="export-option-label">{f.label} <code>.{f.ext}</code></span>
                <span className="export-option-hint">{f.hint}</span>
              </span>
            </button>
          ))}
          <div className="export-panel-foot">
            Exports exactly what the filters above have selected.
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
