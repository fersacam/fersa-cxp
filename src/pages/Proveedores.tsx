import React, { useEffect, useState } from 'react';
import { suppliersRepo } from '../db/repositories/suppliers';
import { supplierTypesRepo } from '../db/repositories/supplierTypes';
import { auditRepo } from '../db/repositories/auditLogs';
import { useAuthStore } from '../store/auth';
import { formatCurrency } from '../utils/formatters';
import type { SupplierType, SupplierWithStats } from '../types/db';
import { Plus, Trash2, Edit, X, Search, ArrowUpDown } from 'lucide-react';

type SortCol = 'id' | 'name' | 'deuda' | 'tipo';

export const Proveedores: React.FC = () => {
  const { profile } = useAuthStore();
  const role = profile?.role ?? 'viewer';
  const canWrite = role === 'admin' || role === 'operador';
  const canDelete = role === 'admin';

  const [proveedores, setProveedores] = useState<SupplierWithStats[]>([]);
  const [types, setTypes] = useState<SupplierType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [nextCode, setNextCode] = useState('');
  const [formData, setFormData] = useState({ name: '', document_id: '', contact: '', supplier_type_id: '' });
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortCol>('id');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { load(); loadTypes(); }, []);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await suppliersRepo.list();
      setProveedores(data);
      setPage(1);
    } catch (e: any) {
      setError(e?.message ?? 'Error cargando proveedores');
    } finally {
      setLoading(false);
    }
  };

  const loadTypes = async () => {
    try { setTypes(await supplierTypesRepo.list()); } catch (e) { console.error(e); }
  };

  const openNew = async () => {
    setEditId(null);
    setFormData({ name: '', document_id: '', contact: '', supplier_type_id: '' });
    try { setNextCode(await suppliersRepo.nextCode()); } catch {}
    setShowModal(true);
  };

  const openEdit = (p: SupplierWithStats) => {
    setEditId(p.id);
    setFormData({
      name: p.name,
      document_id: p.document_id || '',
      contact: p.contact || '',
      supplier_type_id: p.supplier_type_id ? String(p.supplier_type_id) : '',
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;
    try {
      if (editId) {
        await suppliersRepo.update(editId, {
          name: formData.name,
          document_id: formData.document_id || null,
          contact: formData.contact || null,
          supplier_type_id: formData.supplier_type_id ? Number(formData.supplier_type_id) : null,
        });
        auditRepo.log('UPDATE', 'Proveedores', `Actualizado: ${formData.name}`);
      } else {
        const code = await suppliersRepo.nextCode();
        await suppliersRepo.create({
          supplier_code: code,
          name: formData.name,
          document_id: formData.document_id || null,
          contact: formData.contact || null,
          supplier_type_id: formData.supplier_type_id ? Number(formData.supplier_type_id) : null,
        });
        auditRepo.log('CREATE', 'Proveedores', `Creado: ${code} - ${formData.name}`);
      }
      setShowModal(false);
      await load();
    } catch (e: any) {
      alert(`Error guardando proveedor: ${e?.message ?? e}`);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`¿Eliminar al proveedor ${name}?`)) return;
    try {
      await suppliersRepo.remove(id);
      auditRepo.log('DELETE', 'Proveedores', `Eliminado: ${name}`);
      await load();
    } catch (e: any) {
      alert(`No se puede eliminar: ${e?.message ?? 'tiene facturas asociadas.'}`);
    }
  };

  const handleAddType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTypeName.trim()) return;
    try {
      await supplierTypesRepo.create(newTypeName);
      setNewTypeName('');
      await loadTypes();
    } catch (e: any) {
      alert(`Error: ${e?.message ?? 'el tipo ya existe.'}`);
    }
  };

  const handleDeleteType = async (id: number) => {
    if (!confirm('¿Eliminar este tipo?')) return;
    try {
      await supplierTypesRepo.remove(id);
      await loadTypes();
    } catch (e: any) {
      alert(`No se puede eliminar: ${e?.message ?? 'está en uso.'}`);
    }
  };

  const toggleSort = (col: SortCol) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('asc'); }
    setPage(1);
  };

  const filtered = proveedores.filter(p => {
    const q = search.toLowerCase();
    return !q || (p.supplier_code || '').toLowerCase().includes(q) || (p.name || '').toLowerCase().includes(q);
  });

  const sorted = [...filtered].sort((a, b) => {
    let va: any, vb: any;
    if (sortBy === 'id') { va = a.id; vb = b.id; }
    else if (sortBy === 'name') { va = a.name.toLowerCase(); vb = b.name.toLowerCase(); }
    else if (sortBy === 'deuda') { va = a.total_deuda; vb = b.total_deuda; }
    else { va = (a.type_name || '').toLowerCase(); vb = (b.type_name || '').toLowerCase(); }
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

  const SCol = ({ col, label }: { col: SortCol; label: string }) => (
    <th onClick={() => toggleSort(col)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
        {label} <ArrowUpDown size={13} style={{ opacity: sortBy === col ? 1 : 0.35, color: sortBy === col ? 'var(--accent-color)' : 'inherit' }} />
      </span>
    </th>
  );

  return (
    <div>
      <div className="topbar">
        <h1 className="page-title">Directorio de Proveedores</h1>
        {canWrite ? (
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="btn-secondary" onClick={() => setShowTypeModal(true)}>Tipos de Proveedor</button>
            <button className="btn-primary" onClick={openNew}><Plus size={16} /> Nuevo Proveedor</button>
          </div>
        ) : (
          <span className="badge badge-warning" style={{ padding: '0.5rem 0.75rem' }}>
            Modo lectura ({role}) — no puedes crear ni editar
          </span>
        )}
      </div>

      {error && (
        <div className="badge badge-danger" style={{ padding: '0.75rem', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
          <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input className="glass-input" placeholder="Buscar por código o nombre..." value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }} style={{ paddingLeft: '34px' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="text-muted" style={{ fontSize: '0.85rem' }}>Mostrar:</span>
          {[10, 20, 50].map(n => (
            <button key={n} onClick={() => { setPageSize(n); setPage(1); }}
              className={pageSize === n ? 'btn-primary' : 'btn-secondary'}
              style={{ padding: '0.3rem 0.7rem', fontSize: '0.85rem' }}>{n}</button>
          ))}
        </div>
        <span className="text-muted" style={{ fontSize: '0.85rem' }}>{filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="glass-panel glass-table-container">
        <table className="glass-table">
          <thead><tr>
            <SCol col="id" label="# Código" />
            <SCol col="name" label="Nombre" />
            <SCol col="tipo" label="Tipo" />
            <th>RUC/Cédula</th>
            <th>Contacto</th>
            <th>Facturas</th>
            <SCol col="deuda" label="Deuda Actual" />
            <th>Acciones</th>
          </tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>Cargando...</td></tr>
            ) : paginated.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>No hay proveedores.</td></tr>
            ) : paginated.map(p => (
              <tr key={p.id}>
                <td><strong style={{ color: 'var(--accent-color)' }}>{p.supplier_code || `PROV-${String(p.id).padStart(4, '0')}`}</strong></td>
                <td><strong>{p.name}</strong></td>
                <td><span className="badge badge-info">{p.type_name || '-'}</span></td>
                <td>{p.document_id || '-'}</td>
                <td>{p.contact || '-'}</td>
                <td>{p.inv_count || 0}</td>
                <td style={{ color: p.total_deuda > 0 ? '#ef4444' : '#10b981', fontWeight: 600 }}>{formatCurrency(p.total_deuda)}</td>
                <td>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {canWrite ? (
                      <>
                        <button onClick={() => openEdit(p)} className="btn-icon" title="Editar"><Edit size={16} /></button>
                        {canDelete && (
                          <button onClick={() => handleDelete(p.id, p.name)} className="btn-icon btn-icon-danger" title="Eliminar"><Trash2 size={16} /></button>
                        )}
                      </>
                    ) : (
                      <span className="text-muted" style={{ fontSize: '0.8rem' }}>Solo lectura</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', marginTop: '1rem' }}>
          <button className="btn-secondary" style={{ padding: '0.3rem 0.75rem' }} disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹ Ant</button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
            <button key={n} onClick={() => setPage(n)} className={page === n ? 'btn-primary' : 'btn-secondary'} style={{ padding: '0.3rem 0.6rem', minWidth: '34px', fontSize: '0.85rem' }}>{n}</button>
          ))}
          <button className="btn-secondary" style={{ padding: '0.3rem 0.75rem' }} disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Sig ›</button>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content" style={{ width: '480px' }}>
            <div className="modal-header">
              <h2>{editId ? 'Editar Proveedor' : 'Nuevo Proveedor'}</h2>
              <button className="btn-icon" onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            {!editId && (
              <p className="text-muted" style={{ marginBottom: '1rem' }}>
                Código: <strong style={{ color: 'var(--accent-color)' }}>{nextCode}</strong>
              </p>
            )}
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label>Nombre del Proveedor *</label>
                <input className="glass-input" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Tipo de Proveedor</label>
                <select className="glass-input" value={formData.supplier_type_id} onChange={e => setFormData({ ...formData, supplier_type_id: e.target.value })}>
                  <option value="">Sin tipo</option>
                  {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>RUC / Cédula</label>
                <input className="glass-input" value={formData.document_id} onChange={e => setFormData({ ...formData, document_id: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Contacto</label>
                <input className="glass-input" value={formData.contact} onChange={e => setFormData({ ...formData, contact: e.target.value })} />
              </div>
              <div className="modal-actions">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancelar</button>
                <button type="submit" className="btn-primary">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showTypeModal && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content" style={{ width: '400px' }}>
            <div className="modal-header">
              <h2>Tipos de Proveedor</h2>
              <button className="btn-icon" onClick={() => setShowTypeModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleAddType} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <input className="glass-input" placeholder="Nuevo tipo..." value={newTypeName} onChange={e => setNewTypeName(e.target.value)} required />
              <button type="submit" className="btn-primary" style={{ whiteSpace: 'nowrap' }}>Agregar</button>
            </form>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {types.map(t => (
                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
                  <span>{t.name}</span>
                  {canDelete && (
                    <button onClick={() => handleDeleteType(t.id)} className="btn-icon btn-icon-danger"><Trash2 size={14} /></button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
