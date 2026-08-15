import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const PANEL_MAX_HEIGHT = 320;

/**
 * A dropdown with a type-to-filter box, for lists too long to scan by eye.
 * Options are `{ value, label }`; matching is a case-insensitive substring on
 * the label, and the list is sorted alphabetically.
 *
 * Behaves like the native <select> it replaces: `value` is the selected
 * option's value ('' = nothing selected) and `onChange` receives the new value.
 *
 * The panel is portalled to <body> and positioned fixed, because the form this
 * sits in lives inside scroll containers (.modal, .inline-editor-body) that
 * would otherwise clip it.
 */
export default function SearchableSelect({ value, onChange, options, placeholder, searchPlaceholder, emptyText }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [pos, setPos] = useState(null);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);
  const searchRef = useRef(null);
  const listRef = useRef(null);

  // Alphabetical, case-insensitive, so "anantum" and "ANANTUM" sort together.
  const sorted = useMemo(
    () => [...options].sort((a, b) => String(a.label).localeCompare(String(b.label), undefined, { sensitivity: 'base' })),
    [options]
  );

  const q = query.trim().toLowerCase();
  const filtered = q ? sorted.filter((o) => String(o.label).toLowerCase().includes(q)) : sorted;
  const selected = options.find((o) => o.value === value);

  /** Anchor the panel to the trigger, flipping above it when space is tight. */
  const reposition = useCallback(() => {
    const el = buttonRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 8;
    const above = r.top - 8;
    const dropUp = below < Math.min(PANEL_MAX_HEIGHT, 220) && above > below;
    setPos({
      left: r.left,
      width: r.width,
      top: dropUp ? undefined : r.bottom + 4,
      bottom: dropUp ? window.innerHeight - r.top + 4 : undefined,
      maxHeight: Math.max(160, Math.min(PANEL_MAX_HEIGHT, dropUp ? above : below))
    });
  }, []);

  useLayoutEffect(() => {
    if (open) reposition();
  }, [open, reposition]);

  // Follow the trigger while any ancestor scrolls or the window resizes.
  useEffect(() => {
    if (!open) return undefined;
    const onScrollOrResize = () => reposition();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, reposition]);

  // Close on an outside click. The panel is portalled, so check it separately.
  useEffect(() => {
    if (!open) return undefined;
    const onDocMouseDown = (e) => {
      const inTrigger = buttonRef.current && buttonRef.current.contains(e.target);
      const inPanel = panelRef.current && panelRef.current.contains(e.target);
      if (!inTrigger && !inPanel) setOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  // Opening starts from a clean search box with the first row highlighted.
  useEffect(() => {
    if (!open) return undefined;
    setQuery('');
    setHighlight(0);
    const t = setTimeout(() => searchRef.current && searchRef.current.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const row = listRef.current.children[highlight];
    if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
  }, [highlight, open]);

  function pick(v) {
    onChange(v);
    setOpen(false);
  }

  function onSearchKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(filtered.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = filtered[Math.min(highlight, filtered.length - 1)];
      if (opt) pick(opt.value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  }

  const panel = open && pos ? createPortal(
    <div
      ref={panelRef}
      style={{
        position: 'fixed', left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom,
        zIndex: 1500, background: '#fff', border: '1.5px solid var(--border)', borderRadius: 8,
        boxShadow: '0 8px 24px rgba(0,0,0,0.14)', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', maxHeight: pos.maxHeight
      }}
    >
      <div style={{ padding: 8, borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <input
          ref={searchRef}
          type="text"
          className="form-input"
          placeholder={searchPlaceholder}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setHighlight(0); }}
          onKeyDown={onSearchKeyDown}
          style={{ padding: '8px 10px', fontSize: 13 }}
        />
      </div>

      <div ref={listRef} style={{ overflowY: 'auto', flex: 1 }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '12px 14px', fontSize: 13, color: 'var(--muted)' }}>{emptyText}</div>
        ) : filtered.map((o, i) => {
          const isSelected = o.value === value;
          return (
            <div
              key={o.value}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => pick(o.value)}
              style={{
                padding: '9px 14px', fontSize: 13, cursor: 'pointer',
                background: i === highlight ? 'var(--brand-light)' : 'transparent',
                color: isSelected ? 'var(--brand-dark)' : 'var(--text)',
                fontWeight: isSelected ? 600 : 400
              }}
            >
              {o.label}
            </div>
          );
        })}
      </div>

      {value && (
        <div
          onClick={() => pick('')}
          style={{
            padding: '9px 14px', fontSize: 12, cursor: 'pointer', color: 'var(--muted)',
            borderTop: '1px solid var(--border)', background: '#FAFBFC', flexShrink: 0
          }}
        >
          ✕ Clear selection
        </div>
      )}
    </div>,
    document.body
  ) : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="form-input"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          textAlign: 'left', background: '#fff', cursor: 'pointer',
          color: selected ? 'var(--text)' : 'var(--muted)'
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.label : placeholder}
        </span>
        <span style={{ color: 'var(--muted)', fontSize: 11, flexShrink: 0 }}>▼</span>
      </button>
      {panel}
    </>
  );
}
