import React, { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../store/auth';
import { invoicesRepo } from '../db/repositories/invoices';
import { suppliersRepo } from '../db/repositories/suppliers';
import { paymentMethodsRepo } from '../db/repositories/paymentMethods';
import { bankAccountsRepo } from '../db/repositories/bankAccounts';
import { paymentsRepo, type PaymentRow } from '../db/repositories/payments';
import { auditRepo } from '../db/repositories/auditLogs';
import { formatCurrency, formatDate, daysFromToday } from '../utils/formatters';
import { generatePDF } from '../utils/pdfExport';
import type { InvoiceStatus, InvoiceWithSupplier, PaymentMethod, BankAccount, SupplierWithStats } from '../types/db';
import { Plus, X, Search, FileDown, CreditCard, Eye, Edit, Trash2 } from 'lucide-react';
import { useToast } from '../components/Toast';

const BANK_METHOD_RE = /transferencia|cheque|deposito|depósito/;

export const Facturas: React.FC = () => {
  const { profile } = useAuthStore();
  const role = profile?.role ?? 'viewer';
  const canWrite = role === 'admin' || role === 'operador';
  const canDelete = role === 'admin';
  const toast = useToast();

  const [facturas, setFacturas] = useState<InvoiceWithSupplier[]>([]);
  const [proveedores, setProveedores] = useState<SupplierWithStats[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showAbonoModal, setShowAbonoModal] = useState(false);
  const [showHistModal, setShowHistModal] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState<number | null>(null);
  const [editPaymentForm, setEditPaymentForm] = useState({
    amount: '', payment_method_id: '', bank_account_id: '', reference: '', payment_date: '',
  });
  const [selectedFactura, setSelectedFactura] = useState<InvoiceWithSupplier | null>(null);
  const [abonoHistory, setAbonoHistory] = useState<PaymentRow[]>([]);
  const [searchProv, setSearchProv] = useState('');
  const [showProvDropdown, setShowProvDropdown] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'' | InvoiceStatus>('');
  const [searchInvoice, setSearchInvoice] = useState('');
  const [filterDue, setFilterDue] = useState<'all' | 'vencidas' | 'proximas'>('all');
  const [filterBalance, setFilterBalance] = useState<'all' | 'pendiente' | 'pagada'>('all');
  const [groupByProv, setGroupByProv] = useState(false);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState({
    invoice_number: '', supplier_id: '', supplier_display: '', total: '', issue_date: '', due_date: '', comment: '',
  });
  const [abonoData, setAbonoData] = useState({
    amount: '', payment_method_id: '', bank_account_id: '', reference: '',
    payment_date: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    loadFacturas();
    loadProveedores();
    loadPaymentMethods();
    loadBankAccounts();
  }, [filterStatus]);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowProvDropdown(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const loadFacturas = async () => {
    setLoading(true);
    try {
      setFacturas(await invoicesRepo.list(filterStatus ? { status: filterStatus } : {}));
    } catch (e: any) {
      alert(`Error cargando facturas: ${e?.message ?? e}`);
    } finally {
      setLoading(false);
    }
  };

  const loadProveedores = async () => {
    try { setProveedores(await suppliersRepo.list()); } catch (e) { console.error(e); }
  };
  const loadPaymentMethods = async () => {
    try { setPaymentMethods(await paymentMethodsRepo.list()); } catch (e) { console.error(e); }
  };
  const loadBankAccounts = async () => {
    try { setBankAccounts(await bankAccountsRepo.list()); } catch (e) { console.error(e); }
  };

  const filteredProvs = proveedores.filter(p =>
    p.name.toLowerCase().includes(searchProv.toLowerCase()) ||
    (p.supplier_code || '').toLowerCase().includes(searchProv.toLowerCase())
  );

  const selectProveedor = (p: SupplierWithStats) => {
    setFormData({ ...formData, supplier_id: String(p.id), supplier_display: `[${p.supplier_code || p.id}] ${p.name}` });
    setShowProvDropdown(false);
    setSearchProv('');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.invoice_number || !formData.supplier_id || !formData.total) return;
    const totalNum = parseFloat(formData.total.replace(/,/g, ''));
    if (isNaN(totalNum) || totalNum <= 0) { alert('Monto inválido'); return; }
    try {
      await invoicesRepo.create({
        invoice_number: formData.invoice_number,
        supplier_id: Number(formData.supplier_id),
        total: totalNum,
        issue_date: formData.issue_date,
        due_date: formData.due_date,
        comment: formData.comment || null,
      });
      auditRepo.log('CREATE', 'Facturas', `Factura: ${formData.invoice_number} por ${formatCurrency(totalNum)}`);
      setShowModal(false);
      setFormData({ invoice_number: '', supplier_id: '', supplier_display: '', total: '', issue_date: '', due_date: '', comment: '' });
      await loadFacturas();
    } catch (e: any) {
      alert(`Error guardando factura: ${e?.message ?? e}`);
    }
  };

  const openAbono = (f: InvoiceWithSupplier) => {
    setSelectedFactura(f);
    setAbonoData({
      amount: '',
      payment_method_id: paymentMethods[0]?.id ? String(paymentMethods[0].id) : '',
      bank_account_id: '',
      reference: '',
      payment_date: new Date().toISOString().split('T')[0],
    });
    setShowAbonoModal(true);
  };

  const openHistory = async (f: InvoiceWithSupplier) => {
    setSelectedFactura(f);
    try {
      setAbonoHistory(await paymentsRepo.listByInvoice(f.id));
      setShowHistModal(true);
    } catch (e: any) {
      toast.error('Error cargando historial', e?.message ?? String(e));
    }
  };

  const refreshHistoryAndInvoices = async (invoiceId: number) => {
    const [history] = await Promise.all([
      paymentsRepo.listByInvoice(invoiceId),
      loadFacturas(),
    ]);
    setAbonoHistory(history);
    // Refrescar el saldo/estado visible en el modal de historial
    const updated = (await invoicesRepo.list({ supplier_id: selectedFactura?.supplier_id })).find(i => i.id === invoiceId);
    if (updated) setSelectedFactura(updated);
  };

  const startEditPayment = (p: PaymentRow) => {
    setEditingPaymentId(p.id);
    setEditPaymentForm({
      amount: String(p.amount),
      payment_method_id: p.payment_method_id ? String(p.payment_method_id) : '',
      bank_account_id: p.bank_account_id ? String(p.bank_account_id) : '',
      reference: p.reference || '',
      payment_date: p.payment_date,
    });
  };

  const cancelEditPayment = () => {
    setEditingPaymentId(null);
  };

  const editMethodIsBank = (() => {
    const m = paymentMethods.find(pm => String(pm.id) === editPaymentForm.payment_method_id);
    return m ? BANK_METHOD_RE.test(m.name.toLowerCase()) : false;
  })();

  const handleUpdatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingPaymentId == null || !selectedFactura) return;
    const amt = parseFloat(editPaymentForm.amount.replace(/,/g, ''));
    if (isNaN(amt) || amt <= 0) {
      toast.error('Monto inválido');
      return;
    }
    try {
      await paymentsRepo.update(editingPaymentId, {
        amount: amt,
        payment_method_id: editPaymentForm.payment_method_id ? Number(editPaymentForm.payment_method_id) : null,
        bank_account_id: editMethodIsBank && editPaymentForm.bank_account_id ? Number(editPaymentForm.bank_account_id) : null,
        reference: editPaymentForm.reference || null,
        payment_date: editPaymentForm.payment_date,
      });
      auditRepo.log('UPDATE', 'Facturas', `Abono #${editingPaymentId} editado en factura ${selectedFactura.invoice_number}`);
      toast.success('Abono actualizado');
      setEditingPaymentId(null);
      await refreshHistoryAndInvoices(selectedFactura.id);
    } catch (e: any) {
      toast.error('Error actualizando abono', e?.message ?? String(e));
    }
  };

  const handleDeletePayment = async (p: PaymentRow) => {
    if (!selectedFactura) return;
    if (!confirm(`¿Eliminar este abono de ${formatCurrency(p.amount)}?`)) return;
    try {
      await paymentsRepo.remove(p.id);
      auditRepo.log('DELETE', 'Facturas', `Abono ${formatCurrency(p.amount)} eliminado de factura ${selectedFactura.invoice_number}`);
      toast.success('Abono eliminado');
      await refreshHistoryAndInvoices(selectedFactura.id);
    } catch (e: any) {
      toast.error('Error eliminando abono', e?.message ?? String(e));
    }
  };

  const handleAbono = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFactura || !abonoData.amount) return;
    const amount = parseFloat(abonoData.amount.replace(/,/g, ''));
    if (isNaN(amount) || amount <= 0 || amount > selectedFactura.balance) {
      alert(`El monto debe ser entre 0.01 y ${formatCurrency(selectedFactura.balance)}`);
      return;
    }
    const method = paymentMethods.find(m => String(m.id) === abonoData.payment_method_id);
    const isBank = !!method && BANK_METHOD_RE.test(method.name.toLowerCase());
    try {
      await paymentsRepo.create({
        invoice_id: selectedFactura.id,
        amount,
        payment_method_id: abonoData.payment_method_id ? Number(abonoData.payment_method_id) : null,
        bank_account_id: isBank && abonoData.bank_account_id ? Number(abonoData.bank_account_id) : null,
        reference: abonoData.reference || null,
        payment_date: abonoData.payment_date,
      });
      auditRepo.log('PAYMENT', 'Facturas', `Abono ${formatCurrency(amount)} a ${selectedFactura.invoice_number}`);
      setShowAbonoModal(false);
      await loadFacturas();
    } catch (e: any) {
      alert(`Error registrando abono: ${e?.message ?? e}`);
    }
  };

  const exportHistoryPDF = () => {
    if (!selectedFactura) return;
    generatePDF({
      title: `Historial de Abonos — ${selectedFactura.invoice_number}`,
      subtitle: `Proveedor: ${selectedFactura.supplier_name} | Total: ${formatCurrency(selectedFactura.total)} | Saldo: ${formatCurrency(selectedFactura.balance)}`,
      headers: ['Fecha', 'Monto', 'Método', 'Banco', 'Referencia'],
      rows: abonoHistory.map(a => [
        formatDate(a.payment_date),
        formatCurrency(a.amount),
        a.method_name || '-',
        a.bank_name ? `${a.bank_name} (${a.account_number})` : '-',
        a.reference || '-',
      ]),
      filename: `abonos_${selectedFactura.invoice_number}`,
    });
  };

  const today = new Date().toISOString().split('T')[0];
  const in7days = new Date(Date.now() + 7 * 86400 * 1000).toISOString().split('T')[0];

  const displayFacturas = facturas.filter(f => {
    if (searchInvoice && !f.invoice_number.toLowerCase().includes(searchInvoice.toLowerCase())) return false;
    if (filterDue === 'vencidas' && (f.due_date >= today || f.balance <= 0)) return false;
    if (filterDue === 'proximas' && (f.due_date < today || f.due_date > in7days)) return false;
    if (filterBalance === 'pendiente' && f.balance <= 0) return false;
    if (filterBalance === 'pagada' && f.balance > 0) return false;
    return true;
  });

  const grouped: Record<string, InvoiceWithSupplier[]> = {};
  if (groupByProv) {
    displayFacturas.forEach(f => {
      const key = f.supplier_name || '(sin proveedor)';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(f);
    });
  }

  const totalPages = Math.max(1, Math.ceil(displayFacturas.length / pageSize));
  const paginatedFacturas = displayFacturas.slice((page - 1) * pageSize, page * pageSize);

  const renderRow = (f: InvoiceWithSupplier) => {
    const diff = daysFromToday(f.due_date);
    const badgeClass = f.status === 'PAGADA' ? 'badge-success' : f.status === 'PARCIAL' ? 'badge-warning' : 'badge-danger';
    return (
      <tr key={f.id}>
        <td><strong>{f.invoice_number}</strong></td>
        <td style={{ color: 'var(--accent-color)' }}>{f.supplier_code || '-'}</td>
        <td>{f.supplier_name}</td>
        <td>{formatDate(f.issue_date)}</td>
        <td>{formatDate(f.due_date)} {diff < 0 && f.balance > 0 && <span className="badge badge-danger" style={{ marginLeft: '0.25rem', fontSize: '0.7rem' }}>Vencida</span>}</td>
        <td>{formatCurrency(f.total)}</td>
        <td style={{ color: f.balance > 0 ? '#ef4444' : '#10b981', fontWeight: 600 }}>{formatCurrency(f.balance)}</td>
        <td><span className={`badge ${badgeClass}`}>{f.status}</span></td>
        <td>
          <div style={{ display: 'flex', gap: '0.35rem' }}>
            {canWrite && f.balance > 0 && (
              <button onClick={() => openAbono(f)} className="btn-icon" title="Abonar"><CreditCard size={15} /></button>
            )}
            <button onClick={() => openHistory(f)} className="btn-icon" title="Historial"><Eye size={15} /></button>
          </div>
        </td>
      </tr>
    );
  };

  const selectedMethodIsBank = (() => {
    const m = paymentMethods.find(pm => String(pm.id) === abonoData.payment_method_id);
    return m ? BANK_METHOD_RE.test(m.name.toLowerCase()) : false;
  })();

  return (
    <div>
      <div className="topbar">
        <h1 className="page-title">Cuentas por Pagar</h1>
        {canWrite ? (
          <button className="btn-primary" onClick={() => setShowModal(true)}><Plus size={16} /> Registrar Factura</button>
        ) : (
          <span className="badge badge-warning" style={{ padding: '0.5rem 0.75rem' }}>
            Modo lectura ({role}) — no puedes crear ni editar
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', minWidth: '200px', flex: 1 }}>
          <Search size={15} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input className="glass-input" placeholder="Buscar por Nº factura..." value={searchInvoice}
            onChange={e => { setSearchInvoice(e.target.value); setPage(1); }} style={{ paddingLeft: '32px' }} />
        </div>
        <select className="glass-input" style={{ width: '160px' }} value={filterStatus} onChange={e => { setFilterStatus(e.target.value as InvoiceStatus | ''); setPage(1); }}>
          <option value="">Todos los estados</option>
          <option value="PENDIENTE">Pendiente</option>
          <option value="PARCIAL">Parcial</option>
          <option value="PAGADA">Pagada</option>
        </select>
        <select className="glass-input" style={{ width: '160px' }} value={filterDue} onChange={e => { setFilterDue(e.target.value as any); setPage(1); }}>
          <option value="all">Todos los venc.</option>
          <option value="vencidas">Vencidas</option>
          <option value="proximas">Próx. 7 días</option>
        </select>
        <select className="glass-input" style={{ width: '150px' }} value={filterBalance} onChange={e => { setFilterBalance(e.target.value as any); setPage(1); }}>
          <option value="all">Todos los saldos</option>
          <option value="pendiente">Con saldo</option>
          <option value="pagada">Saldadas</option>
        </select>
        <button onClick={() => { setGroupByProv(v => !v); setPage(1); }} className={groupByProv ? 'btn-primary' : 'btn-secondary'} style={{ whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
          Agrupar por proveedor
        </button>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <span className="text-muted" style={{ fontSize: '0.85rem' }}>Ver:</span>
          {[10, 20, 50].map(n => (
            <button key={n} onClick={() => { setPageSize(n); setPage(1); }} className={pageSize === n ? 'btn-primary' : 'btn-secondary'} style={{ padding: '0.3rem 0.6rem', fontSize: '0.85rem' }}>{n}</button>
          ))}
        </div>
        <span className="text-muted" style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>{displayFacturas.length} factura{displayFacturas.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="glass-panel glass-table-container">
        <table className="glass-table">
          <thead><tr><th>Factura</th><th># Prov.</th><th>Proveedor</th><th>Emisión</th><th>Vencimiento</th><th>Total</th><th>Saldo</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: '2rem' }}>Cargando...</td></tr>
            ) : displayFacturas.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: '2rem' }}>No hay facturas.</td></tr>
            ) : groupByProv ? (
              Object.entries(grouped).map(([provName, invs]) => (
                <React.Fragment key={provName}>
                  <tr style={{ background: 'rgba(59,130,246,0.1)' }}>
                    <td colSpan={9} style={{ fontWeight: 700, color: 'var(--accent-color)', padding: '0.5rem 1rem' }}>
                      📁 {provName} &nbsp;·&nbsp; {invs.length} factura{invs.length !== 1 ? 's' : ''} &nbsp;·&nbsp; Saldo: {formatCurrency(invs.reduce((s, f) => s + f.balance, 0))}
                    </td>
                  </tr>
                  {invs.map(renderRow)}
                </React.Fragment>
              ))
            ) : (
              paginatedFacturas.map(renderRow)
            )}
          </tbody>
        </table>
      </div>

      {!groupByProv && totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', marginTop: '1rem' }}>
          <button className="btn-secondary" style={{ padding: '0.3rem 0.75rem' }} disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹ Ant</button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
            <button key={n} onClick={() => setPage(n)} className={page === n ? 'btn-primary' : 'btn-secondary'} style={{ padding: '0.3rem 0.6rem', minWidth: '34px', fontSize: '0.85rem' }}>{n}</button>
          ))}
          <button className="btn-secondary" style={{ padding: '0.3rem 0.75rem' }} disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Sig ›</button>
        </div>
      )}

      {/* Modal Factura */}
      {showModal && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content" style={{ width: '540px' }}>
            <div className="modal-header"><h2>Registrar Factura</h2><button className="btn-icon" onClick={() => setShowModal(false)}><X size={20} /></button></div>
            <form onSubmit={handleSave} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group" style={{ gridColumn: '1 / -1', position: 'relative' }} ref={dropdownRef}>
                <label>Proveedor *</label>
                <input className="glass-input" required readOnly value={formData.supplier_display} placeholder="Buscar proveedor..." onClick={() => setShowProvDropdown(true)} style={{ cursor: 'pointer' }} />
                {showProvDropdown && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#1e293b', border: '1px solid var(--border-color)', borderRadius: '8px', zIndex: 50, maxHeight: '200px', overflow: 'auto' }}>
                    <div style={{ padding: '0.5rem' }}>
                      <input className="glass-input" autoFocus placeholder="Buscar..." value={searchProv} onChange={e => setSearchProv(e.target.value)} />
                    </div>
                    {filteredProvs.map(p => (
                      <div key={p.id} onClick={() => selectProveedor(p)} style={{ padding: '0.5rem 1rem', cursor: 'pointer', borderBottom: '1px solid var(--border-color)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <strong style={{ color: 'var(--accent-color)' }}>[{p.supplier_code || p.id}]</strong> {p.name}
                      </div>
                    ))}
                    {filteredProvs.length === 0 && <div style={{ padding: '0.75rem', textAlign: 'center' }} className="text-muted">Sin resultados</div>}
                  </div>
                )}
              </div>
              <div className="form-group"><label>Nº Factura *</label><input className="glass-input" required value={formData.invoice_number} onChange={e => setFormData({ ...formData, invoice_number: e.target.value })} /></div>
              <div className="form-group"><label>Monto Total (C$) *</label><input type="text" className="glass-input" required placeholder="0.00" value={formData.total} onChange={e => setFormData({ ...formData, total: e.target.value })} /></div>
              <div className="form-group"><label>Fecha Emisión *</label><input type="date" className="glass-input" required value={formData.issue_date} onChange={e => setFormData({ ...formData, issue_date: e.target.value })} /></div>
              <div className="form-group"><label>Fecha Vencimiento *</label><input type="date" className="glass-input" required value={formData.due_date} onChange={e => setFormData({ ...formData, due_date: e.target.value })} /></div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}><label>Comentario</label><input className="glass-input" value={formData.comment} onChange={e => setFormData({ ...formData, comment: e.target.value })} /></div>
              <div className="modal-actions" style={{ gridColumn: '1 / -1' }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancelar</button>
                <button type="submit" className="btn-primary">Guardar Factura</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Abono */}
      {showAbonoModal && selectedFactura && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content" style={{ width: '440px' }}>
            <div className="modal-header"><h2>Registrar Abono</h2><button className="btn-icon" onClick={() => setShowAbonoModal(false)}><X size={20} /></button></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
              <div><span className="text-muted">Factura:</span> <strong>{selectedFactura.invoice_number}</strong></div>
              <div><span className="text-muted">Saldo:</span> <strong style={{ color: '#ef4444' }}>{formatCurrency(selectedFactura.balance)}</strong></div>
            </div>
            <form onSubmit={handleAbono} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group"><label>Monto a Abonar (C$) *</label><input type="text" className="glass-input" required placeholder="0.00" value={abonoData.amount} onChange={e => setAbonoData({ ...abonoData, amount: e.target.value })} /></div>
              <div className="form-group"><label>Método de Pago *</label>
                <select className="glass-input" required value={abonoData.payment_method_id}
                  onChange={e => setAbonoData({ ...abonoData, payment_method_id: e.target.value, bank_account_id: '' })}>
                  <option value="">Seleccione...</option>
                  {paymentMethods.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>

              {selectedMethodIsBank && (
                <div className="form-group"><label>Cuenta Bancaria *</label>
                  <select className="glass-input" required value={abonoData.bank_account_id} onChange={e => setAbonoData({ ...abonoData, bank_account_id: e.target.value })}>
                    <option value="">Seleccione cuenta...</option>
                    {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.bank_name} - {b.account_number} ({b.currency})</option>)}
                  </select>
                </div>
              )}

              <div className="form-group"><label>Referencia</label><input className="glass-input" value={abonoData.reference} onChange={e => setAbonoData({ ...abonoData, reference: e.target.value })} /></div>
              <div className="form-group"><label>Fecha de Pago *</label><input type="date" className="glass-input" required value={abonoData.payment_date} onChange={e => setAbonoData({ ...abonoData, payment_date: e.target.value })} /></div>
              <div className="modal-actions">
                <button type="button" onClick={() => setShowAbonoModal(false)} className="btn-secondary">Cancelar</button>
                <button type="submit" className="btn-primary">Aplicar Abono</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Historial */}
      {showHistModal && selectedFactura && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content" style={{ width: '650px' }}>
            <div className="modal-header">
              <h2>Historial de Abonos — {selectedFactura.invoice_number}</h2>
              <button className="btn-icon" onClick={() => setShowHistModal(false)}><X size={20} /></button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <span className="text-muted">Total: <strong>{formatCurrency(selectedFactura.total)}</strong></span>
              <span className="text-muted">Saldo: <strong style={{ color: '#ef4444' }}>{formatCurrency(selectedFactura.balance)}</strong></span>
              <button className="btn-secondary" onClick={exportHistoryPDF}><FileDown size={14} /> PDF</button>
            </div>
            <table className="glass-table">
              <thead><tr><th>Fecha</th><th>Monto</th><th>Método</th><th>Banco</th><th>Referencia</th>{canWrite && <th>Acciones</th>}</tr></thead>
              <tbody>
                {abonoHistory.length === 0 ? (
                  <tr><td colSpan={canWrite ? 6 : 5} style={{ textAlign: 'center', padding: '1.5rem' }}>Sin abonos.</td></tr>
                ) : abonoHistory.map(a => (
                  <tr key={a.id}>
                    <td>{formatDate(a.payment_date)}</td>
                    <td style={{ color: '#10b981', fontWeight: 600 }}>{formatCurrency(a.amount)}</td>
                    <td>{a.method_name || '-'}</td>
                    <td>{a.bank_name ? `${a.bank_name} (${a.account_number})` : '-'}</td>
                    <td>{a.reference || '-'}</td>
                    {canWrite && (
                      <td>
                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                          <button onClick={() => startEditPayment(a)} className="btn-icon" title="Editar abono"><Edit size={15} /></button>
                          {canDelete && (
                            <button onClick={() => handleDeletePayment(a)} className="btn-icon btn-icon-danger" title="Eliminar abono"><Trash2 size={15} /></button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Editar Abono */}
      {editingPaymentId != null && selectedFactura && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content" style={{ width: '440px' }}>
            <div className="modal-header">
              <h2>Editar Abono</h2>
              <button className="btn-icon" onClick={cancelEditPayment}><X size={20} /></button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
              <div><span className="text-muted">Factura:</span> <strong>{selectedFactura.invoice_number}</strong></div>
              <div><span className="text-muted">Total:</span> <strong>{formatCurrency(selectedFactura.total)}</strong></div>
            </div>
            <form onSubmit={handleUpdatePayment} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group"><label>Monto (C$) *</label>
                <input type="text" className="glass-input" required value={editPaymentForm.amount}
                  onChange={e => setEditPaymentForm({ ...editPaymentForm, amount: e.target.value })} />
              </div>
              <div className="form-group"><label>Método de Pago *</label>
                <select className="glass-input" required value={editPaymentForm.payment_method_id}
                  onChange={e => setEditPaymentForm({ ...editPaymentForm, payment_method_id: e.target.value, bank_account_id: '' })}>
                  <option value="">Seleccione...</option>
                  {paymentMethods.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              {editMethodIsBank && (
                <div className="form-group"><label>Cuenta Bancaria *</label>
                  <select className="glass-input" required value={editPaymentForm.bank_account_id}
                    onChange={e => setEditPaymentForm({ ...editPaymentForm, bank_account_id: e.target.value })}>
                    <option value="">Seleccione cuenta...</option>
                    {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.bank_name} - {b.account_number} ({b.currency})</option>)}
                  </select>
                </div>
              )}
              <div className="form-group"><label>Referencia</label>
                <input className="glass-input" value={editPaymentForm.reference}
                  onChange={e => setEditPaymentForm({ ...editPaymentForm, reference: e.target.value })} />
              </div>
              <div className="form-group"><label>Fecha de Pago *</label>
                <input type="date" className="glass-input" required value={editPaymentForm.payment_date}
                  onChange={e => setEditPaymentForm({ ...editPaymentForm, payment_date: e.target.value })} />
              </div>
              <div className="modal-actions">
                <button type="button" onClick={cancelEditPayment} className="btn-secondary">Cancelar</button>
                <button type="submit" className="btn-primary">Guardar cambios</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
