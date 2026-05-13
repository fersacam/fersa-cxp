import React, { useEffect, useMemo, useState } from 'react';
import { invoicesRepo } from '../db/repositories/invoices';
import { paymentsRepo, type PaymentRow } from '../db/repositories/payments';
import { suppliersRepo } from '../db/repositories/suppliers';
import { formatCurrency, daysFromToday, formatDate } from '../utils/formatters';
import type { InvoiceWithSupplier, SupplierWithStats } from '../types/db';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts';
import { AlertTriangle, TrendingDown, Users, FileText, DollarSign, Clock, CheckCircle } from 'lucide-react';

const COLORS = ['#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#10b981', '#06b6d4'];

function startOfMonthISO(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
}

function sixMonthsAgoISO(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  d.setDate(1);
  return d.toISOString().split('T')[0];
}

export const Dashboard: React.FC = () => {
  const [invoices, setInvoices] = useState<InvoiceWithSupplier[]>([]);
  const [paymentsRecent, setPaymentsRecent] = useState<PaymentRow[]>([]);
  const [paymentsLast6, setPaymentsLast6] = useState<PaymentRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [inv, recent, last6, sups] = await Promise.all([
          invoicesRepo.list(),
          paymentsRepo.listRecent(5),
          paymentsRepo.list({ date_from: sixMonthsAgoISO() }),
          suppliersRepo.list(),
        ]);
        setInvoices(inv);
        setPaymentsRecent(recent);
        setPaymentsLast6(last6);
        setSuppliers(sups);
      } catch (e: any) {
        setError(e?.message ?? 'Error cargando dashboard');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const stats = useMemo(() => {
    if (loading) return null;

    const today = new Date().toISOString().split('T')[0];
    const startMonth = startOfMonthISO();

    const totalDebt = invoices.reduce((s, i) => s + (i.balance > 0 ? i.balance : 0), 0);
    const paidThisMonth = paymentsLast6
      .filter(p => p.payment_date >= startMonth)
      .reduce((s, p) => s + p.amount, 0);

    const activeSuppliers = new Set(invoices.filter(i => i.balance > 0).map(i => i.supplier_id)).size;
    const pendingInvoices = invoices.filter(i => i.balance > 0).length;

    const overdue = invoices.filter(i => i.balance > 0 && i.due_date < today);
    const overdueCount = overdue.length;
    const overdueAmount = overdue.reduce((s, i) => s + i.balance, 0);

    const paidInvoices = invoices.filter(i => i.status === 'PAGADA').length;

    // Aging
    const aging = { current: 0, d30: 0, d60: 0, d90: 0 };
    invoices.filter(i => i.balance > 0).forEach(inv => {
      const overdueDays = daysFromToday(inv.due_date) * -1;
      if (overdueDays <= 0) aging.current += inv.balance;
      else if (overdueDays <= 30) aging.d30 += inv.balance;
      else if (overdueDays <= 60) aging.d60 += inv.balance;
      else aging.d90 += inv.balance;
    });
    const agingData = [
      { name: 'Corriente', value: aging.current },
      { name: '1-30 días', value: aging.d30 },
      { name: '31-60 días', value: aging.d60 },
      { name: '> 60 días', value: aging.d90 },
    ];

    // Top 5 deuda
    const suppDebt = [...suppliers]
      .filter(s => s.total_deuda > 0)
      .sort((a, b) => b.total_deuda - a.total_deuda)
      .slice(0, 5)
      .map(s => ({ name: s.name, debt: s.total_deuda }));

    // Pagos por mes (últimos 6)
    const monthMap: Record<string, number> = {};
    paymentsLast6.forEach(p => {
      const key = p.payment_date.slice(0, 7);
      monthMap[key] = (monthMap[key] || 0) + p.amount;
    });
    const monthlyPayments = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, total]) => ({ month, total }));

    // Distribución por status
    const statusCount: Record<string, number> = {};
    invoices.forEach(i => { statusCount[i.status] = (statusCount[i.status] || 0) + 1; });
    const statusDist = Object.entries(statusCount).map(([status, cnt]) => ({ status, cnt }));

    // Próximos vencimientos (top 8)
    const upcoming = [...invoices]
      .filter(i => i.balance > 0)
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
      .slice(0, 8);

    return {
      totalDebt, paidThisMonth, activeSuppliers, pendingInvoices,
      overdueCount, overdueAmount, paidInvoices,
      agingData, suppDebt, monthlyPayments, statusDist, upcoming,
      recentPayments: paymentsRecent,
    };
  }, [invoices, paymentsLast6, paymentsRecent, suppliers, loading]);

  if (loading) return <div style={{ padding: '2rem' }}>Cargando...</div>;
  if (error) return <div style={{ padding: '2rem' }} className="badge badge-danger">{error}</div>;
  if (!stats) return null;

  return (
    <div>
      <div className="topbar">
        <h1 className="page-title">Dashboard Financiero</h1>
        <span className="text-muted" style={{ fontSize: '0.9rem' }}>Última actualización: {new Date().toLocaleString('es-NI')}</span>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}><TrendingDown size={22} /></div>
          <div><span className="kpi-label">Deuda Total</span><span className="kpi-value" style={{ color: '#ef4444' }}>{formatCurrency(stats.totalDebt)}</span></div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}><DollarSign size={22} /></div>
          <div><span className="kpi-label">Pagado este Mes</span><span className="kpi-value" style={{ color: '#10b981' }}>{formatCurrency(stats.paidThisMonth)}</span></div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}><AlertTriangle size={22} /></div>
          <div><span className="kpi-label">Facturas Vencidas</span><span className="kpi-value" style={{ color: '#f59e0b' }}>{stats.overdueCount} ({formatCurrency(stats.overdueAmount)})</span></div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6' }}><FileText size={22} /></div>
          <div><span className="kpi-label">Facturas Pendientes</span><span className="kpi-value">{stats.pendingInvoices}</span></div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: 'rgba(139,92,246,0.15)', color: '#8b5cf6' }}><Users size={22} /></div>
          <div><span className="kpi-label">Proveedores Activos</span><span className="kpi-value">{stats.activeSuppliers}</span></div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}><CheckCircle size={22} /></div>
          <div><span className="kpi-label">Facturas Pagadas</span><span className="kpi-value">{stats.paidInvoices}</span></div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>Antigüedad de Saldos</h3>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.agingData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#f8fafc' }} formatter={(v: any) => formatCurrency(Number(v))} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {stats.agingData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>Deuda por Proveedor (Top 5)</h3>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.suppDebt} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis type="number" stroke="#94a3b8" fontSize={12} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={11} width={120} />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#f8fafc' }} formatter={(v: any) => formatCurrency(Number(v))} />
                <Bar dataKey="debt" fill="#8b5cf6" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>Pagos Últimos 6 Meses</h3>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.monthlyPayments}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#f8fafc' }} formatter={(v: any) => formatCurrency(Number(v))} />
                <Legend />
                <Line type="monotone" dataKey="total" stroke="#10b981" strokeWidth={3} dot={{ fill: '#10b981', r: 4 }} name="Total Pagado" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>Estado de Facturas</h3>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={stats.statusDist} dataKey="cnt" nameKey="status" cx="50%" cy="50%" outerRadius={90}
                  label={({ status, percent }: any) => `${status} ${(percent * 100).toFixed(0)}%`}>
                  {stats.statusDist.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#f8fafc' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '1.5rem' }}>
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Clock size={18} /> Próximos Vencimientos</h3>
          <div className="glass-table-container">
            <table className="glass-table">
              <thead><tr><th>Factura</th><th>Proveedor</th><th>Vence</th><th>Saldo</th><th>Estado</th></tr></thead>
              <tbody>
                {stats.upcoming.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: '1.5rem' }}>Sin facturas pendientes</td></tr>
                ) : stats.upcoming.map(inv => {
                  const diff = daysFromToday(inv.due_date);
                  let badge = 'badge-success', label = `${diff}d`;
                  if (diff < 0) { badge = 'badge-danger'; label = `Vencida ${Math.abs(diff)}d`; }
                  else if (diff <= 7) { badge = 'badge-warning'; label = `${diff}d`; }
                  return (
                    <tr key={inv.id}>
                      <td><strong>{inv.invoice_number}</strong></td>
                      <td>{inv.supplier_code ? `[${inv.supplier_code}] ` : ''}{inv.supplier_name}</td>
                      <td>{formatDate(inv.due_date)}</td>
                      <td style={{ color: '#ef4444', fontWeight: 600 }}>{formatCurrency(inv.balance)}</td>
                      <td><span className={`badge ${badge}`}>{label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>Últimos Abonos</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {stats.recentPayments.length === 0 ? (
              <p className="text-muted">Sin abonos registrados.</p>
            ) : stats.recentPayments.map(p => (
              <div key={p.id} style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                  <strong style={{ color: '#10b981' }}>{formatCurrency(p.amount)}</strong>
                  <span className="text-muted" style={{ fontSize: '0.8rem' }}>{formatDate(p.payment_date)}</span>
                </div>
                <div className="text-muted" style={{ fontSize: '0.85rem' }}>Fact: {p.invoice_number} — {p.supplier_name}</div>
                {p.reference && <div className="text-muted" style={{ fontSize: '0.8rem' }}>Ref: {p.reference}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
