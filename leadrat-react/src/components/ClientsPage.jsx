import { useRef, useState } from 'react';
import { useApp } from '../AppContext';

export default function ClientsPage({ onAdd, onEdit, onDelete, onDownloadTemplate, onBulkFile }) {
  const { clients, invoices } = useApp();
  const [search, setSearch] = useState('');
  const fileRef = useRef(null);

  const s = search.toLowerCase();
  let list = clients;
  if (s) {
    list = list.filter((c) =>
      (c.name || '').toLowerCase().includes(s) ||
      (c.gstin || '').toLowerCase().includes(s) ||
      (c.city || '').toLowerCase().includes(s)
    );
  }

  return (
    <div className="page show">
      <div className="page-header">
        <div>
          <div className="page-title">Clients</div>
          <div className="page-subtitle">Manage your client database</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={onDownloadTemplate} title="Download Excel template for bulk client upload">📥 Download Template</button>
          <button className="btn btn-secondary" onClick={() => fileRef.current && fileRef.current.click()} title="Upload Excel file with multiple clients">📤 Bulk Upload</button>
          <input
            ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files && e.target.files[0];
              e.target.value = '';
              if (file) onBulkFile(file);
            }}
          />
          <button className="btn btn-primary" onClick={onAdd}>+ Add Client</button>
        </div>
      </div>

      <div className="filter-bar">
        <input type="text" className="form-input search-input" placeholder="Search clients by name, GSTIN, or city..."
          value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Client Name</th><th>GSTIN</th><th>City</th><th>Address</th><th>Invoices</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={6}>
                <div className="empty-state">
                  <div className="empty-state-icon">👥</div>
                  <div className="empty-state-title">No clients yet</div>
                  <div className="empty-state-text">Add your first client or use Bulk Upload to import many at once.</div>
                </div>
              </td></tr>
            ) : list.map((c) => {
              const count = invoices.filter((d) => d.clientId === c.id).length;
              const addr = c.address || '';
              return (
                <tr key={c.id}>
                  <td>
                    <strong>{c.name}</strong>
                    {c.legalName && c.legalName !== c.name && (
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{c.legalName}</div>
                    )}
                  </td>
                  <td style={{ fontSize: 12, fontFamily: 'monospace' }}>{c.gstin || '-'}</td>
                  <td style={{ fontSize: 12 }}>{c.city || '-'}</td>
                  <td style={{ fontSize: 12, color: 'var(--muted)', maxWidth: 280 }}>
                    {addr.substring(0, 80)}{addr.length > 80 ? '…' : ''}
                  </td>
                  <td>{count}</td>
                  <td>
                    <div className="actions-cell">
                      <button className="icon-btn edit" onClick={() => onEdit(c.id)} title="Edit">✏️</button>
                      <button className="icon-btn delete" onClick={() => onDelete(c.id)} title="Delete">🗑</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
