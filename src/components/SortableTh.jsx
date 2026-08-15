import { useState } from 'react';

/* ============================================================
   SORTABLE TABLE HEADERS
   Every list table shares this: click a header to toggle
   ascending/descending, or click one of the two arrows beside the
   label to force that direction.
   ============================================================ */

/**
 * @param {string|null} defaultKey column sorted on first render (null = keep
 *   the order the caller supplied)
 * @param {'asc'|'desc'} defaultDir
 */
export function useSort(defaultKey = null, defaultDir = 'desc') {
  const [sort, setSort] = useState({ key: defaultKey, dir: defaultDir });

  // Clicking the same column flips direction; a new column starts ascending.
  const toggle = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  const setDir = (key, dir) => setSort({ key, dir });

  return { sort, toggle, setDir };
}

/**
 * Sort a list by the active column. `accessors` maps a column key to a getter
 * returning either a number (dates as timestamps, money as numbers) or a
 * string. Rows with no value always sink to the bottom, both directions.
 */
export function sortRows(list, sort, accessors) {
  if (!sort || !sort.key) return list;
  const get = accessors[sort.key];
  if (!get) return list;
  const dir = sort.dir === 'asc' ? 1 : -1;
  const empty = (v) => v === null || v === undefined || v === '' || (typeof v === 'number' && isNaN(v));

  return [...list].sort((a, b) => {
    const va = get(a);
    const vb = get(b);
    if (empty(va) && empty(vb)) return 0;
    if (empty(va)) return 1;
    if (empty(vb)) return -1;
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
    return String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: 'base' }) * dir;
  });
}

export default function SortableTh({ label, sortKey, sort, onSort, onSetDir, style, align }) {
  const active = sort.key === sortKey;
  const asc = active && sort.dir === 'asc';
  const desc = active && sort.dir === 'desc';

  const arrow = (dir, glyph, on) => (
    <span
      className={'sort-arrow' + (on ? ' on' : '')}
      title={label + ' — sort ' + (dir === 'asc' ? 'ascending' : 'descending')}
      onClick={(e) => {
        e.stopPropagation();
        if (onSetDir) onSetDir(sortKey, dir);
      }}
    >
      {glyph}
    </span>
  );

  return (
    <th
      className={'sortable' + (active ? ' sorted' : '')}
      style={style}
      onClick={() => onSort(sortKey)}
      title={'Sort by ' + label}
      aria-sort={active ? (asc ? 'ascending' : 'descending') : 'none'}
    >
      <span className="th-inner" style={align === 'right' ? { flexDirection: 'row-reverse' } : undefined}>
        <span>{label}</span>
        <span className="sort-arrows">
          {arrow('asc', '▲', asc)}
          {arrow('desc', '▼', desc)}
        </span>
      </span>
    </th>
  );
}
