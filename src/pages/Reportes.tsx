import React, { useEffect, useMemo, useState } from 'react';
import { invoicesRepo } from '../db/repositories/invoices';
import { suppliersRepo } from '../db/repositories/suppliers';
import { paymentsRepo, type PaymentRow } from '../db/repositories/payments';
import { formatCurrency, formatDate, daysFromToday } from '../utils/formatters';
import { generatePDF } from '../utils/pdfExport';
import type { InvoiceWithSupplier, SupplierWithStats } from '../types/db';
import { FileDown, Filter } from 'lucide-react';

type Tab = 'aging' | 'upcoming' | 'supplier' | 'payments';

interface AgingRow {
  invoice_number: string;
  supplier_code: string | null;
  supplier: string | null;
  total: number;
  balance: number;
  issue_date: string;
  due_date: string;
  status: string;
  aging_days: number;
  bucket: string;
}

interface UpcomingRow {
  invoice_number: string;
  supplier_code: string | null;
  supplier: string | null;
  balance: number;
  due_date: string;
  status: string;
}

interface SupplierReportRow {
  supplier_code: string | null;
  name: string;
  type_name: string | null;
  total_invoices: number;
  total_facturado: number;
  saldo_pendiente: number;
  total_pagado: number;
}

export const Reportes: React.FC = () => {
  const [tab, setTab] = useState<Tab>('aging');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [suppFilter, setSuppFilter] = useState('');
  const [proveedores, setProveedores] = useState<SupplierWithStats[]>([]);
  const [loading, setLoading] = useState(false);

  const [invoices, setInvoices] = useState<InvoiceWithSupplier[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);

  useEffect(() => {
    (async () => {
      try { setProveedores(await suppliersRepo.list()); } catch (e) { console.error(e); }
    })();
  }, []);

  useEffect(() => {
    runReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, dateFrom, dateTo, suppFilter]);

  const runReport = async () => {
    setLoading(true);
    try {
      if (tab === 'payments') {
        const list = await paymentsRepo.list({
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
        });
        const filtered = suppFilter
          ? list.filter(p => p.supplier_code && proveedores.find(pv => String(pv.id) === suppFilter)?.supplier_code === p.supplier_code)
          : list;
        setPayments(filtered);
      } else {
        const filters: any = { has_balance: tab === 'aging' || tab === 'upcoming' ? true : undefined };
        if (suppFilter && tab !== 'supplier') filters.supplier_id = Number(suppFilter);
        if (tab === 'upcoming') {
          if (dateFrom) filters.due_from = dateFrom;
          if (dateTo) filters.due_to = dateTo;
        }
        setInvoices(await invoicesRepo.list(filters));
      }
    } catch (e: any) {
      alert(`Error: ${e?.message ?? e}`);
    } finally {
      setLoading(false);
    }
  };

  const agingRows = useMemo<AgingRow[]>(() => {
    if (tab !== 'aging') return [];
    return invoices.map(r => {
      const days = daysFromToday(r.due_date) * -1;
      let bucket = 'Corriente';
      if (days > 60) bucket = '> 60 días';
      else if (days > 30) bucket = '31-60 días';
      else if (days > 0) bucket = '1-30 días';
      return {
        invoice_number: r.invoice_number,
        supplier_code: r.supplier_code,
        supplier: r.supplier_name,
        total: r.total,
        balance: r.balance,
        issue_date: r.issue_date,
        due_date: r.due_date,
        status: r.status,
        aging_days: days < 0 ? 0 : days,
        bucket,
      };
    });
  }, [invoices, tab]);

  const upcomingRows = useMemo<UpcomingRow[]>(() => {
    if (tab !== 'upcoming') return [];
    return invoices.map(r => ({
      invoice_number: r.invoice_number,
      supplier_code: r.supplier_code,
      supplier: r.supplier_name,
      balance: r.balance,
      due_date: r.due_date,
      status: r.status,
    }));
  }, [invoices, tab]);

  const supplierRows = useMemo<SupplierReportRow[]>(() => {
    if (tab !== 'supplier') return [];
    const byId: Record<number, SupplierReportRow & { invoiceTotals: number; invoicePaid: number }> = {};
    proveedores.forEach(s => {
      byId[s.id] = {
        supplier_code: s.supplier_code,
        name: s.name,
        type_name: s.type_name,
        total_invoices: 0,
        total_facturado: 0,
        saldo_pendiente: 0,
        total_pagado: 0,
        invoiceTotals: 0,
        invoicePaid: 0,
      };
    });
    invoices.forEach(i => {
      const row = byId[i.supplier_id];
      if (!row) return;
      row.total_invoices += 1;
      row.total_facturado += i.total;
      row.saldo_pendiente += i.balance;
      if (i.status === 'PAGADA') row.invoicePaid += i.total;
    });
    return Object.values(byId)
      .map(({ invoiceTotals: _it, invoicePaid, ...rest }) => ({ ...rest, total_pagado: invoicePaid }))
      .sort((a, b) => b.saldo_pendiente - a.saldo_pendiente);
  }, [invoices, proveedores, tab]);

  // Cuando es 'supplier' necesitamos TODAS las facturas, no solo con balance
  useEffect(() => {
    if (tab === 'supplier') {
      (async () => {
        setLoading(true);
        try {
          setInvoices(await invoicesRepo.list());
        } catch (e: any) {
          alert(`Error: ${e?.message ?? e}`);
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [tab]);

  const totalSaldo = useMemo(() => {
    if (tab === 'aging') return agingRows.reduce((s, r) => s + r.balance, 0);
    if (tab === 'upcoming') return upcomingRows.reduce((s, r) => s + r.balance, 0);
    if (tab === 'supplier') return supplierRows.reduce((s, r) => s + r.saldo_pendiente, 0);
    if (tab === 'payments') return payments.reduce((s, r) => s + r.amount, 0);
    return 0;
  }, [tab, agingRows, upcomingRows, supplierRows, payments]);

  const rowCount = (
    tab === 'aging' ? agingRows.length :
    tab === 'upcoming' ? upcomingRows.length :
    tab === 'supplier' ? supplierRows.length :
    payments.length
  );

  const exportPDF = () => {
    const titles: Record<Tab, string> = {
      aging: 'Reporte de Antigüedad de Saldos',
      upcoming: 'Reporte de Vencimientos',
      supplier: 'Reporte por Proveedor',
      payments: 'Historial de Abonos',
    };
    const sub = [dateFrom && `Desde: ${dateFrom}`, dateTo && `Hasta: ${dateTo}`].filter(Boolean).join(' | ') || 'Todos los registros';

    let headers: string[] = [];
    let rows: any[] = [];
    let foot: any[] = [];

    if (tab === 'aging') {
      headers = ['Factura', '# Prov', 'Proveedor', 'Total', 'Saldo', 'Vencimiento', 'Días', 'Rango'];
      rows = agingRows.map(r => [r.invoice_number, r.supplier_code || '-', r.supplier, formatCurrency(r.total), formatCurrency(r.balance), formatDate(r.due_date), r.aging_days, r.bucket]);
      foot = [['', '', 'Sumatoria Total:', formatCurrency(agingRows.reduce((s, r) => s + r.total, 0)), formatCurrency(totalSaldo), '', '', '']];
    } else if (tab === 'upcoming') {
      headers = ['Factura', '# Prov', 'Proveedor', 'Saldo', 'Vencimiento', 'Estado'];
      rows = upcomingRows.map(r => [r.invoice_number, r.supplier_code || '-', r.supplier, formatCurrency(r.balance), formatDate(r.due_date), r.status]);
      foot = [['', '', 'Sumatoria Saldo Pendiente:', formatCurrency(totalSaldo), '', '']];
    } else if (tab === 'supplier') {
      headers = ['# Prov', 'Proveedor', 'Tipo', 'Facturas', 'Total Facturado', 'Pagado', 'Saldo'];
      rows = supplierRows.map(r => [r.supplier_code || '-', r.name, r.type_name || '-', r.total_invoices, formatCurrency(r.total_facturado), formatCurrency(r.total_pagado), formatCurrency(r.saldo_pendiente)]);
      foot = [['', '', '', 'Sumatoria Total:', formatCurrency(supplierRows.reduce((s, r) => s + r.total_facturado, 0)), formatCurrency(supplierRows.reduce((s, r) => s + r.total_pagado, 0)), formatCurrency(totalSaldo)]];
    } else if (tab === 'payments') {
      headers = ['Fecha', 'Monto', 'Método', 'Banco', 'Ref', 'Factura', 'Proveedor'];
      rows = payments.map(r => [formatDate(r.payment_date), formatCurrency(r.amount), r.method_name || '-', r.bank_name || '-', r.reference || '-', r.invoice_number, r.supplier_name]);
      foot = [['Suma de Abonos:', formatCurrency(totalSaldo), '', '', '', '', '']];
    }

    generatePDF({ title: titles[tab], subtitle: sub, headers, rows, foot, filename: `reporte_${tab}_${Date.now()}` });
  };

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'aging', label: 'Antigüedad de Saldos' },
    { id: 'upcoming', label: 'Vencimientos' },
    { id: 'supplier', label: 'Por Proveedor' },
    { id: 'payments', label: 'Historial Abonos' },
  ];

  return (
    <div>
      <div className="topbar">
        <h1 className="page-title">Centro de Reportes</h1>
        <button className="btn-primary" onClick={exportPDF}><FileDown size={16} /> Exportar PDF</button>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={tab === t.id ? 'btn-primary' : 'btn-secondary'}>{t.label}</button>
        ))}
      </div>

      <div className="glass-panel" style={{ padding: '1rem', marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Filter size={18} className="text-muted" />
        <div className="form-group" style={{ margin: 0 }}>
          <label style={{ fontSize: '0.8rem' }}>Desde</label>
          <input type="date" className="glass-input" style={{ width: '160px' }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label style={{ fontSize: '0.8rem' }}>Hasta</label>
          <input type="date" className="glass-input" style={{ width: '160px' }} value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
        {tab !== 'supplier' && (
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: '0.8rem' }}>Proveedor</label>
            <select className="glass-input" style={{ width: '220px' }} value={suppFilter} onChange={e => setSuppFilter(e.target.value)}>
              <option value="">Todos</option>
              {proveedores.map(p => <option key={p.id} value={p.id}>[{p.supplier_code || p.id}] {p.name}</option>)}
            </select>
          </div>
        )}
        <button className="btn-secondary" onClick={() => { setDateFrom(''); setDateTo(''); setSuppFilter(''); }}>Limpiar</button>
        <div style={{ marginLeft: 'auto' }}>
          <span className="text-muted">Registros: <strong>{rowCount}</strong></span>
          {totalSaldo > 0 && <span className="text-muted" style={{ marginLeft: '1rem' }}>Total: <strong style={{ color: '#ef4444' }}>{formatCurrency(totalSaldo)}</strong></span>}
        </div>
      </div>

      <div className="glass-panel glass-table-container">
        <table className="glass-table">
          {loading ? (
            <tbody><tr><td style={{ textAlign: 'center', padding: '2rem' }}>Cargando...</td></tr></tbody>
          ) : tab === 'aging' ? (
            <>
              <thead><tr><th>Factura</th><th># Prov</th><th>Proveedor</th><th>Total</th><th>Saldo</th><th>Vencimiento</th><th>Días Vencida</th><th>Rango</th></tr></thead>
              <tbody>{agingRows.length === 0 ? <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>Sin datos</td></tr> :
                agingRows.map((r, i) => (
                  <tr key={i}>
                    <td><strong>{r.invoice_number}</strong></td>
                    <td style={{ color: 'var(--accent-color)' }}>{r.supplier_code || '-'}</td>
                    <td>{r.supplier}</td>
                    <td>{formatCurrency(r.total)}</td>
                    <td style={{ color: '#ef4444', fontWeight: 600 }}>{formatCurrency(r.balance)}</td>
                    <td>{formatDate(r.due_date)}</td>
                    <td>{r.aging_days}</td>
                    <td><span className={`badge ${r.bucket === 'Corriente' ? 'badge-success' : r.bucket === '1-30 días' ? 'badge-warning' : 'badge-danger'}`}>{r.bucket}</span></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} style={{ textAlign: 'right', fontWeight: 'bold' }}>Sumatoria Total:</td>
                  <td style={{ fontWeight: 'bold' }}>{formatCurrency(agingRows.reduce((s, r) => s + r.total, 0))}</td>
                  <td style={{ color: '#ef4444', fontWeight: 'bold' }}>{formatCurrency(totalSaldo)}</td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </>
          ) : tab === 'upcoming' ? (
            <>
              <thead><tr><th>Factura</th><th># Prov</th><th>Proveedor</th><th>Saldo</th><th>Vencimiento</th><th>Días Restantes</th><th>Estado</th></tr></thead>
              <tbody>{upcomingRows.length === 0 ? <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>Sin datos</td></tr> :
                upcomingRows.map((r, i) => {
                  const diff = daysFromToday(r.due_date);
                  return (
                    <tr key={i}>
                      <td><strong>{r.invoice_number}</strong></td>
                      <td style={{ color: 'var(--accent-color)' }}>{r.supplier_code || '-'}</td>
                      <td>{r.supplier}</td>
                      <td style={{ color: '#ef4444', fontWeight: 600 }}>{formatCurrency(r.balance)}</td>
                      <td>{formatDate(r.due_date)}</td>
                      <td><span className={`badge ${diff < 0 ? 'badge-danger' : diff <= 7 ? 'badge-warning' : 'badge-success'}`}>{diff < 0 ? `Vencida ${Math.abs(diff)}d` : `${diff} días`}</span></td>
                      <td>{r.status}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} style={{ textAlign: 'right', fontWeight: 'bold' }}>Sumatoria Saldo Pendiente:</td>
                  <td style={{ color: '#ef4444', fontWeight: 'bold' }}>{formatCurrency(totalSaldo)}</td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </>
          ) : tab === 'supplier' ? (
            <>
              <thead><tr><th># Prov</th><th>Proveedor</th><th>Tipo</th><th>Facturas</th><th>Total Facturado</th><th>Total Pagado</th><th>Saldo Pendiente</th></tr></thead>
              <tbody>{supplierRows.length === 0 ? <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>Sin datos</td></tr> :
                supplierRows.map((r, i) => (
                  <tr key={i}>
                    <td style={{ color: 'var(--accent-color)' }}>{r.supplier_code || '-'}</td>
                    <td><strong>{r.name}</strong></td>
                    <td>{r.type_name || '-'}</td>
                    <td>{r.total_invoices}</td>
                    <td>{formatCurrency(r.total_facturado)}</td>
                    <td style={{ color: '#10b981' }}>{formatCurrency(r.total_pagado)}</td>
                    <td style={{ color: r.saldo_pendiente > 0 ? '#ef4444' : '#10b981', fontWeight: 600 }}>{formatCurrency(r.saldo_pendiente)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} style={{ textAlign: 'right', fontWeight: 'bold' }}>Sumatoria Total:</td>
                  <td style={{ fontWeight: 'bold' }}>{formatCurrency(supplierRows.reduce((s, r) => s + r.total_facturado, 0))}</td>
                  <td style={{ color: '#10b981', fontWeight: 'bold' }}>{formatCurrency(supplierRows.reduce((s, r) => s + r.total_pagado, 0))}</td>
                  <td style={{ color: '#ef4444', fontWeight: 'bold' }}>{formatCurrency(totalSaldo)}</td>
                </tr>
              </tfoot>
            </>
          ) : (
            <>
              <thead><tr><th>Fecha</th><th>Monto</th><th>Método</th><th>Banco</th><th>Referencia</th><th>Factura</th><th>Proveedor</th></tr></thead>
              <tbody>{payments.length === 0 ? <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>Sin datos</td></tr> :
                payments.map((r, i) => (
                  <tr key={i}>
                    <td>{formatDate(r.payment_date)}</td>
                    <td style={{ color: '#10b981', fontWeight: 600 }}>{formatCurrency(r.amount)}</td>
                    <td>{r.method_name || '-'}</td>
                    <td>{r.bank_name ? `${r.bank_name} (${r.account_number})` : '-'}</td>
                    <td>{r.reference || '-'}</td>
                    <td><strong>{r.invoice_number}</strong></td>
                    <td>{r.supplier_name}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ textAlign: 'right', fontWeight: 'bold' }}>Suma de Abonos:</td>
                  <td style={{ color: '#10b981', fontWeight: 'bold' }}>{formatCurrency(totalSaldo)}</td>
                  <td colSpan={5}></td>
                </tr>
              </tfoot>
            </>
          )}
        </table>
      </div>
    </div>
  );
};
