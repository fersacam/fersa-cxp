import React, { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../store/auth';
import { suppliersRepo } from '../db/repositories/suppliers';
import { paymentMethodsRepo } from '../db/repositories/paymentMethods';
import { bankAccountsRepo } from '../db/repositories/bankAccounts';
import { invoicesRepo } from '../db/repositories/invoices';
import { paymentsRepo } from '../db/repositories/payments';
import { auditRepo } from '../db/repositories/auditLogs';
import { formatCurrency, formatDate } from '../utils/formatters';
import type { Invoice, PaymentMethod, BankAccount, SupplierWithStats } from '../types/db';
import { CreditCard } from 'lucide-react';

const BANK_METHOD_RE = /transferencia|cheque|deposito|depósito/;

export const Abonos: React.FC = () => {
  const { profile } = useAuthStore();
  const role = profile?.role ?? 'viewer';
  const canWrite = role === 'admin' || role === 'operador';

  const [proveedores, setProveedores] = useState<SupplierWithStats[]>([]);
  const [searchProv, setSearchProv] = useState('');
  const [showProvDropdown, setShowProvDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [selectedSupplier, setSelectedSupplier] = useState<SupplierWithStats | null>(null);
  const [pendingInvoices, setPendingInvoices] = useState<Invoice[]>([]);

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [abonoData, setAbonoData] = useState({
    payment_method_id: '', bank_account_id: '', reference: '',
    payment_date: new Date().toISOString().split('T')[0],
  });

  const [allocations, setAllocations] = useState<Record<number, string>>({});
  const [totalToPay, setTotalToPay] = useState<string>('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setProveedores(await suppliersRepo.list());
        setPaymentMethods(await paymentMethodsRepo.list());
        setBankAccounts(await bankAccountsRepo.list());
      } catch (e) { console.error(e); }
    })();

    const handle = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowProvDropdown(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const selectProveedor = async (p: SupplierWithStats) => {
    setSelectedSupplier(p);
    setShowProvDropdown(false);
    setSearchProv('');
    await loadPendingInvoices(p.id);
  };

  const loadPendingInvoices = async (supplierId: number) => {
    try {
      setPendingInvoices(await invoicesRepo.listBySupplier(supplierId, true));
      setAllocations({});
      setTotalToPay('');
    } catch (e: any) {
      alert(`Error: ${e?.message ?? e}`);
    }
  };

  const filteredProvs = proveedores.filter(p =>
    p.name.toLowerCase().includes(searchProv.toLowerCase()) ||
    (p.supplier_code || '').toLowerCase().includes(searchProv.toLowerCase())
  );

  const handleAllocationChange = (invoiceId: number, val: string) => {
    const newAlloc = { ...allocations, [invoiceId]: val };
    setAllocations(newAlloc);
    const sum = Object.values(newAlloc).reduce((acc, curr) => acc + (parseFloat(curr.replace(/,/g, '')) || 0), 0);
    setTotalToPay(sum > 0 ? sum.toString() : '');
  };

  const autoDistribute = () => {
    const total = parseFloat(totalToPay.replace(/,/g, ''));
    if (isNaN(total) || total <= 0) return;

    let remaining = total;
    const newAlloc: Record<number, string> = {};
    for (const inv of pendingInvoices) {
      if (remaining <= 0) break;
      if (remaining >= inv.balance) {
        newAlloc[inv.id] = inv.balance.toString();
        remaining -= inv.balance;
      } else {
        newAlloc[inv.id] = remaining.toString();
        remaining = 0;
      }
    }
    setAllocations(newAlloc);
  };

  const selectedMethod = paymentMethods.find(m => String(m.id) === abonoData.payment_method_id);
  const isBankMethod = selectedMethod ? BANK_METHOD_RE.test(selectedMethod.name.toLowerCase()) : false;

  const handleAbonar = async () => {
    if (!selectedSupplier) return;
    if (!abonoData.payment_method_id) { alert('Debe seleccionar un método de pago.'); return; }
    if (isBankMethod && !abonoData.bank_account_id) {
      alert('Debe seleccionar una cuenta bancaria para este método de pago.'); return;
    }

    let totalPaid = 0;
    const toProcess: Array<{ inv: Invoice; amt: number }> = [];

    for (const inv of pendingInvoices) {
      const amtStr = allocations[inv.id];
      if (!amtStr) continue;
      const amt = parseFloat(amtStr.replace(/,/g, ''));
      if (!isNaN(amt) && amt > 0) {
        if (amt > inv.balance) {
          alert(`El monto asignado a la factura ${inv.invoice_number} supera su saldo.`);
          return;
        }
        totalPaid += amt;
        toProcess.push({ inv, amt });
      }
    }

    if (toProcess.length === 0) {
      alert('Debe asignar montos a las facturas antes de aplicar.');
      return;
    }

    setProcessing(true);
    try {
      for (const { inv, amt } of toProcess) {
        await paymentsRepo.create({
          invoice_id: inv.id,
          amount: amt,
          payment_method_id: Number(abonoData.payment_method_id),
          bank_account_id: isBankMethod && abonoData.bank_account_id ? Number(abonoData.bank_account_id) : null,
          reference: abonoData.reference || null,
          payment_date: abonoData.payment_date,
        });
      }
      auditRepo.log('PAYMENT', 'Abonos', `Pago múltiple a ${selectedSupplier.name} por ${formatCurrency(totalPaid)}`);
      alert('Abonos procesados exitosamente.');
      await loadPendingInvoices(selectedSupplier.id);
    } catch (e: any) {
      alert(`Error procesando abonos: ${e?.message ?? e}`);
    } finally {
      setProcessing(false);
    }
  };

  const totalSupplierBalance = pendingInvoices.reduce((sum, inv) => sum + inv.balance, 0);
  const allocatedSum = Object.values(allocations).reduce((acc, curr) => acc + (parseFloat(curr.replace(/,/g, '')) || 0), 0);

  return (
    <div>
      <div className="topbar">
        <h1 className="page-title">Abonos</h1>
      </div>

      <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
        <div className="glass-panel" style={{ padding: '1.5rem', width: '380px', flexShrink: 0, position: 'relative' }}>
          <h3 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>1. Seleccionar Proveedor</h3>
          <div className="form-group" ref={dropdownRef}>
            <input className="glass-input" placeholder="Buscar proveedor..." value={searchProv}
              onChange={e => { setSearchProv(e.target.value); setShowProvDropdown(true); }}
              onClick={() => setShowProvDropdown(true)} />
            {showProvDropdown && (
              <div style={{ position: 'absolute', top: '90px', left: '1.5rem', right: '1.5rem', background: 'var(--bg-card, #1e293b)', border: '1px solid var(--border-color)', borderRadius: '8px', zIndex: 50, maxHeight: '200px', overflow: 'auto', boxShadow: 'var(--glass-shadow)' }}>
                {filteredProvs.map(p => (
                  <div key={p.id} onClick={() => selectProveedor(p)} style={{ padding: '0.5rem 1rem', cursor: 'pointer', borderBottom: '1px solid var(--border-color)', color: 'var(--text-primary)', background: 'transparent' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg, rgba(255,255,255,0.05))')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <strong style={{ color: 'var(--accent-color)' }}>[{p.supplier_code || p.id}]</strong> {p.name}
                  </div>
                ))}
                {filteredProvs.length === 0 && <div style={{ padding: '0.75rem', textAlign: 'center' }} className="text-muted">Sin resultados</div>}
              </div>
            )}
          </div>

          {selectedSupplier && (
            <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(59,130,246,0.1)', borderRadius: '8px', border: '1px solid rgba(59,130,246,0.2)' }}>
              <div className="text-muted" style={{ fontSize: '0.85rem' }}>Proveedor Seleccionado:</div>
              <h4 style={{ margin: '0.25rem 0', color: 'var(--text-primary)' }}>[{selectedSupplier.supplier_code}] {selectedSupplier.name}</h4>
              <div className="text-muted" style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>Deuda Total Pendiente:</div>
              <h2 style={{ margin: 0, color: '#ef4444' }}>{formatCurrency(totalSupplierBalance)}</h2>
            </div>
          )}

          {selectedSupplier && pendingInvoices.length > 0 && (
            <>
              <h3 style={{ marginTop: '2rem', marginBottom: '1rem', color: 'var(--text-primary)' }}>2. Detalles del Pago</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="form-group">
                  <label>Método de Pago *</label>
                  <select className="glass-input" required value={abonoData.payment_method_id}
                    onChange={e => setAbonoData({ ...abonoData, payment_method_id: e.target.value, bank_account_id: '' })}>
                    <option value="">Seleccione...</option>
                    {paymentMethods.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>

                {isBankMethod && (
                  <div className="form-group">
                    <label>Cuenta Bancaria *</label>
                    <select className="glass-input" required value={abonoData.bank_account_id} onChange={e => setAbonoData({ ...abonoData, bank_account_id: e.target.value })}>
                      <option value="">Seleccione cuenta...</option>
                      {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.bank_name} - {b.account_number} ({b.currency})</option>)}
                    </select>
                  </div>
                )}

                <div className="form-group"><label>Referencia</label><input className="glass-input" value={abonoData.reference} onChange={e => setAbonoData({ ...abonoData, reference: e.target.value })} /></div>
                <div className="form-group"><label>Fecha de Pago *</label><input type="date" className="glass-input" required value={abonoData.payment_date} onChange={e => setAbonoData({ ...abonoData, payment_date: e.target.value })} /></div>
              </div>
            </>
          )}
        </div>

        {selectedSupplier && (
          <div className="glass-panel" style={{ flex: 1, padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>3. Asignación de Facturas</h3>

            {pendingInvoices.length === 0 ? (
              <p className="text-muted" style={{ textAlign: 'center', padding: '2rem 0' }}>
                El proveedor seleccionado no tiene facturas con saldo pendiente.
              </p>
            ) : (
              <>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', marginBottom: '1.5rem', padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Monto a Distribuir (Opcional)</label>
                    <input className="glass-input" placeholder="0.00" value={totalToPay} onChange={e => setTotalToPay(e.target.value)} disabled={!canWrite} />
                  </div>
                  {canWrite && <button className="btn-secondary" onClick={autoDistribute}>Distribuir en más antiguas</button>}
                </div>

                <div className="glass-table-container" style={{ margin: 0 }}>
                  <table className="glass-table">
                    <thead>
                      <tr>
                        <th>Nº Factura</th>
                        <th>Vencimiento</th>
                        <th>Saldo Pendiente</th>
                        <th style={{ width: '180px' }}>Abonar (C$)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingInvoices.map(inv => (
                        <tr key={inv.id}>
                          <td><strong>{inv.invoice_number}</strong></td>
                          <td>{formatDate(inv.due_date)}</td>
                          <td style={{ color: '#ef4444' }}>{formatCurrency(inv.balance)}</td>
                          <td>
                            <input className="glass-input" style={{ padding: '0.4rem', fontSize: '0.9rem' }}
                              placeholder="0.00"
                              value={allocations[inv.id] || ''}
                              onChange={e => handleAllocationChange(inv.id, e.target.value)}
                              disabled={!canWrite} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={2} style={{ textAlign: 'right', fontWeight: 'bold' }}>Total a Abonar:</td>
                        <td colSpan={2} style={{ color: '#10b981', fontWeight: 'bold', fontSize: '1.1rem' }}>{formatCurrency(allocatedSum)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
                  {canWrite ? (
                    <button className="btn-primary" onClick={handleAbonar} disabled={processing} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '1rem 2rem' }}>
                      <CreditCard size={20} />
                      {processing ? 'Procesando...' : `Procesar Abono de ${formatCurrency(allocatedSum)}`}
                    </button>
                  ) : (
                    <p className="text-muted">Los usuarios de solo lectura no pueden procesar pagos.</p>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
