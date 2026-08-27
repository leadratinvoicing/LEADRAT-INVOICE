import { ACTION_LABELS, PERMISSION_MODULES } from '../constants';

export default function PermissionsGrid({ perms, onToggle }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      {PERMISSION_MODULES.map((mod, idx) => {
        const modPerm = perms[mod.key] || {};
        return (
          <div
            key={mod.key}
            style={{
              padding: 12,
              borderTop: idx > 0 ? '1px solid var(--border)' : undefined,
              background: idx % 2 === 0 ? '#FAFBFC' : '#fff'
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>{mod.label}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
              {mod.actions.map((act) => (
                <label key={act} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!modPerm[act]}
                    onChange={(e) => onToggle(mod.key, act, e.target.checked)}
                    style={{ accentColor: 'var(--brand)', width: 15, height: 15 }}
                  />
                  {ACTION_LABELS[act] || act}
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
