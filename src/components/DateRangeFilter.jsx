import { fmtDate } from '../utils';

const pad2 = (n) => String(n).padStart(2, '0');
const toInput = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());

/**
 * The Indian financial year runs 1 April → 31 March, so anything before April
 * belongs to the year that started the previous calendar year.
 */
function financialYear(offset = 0) {
  const now = new Date();
  const startYear = (now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear()) + offset;
  return { from: toInput(new Date(startYear, 3, 1)), to: toInput(new Date(startYear + 1, 2, 31)) };
}

function monthRange(offset = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return { from: toInput(start), to: toInput(end) };
}

/** Ready-made windows, so the common questions take one click instead of two dates. */
const PRESETS = [
  { key: 'thisMonth', label: 'This Month', range: () => monthRange(0) },
  { key: 'lastMonth', label: 'Last Month', range: () => monthRange(-1) },
  {
    key: 'last90',
    label: 'Last 90 Days',
    range: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 89);
      return { from: toInput(start), to: toInput(now) };
    }
  },
  { key: 'thisFy', label: 'This FY', range: () => financialYear(0) },
  { key: 'lastFy', label: 'Last FY', range: () => financialYear(-1) }
];

/**
 * From / To filter on document dates, shared by the dashboard and both document
 * lists. Either bound may be left empty for an open-ended window.
 *
 * `from` and `to` are YYYY-MM-DD strings ('' = unset); `onChange` receives the
 * next `{ from, to }` pair.
 */
export default function DateRangeFilter({ from, to, onChange, label = 'Date range', count, noun = 'documents' }) {
  const active = !!(from || to);
  const matchingPreset = PRESETS.find((p) => {
    const r = p.range();
    return r.from === from && r.to === to;
  });

  const summary = !active
    ? 'All time'
    : from && to
    ? fmtDate(from) + ' → ' + fmtDate(to)
    : from
    ? 'From ' + fmtDate(from)
    : 'Up to ' + fmtDate(to);

  return (
    <div className="date-range">
      <div className="date-range-row">
        <span className="date-range-label">{label}</span>
        <input
          type="date" className="form-input date-range-input" value={from} max={to || undefined}
          onChange={(e) => onChange({ from: e.target.value, to })} aria-label="From date"
        />
        <span className="date-range-sep">→</span>
        <input
          type="date" className="form-input date-range-input" value={to} min={from || undefined}
          onChange={(e) => onChange({ from, to: e.target.value })} aria-label="To date"
        />
        {PRESETS.map((p) => (
          <button
            key={p.key} type="button"
            className={'date-range-preset' + (matchingPreset && matchingPreset.key === p.key ? ' active' : '')}
            onClick={() => onChange(p.range())}
          >
            {p.label}
          </button>
        ))}
        {active && (
          <button type="button" className="date-range-preset clear" onClick={() => onChange({ from: '', to: '' })}>
            ✕ Clear
          </button>
        )}
      </div>
      <div className="date-range-summary">
        {summary}
        {count !== undefined && <> · <strong>{count}</strong> {noun}</>}
      </div>
    </div>
  );
}
