import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Per-viewer control over which table columns are shown.
 *
 * The choice is a personal view preference, not shared data, so it lives in
 * localStorage keyed by user and table — one person hiding GSTIN never changes
 * what anybody else sees. Columns marked `locked` cannot be switched off,
 * because a row with no identifying column is unusable.
 */

const PREFIX = 'leadrat:columns:';

const keyFor = (tableId, user) => PREFIX + tableId + ':' + ((user && user.email) || 'anon');

/**
 * Read the stored selection.
 *
 * Two things are remembered, not one: which columns are VISIBLE, and which
 * columns the user has actually SEEN. Without the second, a column added to
 * the app later would be absent from every saved selection and so stay hidden
 * forever — the user would never discover it existed. A column the user has
 * not seen yet is shown; once they touch the picker it is recorded as seen and
 * their choice sticks from then on.
 */
export function loadColumnPrefs(tableId, user, allColumns) {
  const valid = new Set(allColumns.map((c) => c.key));
  const defaults = () => new Set(allColumns.filter((c) => !c.hiddenByDefault).map((c) => c.key));
  try {
    const raw = localStorage.getItem(keyFor(tableId, user));
    if (!raw) return defaults();
    const saved = JSON.parse(raw);
    // Older installs stored a bare array of visible keys and no "seen" list.
    const visible = Array.isArray(saved) ? saved : (saved && saved.visible) || [];
    const legacy = Array.isArray(saved);
    const seen = new Set(legacy ? [] : ((saved && saved.seen) || []));
    const next = new Set(visible.filter((k) => valid.has(k)));
    for (const c of allColumns) {
      if (visible.includes(c.key) || c.hiddenByDefault) continue;
      // Old prefs list only the visible keys, so "absent" is ambiguous: it may
      // be a column the user hid, or one added since. Only columns explicitly
      // flagged as newly introduced are surfaced, so a deliberate choice to
      // hide something is never undone. Newer prefs carry a "seen" list and
      // need no flag.
      if (legacy ? c.isNew : !seen.has(c.key)) next.add(c.key);
    }
    return next.size ? next : defaults();
  } catch { /* unreadable or private mode — fall through to the defaults */ }
  return defaults();
}

function saveColumnPrefs(tableId, user, visible, allColumns) {
  try {
    // `seen` is every column that existed at the moment of the choice, so a
    // column added later can still surface itself exactly once.
    const payload = { visible: [...visible], seen: (allColumns || []).map((c) => c.key) };
    localStorage.setItem(keyFor(tableId, user), JSON.stringify(payload));
  } catch { /* nothing we can do; the choice just won't survive a reload */ }
}

const PANEL_WIDTH = 230;
const PANEL_MAX_HEIGHT = 380;
const EDGE = 8;

/**
 * `visible` is a Set of column keys. `onChange` receives the next Set, which
 * this component also persists.
 */
export default function ColumnPicker({ tableId, user, allColumns, visible, onChange, label = 'Columns' }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const wrapRef = useRef(null);
  const panelRef = useRef(null);

  /**
   * The filter bar wraps and sits inside scrolling containers, so an absolutely
   * positioned panel gets clipped at the viewport edge. Anchor it to the trigger
   * in fixed coordinates instead, right-aligned but always pulled back inside
   * the window, and flipped above when there is no room below.
   */
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
      bottom: dropUp ? window.innerHeight - r.top + 6 : undefined,
      maxHeight: Math.max(180, Math.min(PANEL_MAX_HEIGHT, dropUp ? above : below))
    });
  }, []);

  useLayoutEffect(() => { if (open) reposition(); }, [open, reposition]);

  useEffect(() => {
    if (!open) return undefined;
    const onDocMouseDown = (e) => {
      const inTrigger = wrapRef.current && wrapRef.current.contains(e.target);
      const inPanel = panelRef.current && panelRef.current.contains(e.target);
      if (!inTrigger && !inPanel) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const onMove = () => reposition();
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, reposition]);

  function apply(next) {
    saveColumnPrefs(tableId, user, next, allColumns);
    onChange(next);
  }

  function toggle(col) {
    if (col.locked) return;
    const next = new Set(visible);
    if (next.has(col.key)) {
      // Never let the last optional column go — an all-blank table helps nobody.
      if (next.size <= 1) return;
      next.delete(col.key);
    } else {
      next.add(col.key);
    }
    apply(next);
  }

  const showAll = () => apply(new Set(allColumns.map((c) => c.key)));
  const reset = () => {
    try { localStorage.removeItem(keyFor(tableId, user)); } catch { /* ignore */ }
    onChange(new Set(allColumns.filter((c) => !c.hiddenByDefault).map((c) => c.key)));
  };

  const shown = allColumns.filter((c) => visible.has(c.key)).length;
  const hiddenCount = allColumns.length - shown;

  return (
    <div className="col-picker" ref={wrapRef}>
      <button
        type="button"
        className={'form-input col-picker-trigger' + (hiddenCount > 0 ? ' filtered' : '')}
        onClick={() => setOpen((o) => !o)}
        title="Choose which columns to show"
      >
        ⚙ {label} <span className="col-picker-count">{shown}/{allColumns.length}</span>
      </button>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          className="col-picker-panel"
          style={{ left: pos.left, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}
        >
          <div className="col-picker-head">
            <span>Show columns</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" className="col-picker-link" onClick={showAll}>All</button>
              <button type="button" className="col-picker-link" onClick={reset}>Reset</button>
            </div>
          </div>
          <div className="col-picker-list">
            {allColumns.map((c) => {
              const on = visible.has(c.key);
              return (
                <label
                  key={c.key}
                  className={'col-picker-row' + (c.locked ? ' locked' : '')}
                  title={c.locked ? 'Always shown' : undefined}
                >
                  <input
                    type="checkbox" checked={on || !!c.locked} disabled={!!c.locked}
                    onChange={() => toggle(c)}
                  />
                  <span>{c.label}</span>
                  {c.locked && <span className="col-picker-lock">🔒</span>}
                </label>
              );
            })}
          </div>
          <div className="col-picker-foot">
            Saved on this device for {(user && user.email) || 'this session'}.
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
