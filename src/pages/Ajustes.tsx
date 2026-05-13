import React, { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { useAuthStore } from '../store/auth';
import { settingsRepo } from '../db/repositories/settings';
import { paymentMethodsRepo } from '../db/repositories/paymentMethods';
import { bankAccountsRepo } from '../db/repositories/bankAccounts';
import { profilesRepo } from '../db/repositories/profiles';
import { adminUsersRepo } from '../db/repositories/adminUsers';
import { suppliersRepo } from '../db/repositories/suppliers';
import { invoicesRepo } from '../db/repositories/invoices';
import { paymentsRepo } from '../db/repositories/payments';
import { auditRepo } from '../db/repositories/auditLogs';
import { useToast } from '../components/Toast';
import type { PaymentMethod, BankAccount, Profile, UserRole } from '../types/db';
import { Bitacora } from './Bitacora';
import {
  Settings as SettingsIcon,
  CreditCard,
  Landmark,
  Upload,
  Download,
  Plus,
  Trash2,
  History,
  Users,
  ShieldCheck,
  Clock,
  X as XIcon,
  Check,
  Key,
  UserPlus,
} from 'lucide-react';

type TabId = 'general' | 'payments' | 'banks' | 'import' | 'users' | 'bitacora';

function parseExcelDate(d: any): string | null {
  if (d == null || d === '') return null;
  if (typeof d === 'number') {
    return new Date((d - (25567 + 2)) * 86400 * 1000).toISOString().split('T')[0];
  }
  if (typeof d === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
    if (d.includes('/')) {
      const parts = d.split('/');
      if (parts.length === 3) {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
  }
  return null;
}

export const Ajustes: React.FC = () => {
  const { profile, refreshProfile } = useAuthStore();
  const role = profile?.role ?? 'viewer';
  const isAdmin = role === 'admin';
  const canWrite = role === 'admin' || role === 'operador';
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<TabId>('general');
  const [currency, setCurrency] = useState('NIO');
  const [inactivityMins, setInactivityMins] = useState('15');
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [usersList, setUsersList] = useState<Profile[]>([]);
  const [newMethod, setNewMethod] = useState('');
  const [bankForm, setBankForm] = useState({ bank_name: '', account_number: '', currency: 'NIO', description: '' });
  const [editingUsername, setEditingUsername] = useState<{ id: string; value: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [newUserForm, setNewUserForm] = useState<{ username: string; password: string; full_name: string; role: UserRole }>({
    username: '', password: '', full_name: '', role: 'operador',
  });

  useEffect(() => {
    loadSettings();
    loadPayments();
    loadBanks();
    if (isAdmin) loadUsers();
  }, [isAdmin]);

  const loadSettings = async () => {
    try {
      const cur = await settingsRepo.get('currency');
      const idle = await settingsRepo.get('idle_timeout_minutes');
      if (cur) setCurrency(cur);
      if (idle) setInactivityMins(idle);
    } catch (e) { console.error(e); }
  };

  const loadPayments = async () => {
    try { setPaymentMethods(await paymentMethodsRepo.list()); } catch (e) { console.error(e); }
  };

  const loadBanks = async () => {
    try { setBankAccounts(await bankAccountsRepo.list()); } catch (e) { console.error(e); }
  };

  const loadUsers = async () => {
    try { setUsersList(await profilesRepo.list()); } catch (e) { console.error(e); }
  };

  const saveCurrency = async (val: string) => {
    try {
      await settingsRepo.set('currency', val);
      setCurrency(val);
      auditRepo.log('UPDATE', 'Ajustes', `Divisa cambiada a ${val}`);
      toast.success('Divisa actualizada');
    } catch (e: any) {
      toast.error('Error', e?.message ?? String(e));
    }
  };

  const saveInactivity = async (val: string) => {
    try {
      await settingsRepo.set('idle_timeout_minutes', val);
      setInactivityMins(val);
      auditRepo.log('UPDATE', 'Ajustes', `Inactividad programada a ${val} min`);
      toast.success('Inactividad actualizada');
    } catch (e: any) {
      toast.error('Error', e?.message ?? String(e));
    }
  };

  const addMethod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMethod.trim()) return;
    try {
      await paymentMethodsRepo.create(newMethod);
      setNewMethod('');
      await loadPayments();
      toast.success('Método agregado');
    } catch (e: any) {
      toast.error('Error', e?.message ?? String(e));
    }
  };

  const removeMethod = async (id: number) => {
    if (!confirm('¿Eliminar este método de pago?')) return;
    try {
      await paymentMethodsRepo.remove(id);
      await loadPayments();
    } catch (e: any) {
      toast.error('No se puede eliminar', e?.message ?? 'está en uso.');
    }
  };

  const addBank = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await bankAccountsRepo.create({
        bank_name: bankForm.bank_name,
        account_number: bankForm.account_number,
        currency: bankForm.currency,
        description: bankForm.description || null,
      });
      setBankForm({ bank_name: '', account_number: '', currency: 'NIO', description: '' });
      await loadBanks();
      toast.success('Cuenta agregada');
    } catch (e: any) {
      toast.error('Error', e?.message ?? String(e));
    }
  };

  const removeBank = async (id: number) => {
    if (!confirm('¿Eliminar esta cuenta bancaria?')) return;
    try {
      await bankAccountsRepo.remove(id);
      await loadBanks();
    } catch (e: any) {
      toast.error('No se puede eliminar', e?.message ?? 'está en uso.');
    }
  };

  const changeRole = async (id: string, newRole: UserRole) => {
    try {
      await profilesRepo.updateRole(id, newRole);
      auditRepo.log('UPDATE', 'Usuarios', `Rol cambiado a ${newRole}`);
      await loadUsers();
      toast.success('Rol actualizado');
    } catch (e: any) {
      toast.error('Error', e?.message ?? String(e));
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserForm.username.trim() || !newUserForm.password) return;
    if (newUserForm.password.length < 6) {
      toast.error('Contraseña muy corta', 'Debe tener al menos 6 caracteres');
      return;
    }
    setCreatingUser(true);
    try {
      await adminUsersRepo.create({
        username: newUserForm.username.trim(),
        password: newUserForm.password,
        full_name: newUserForm.full_name.trim() || newUserForm.username.trim(),
        role: newUserForm.role,
      });
      auditRepo.log('CREATE', 'Usuarios', `Creado "${newUserForm.username.trim().toLowerCase()}" con rol ${newUserForm.role}`);
      toast.success('Usuario creado', `${newUserForm.username.trim().toLowerCase()} (${newUserForm.role})`);
      setShowCreateUser(false);
      setNewUserForm({ username: '', password: '', full_name: '', role: 'operador' });
      await loadUsers();
    } catch (err: any) {
      toast.error('Error creando usuario', err?.message ?? String(err));
    } finally {
      setCreatingUser(false);
    }
  };

  const handleResetPassword = async (u: Profile) => {
    const newPass = prompt(`Nueva contraseña para "${u.username || u.full_name}":`);
    if (newPass == null) return;
    if (newPass.length < 6) {
      toast.error('Contraseña muy corta', 'Debe tener al menos 6 caracteres');
      return;
    }
    try {
      await adminUsersRepo.updatePassword(u.id, newPass);
      auditRepo.log('UPDATE', 'Usuarios', `Contraseña reseteada para ${u.username}`);
      toast.success('Contraseña actualizada');
    } catch (e: any) {
      toast.error('Error', e?.message ?? String(e));
    }
  };

  const handleDeleteUser = async (u: Profile) => {
    if (u.id === profile?.id) {
      toast.error('No puedes eliminar tu propio usuario');
      return;
    }
    if (!confirm(`¿Eliminar usuario "${u.username || u.full_name}"? Esta acción no se puede deshacer.`)) return;
    try {
      await adminUsersRepo.remove(u.id);
      auditRepo.log('DELETE', 'Usuarios', `Usuario "${u.username}" eliminado`);
      toast.success('Usuario eliminado');
      await loadUsers();
    } catch (e: any) {
      toast.error('Error', e?.message ?? String(e));
    }
  };

  const toggleActive = async (p: Profile) => {
    try {
      await profilesRepo.setActive(p.id, !p.active);
      auditRepo.log('UPDATE', 'Usuarios', `Usuario ${p.active ? 'desactivado' : 'activado'}: ${p.full_name}`);
      await loadUsers();
    } catch (e: any) {
      toast.error('Error', e?.message ?? String(e));
    }
  };

  const startEditUsername = (u: Profile) => {
    setEditingUsername({ id: u.id, value: u.username ?? '' });
  };

  const saveUsername = async () => {
    if (!editingUsername) return;
    try {
      await profilesRepo.updateUsername(editingUsername.id, editingUsername.value);
      auditRepo.log('UPDATE', 'Usuarios', `Username actualizado a "${editingUsername.value.trim().toLowerCase()}"`);
      setEditingUsername(null);
      await loadUsers();
      if (editingUsername.id === profile?.id) await refreshProfile();
      toast.success('Nombre de usuario actualizado');
    } catch (e: any) {
      toast.error('No se pudo guardar', e?.message ?? 'el nombre ya está en uso.');
    }
  };

  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    const wsFacturas = XLSX.utils.aoa_to_sheet([
      ['FECHA', 'COD. PROVEEDOR', 'NOMBRE PROVEEDOR', 'DOCUMENTO', 'FECHA A PAGAR', 'MONTO', 'COMENTARIO'],
      ['2026-04-28', 'PROV-0001', 'FERRETERIA JENNY', '128714', '2026-05-28', 9083.07, 'Compra de materiales'],
    ]);
    XLSX.utils.book_append_sheet(wb, wsFacturas, 'Facturas');

    const wsAbonos = XLSX.utils.aoa_to_sheet([
      ['FECHA ABONO', 'DOCUMENTO FACTURA', 'NOMBRE PROVEEDOR', 'MONTO PAGADO', 'MEDIO DE PAGO', 'BANCO', 'REF#'],
      ['2026-04-30', '128714', 'FERRETERIA JENNY', 5000.00, 'Transferencia', 'BAC', 'REF-9988'],
    ]);
    XLSX.utils.book_append_sheet(wb, wsAbonos, 'Abonos');

    XLSX.writeFile(wb, 'Plantilla_Importacion_FERSA.xlsx');
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImporting(true);

    let suppliersImported = 0;
    let invoicesImported = 0;
    let paymentsImported = 0;
    const warnings: string[] = [];

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });

      // Pre-cargar catálogos
      const existingSuppliers = await suppliersRepo.list();
      const supplierByName = new Map(existingSuppliers.map(s => [s.name.toLowerCase(), s]));
      const supplierByCode = new Map(existingSuppliers.filter(s => s.supplier_code).map(s => [s.supplier_code!.toLowerCase(), s]));
      const allMethods = await paymentMethodsRepo.list();
      const methodByName = new Map(allMethods.map(m => [m.name.toLowerCase(), m]));
      const allBanks = await bankAccountsRepo.list();
      const bankByName = new Map(allBanks.map(b => [b.bank_name.toLowerCase(), b]));

      // 1. Facturas
      if (wb.SheetNames.includes('Facturas')) {
        const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets['Facturas']);
        for (const rawRow of rows) {
          const row: any = {};
          for (const key in rawRow) row[key.trim().toUpperCase()] = rawRow[key];

          const supplierName = (row['NOMBRE PROVEEDOR'] || row['PROVEEDOR'] || '').toString().trim();
          const invoiceNum = (row['DOCUMENTO'] || row['FACTURA'] || '').toString().trim();
          const total = parseFloat(row['MONTO'] || row['TOTAL']) || 0;
          if (!supplierName || !invoiceNum || total <= 0) {
            warnings.push(`Factura omitida (datos incompletos): ${invoiceNum || '?'}`);
            continue;
          }

          // Buscar o crear proveedor
          let supp = supplierByName.get(supplierName.toLowerCase());
          if (!supp) {
            const code = (row['COD. PROVEEDOR'] || '').toString().trim();
            if (code) supp = supplierByCode.get(code.toLowerCase());
          }
          if (!supp) {
            const code = (row['COD. PROVEEDOR'] || '').toString().trim() || await suppliersRepo.nextCode();
            try {
              const created = await suppliersRepo.create({
                supplier_code: code,
                name: supplierName,
                document_id: null,
                contact: null,
                supplier_type_id: null,
              });
              supp = { ...created, type_name: null, total_deuda: 0, inv_count: 0 };
              supplierByName.set(supplierName.toLowerCase(), supp);
              if (created.supplier_code) supplierByCode.set(created.supplier_code.toLowerCase(), supp);
              suppliersImported++;
            } catch (err: any) {
              warnings.push(`No se pudo crear proveedor "${supplierName}": ${err?.message ?? err}`);
              continue;
            }
          }

          const issueDate = parseExcelDate(row['FECHA']) ?? new Date().toISOString().split('T')[0];
          const dueDate = parseExcelDate(row['FECHA A PAGAR'] || row['VENCIMIENTO']) ?? issueDate;

          try {
            await invoicesRepo.create({
              invoice_number: invoiceNum,
              supplier_id: supp.id,
              total,
              issue_date: issueDate,
              due_date: dueDate,
              comment: row['COMENTARIO'] || null,
            });
            invoicesImported++;
          } catch (err: any) {
            warnings.push(`Factura ${invoiceNum} no insertada: ${err?.message ?? err}`);
          }
        }
      }

      // 2. Abonos
      if (wb.SheetNames.includes('Abonos')) {
        const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets['Abonos']);
        for (const rawRow of rows) {
          const row: any = {};
          for (const key in rawRow) row[key.trim().toUpperCase()] = rawRow[key];

          const invoiceNum = (row['DOCUMENTO FACTURA'] || row['FACTURA'] || '').toString().trim();
          const amount = parseFloat(row['MONTO PAGADO'] || row['MONTO']) || 0;
          const supplierName = (row['NOMBRE PROVEEDOR'] || '').toString().trim();
          if (!invoiceNum || amount <= 0) continue;

          let invoiceId: number | null = null;
          if (supplierName) {
            const supp = supplierByName.get(supplierName.toLowerCase());
            if (supp) {
              const invs = await invoicesRepo.listBySupplier(supp.id);
              const match = invs.find(i => i.invoice_number === invoiceNum);
              if (match) invoiceId = match.id;
            }
          }
          if (invoiceId == null) {
            const all = await invoicesRepo.list();
            const match = all.find(i => i.invoice_number === invoiceNum);
            if (match) invoiceId = match.id;
          }
          if (invoiceId == null) {
            warnings.push(`Factura ${invoiceNum} no encontrada para abono`);
            continue;
          }

          // Método de pago
          let methodId: number | null = null;
          const methodName = (row['MEDIO DE PAGO'] || '').toString().trim();
          if (methodName) {
            let m = methodByName.get(methodName.toLowerCase());
            if (!m) {
              try {
                m = await paymentMethodsRepo.create(methodName);
                methodByName.set(methodName.toLowerCase(), m);
              } catch (err) { console.error(err); }
            }
            if (m) methodId = m.id;
          }

          // Banco
          let bankId: number | null = null;
          const bankName = (row['BANCO'] || '').toString().trim();
          if (bankName) {
            const b = bankByName.get(bankName.toLowerCase());
            if (b) bankId = b.id;
          }

          const payDate = parseExcelDate(row['FECHA ABONO'] || row['FECHA']) ?? new Date().toISOString().split('T')[0];
          try {
            await paymentsRepo.create({
              invoice_id: invoiceId,
              amount,
              payment_method_id: methodId,
              bank_account_id: bankId,
              reference: row['REF#'] || row['REFERENCIA'] || null,
              payment_date: payDate,
            });
            paymentsImported++;
          } catch (err: any) {
            warnings.push(`Abono ${formatNumber(amount)} a ${invoiceNum} no aplicado: ${err?.message ?? err}`);
          }
        }
      }

      auditRepo.log('IMPORT', 'Ajustes', `Importación XLSX: ${suppliersImported} prov, ${invoicesImported} facts, ${paymentsImported} abonos`);
      toast.success(
        'Importación completada',
        `${suppliersImported} proveedores · ${invoicesImported} facturas · ${paymentsImported} abonos`
      );
      if (warnings.length > 0) {
        console.warn('Advertencias de importación:', warnings);
        toast.info('Hubo advertencias', `${warnings.length} entradas no se importaron. Ver consola.`);
      }
    } catch (err: any) {
      toast.error('Error en la importación', err?.message ?? String(err));
    } finally {
      setImporting(false);
    }
  };

  const tabs: Array<{ id: TabId; label: string; icon: React.ReactNode; adminOnly?: boolean }> = [
    { id: 'general', label: 'General', icon: <SettingsIcon size={16} /> },
    { id: 'payments', label: 'Métodos de Pago', icon: <CreditCard size={16} /> },
    { id: 'banks', label: 'Cuentas Bancarias', icon: <Landmark size={16} /> },
    { id: 'import', label: 'Importación Excel', icon: <Upload size={16} /> },
    { id: 'users', label: 'Usuarios y Roles', icon: <Users size={16} />, adminOnly: true },
    { id: 'bitacora', label: 'Bitácora', icon: <History size={16} />, adminOnly: true },
  ];

  const visibleTabs = tabs.filter(t => !t.adminOnly || isAdmin);

  return (
    <div>
      <div className="topbar">
        <h1 className="page-title">Ajustes del Sistema</h1>
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
        {visibleTabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={activeTab === t.id ? 'btn-primary' : 'btn-secondary'}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="glass-panel" style={{ padding: '2rem', maxWidth: '900px' }}>

        {activeTab === 'general' && (
          <div>
            <h3 style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Configuración General</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
              <div className="form-group">
                <label><ShieldCheck size={14} style={{ verticalAlign: 'middle', marginRight: '5px' }} /> Divisa Principal</label>
                <select className="glass-input" value={currency} onChange={(e) => saveCurrency(e.target.value)} disabled={!isAdmin}>
                  <option value="NIO">Córdobas (NIO)</option>
                  <option value="USD">Dólares (USD)</option>
                </select>
              </div>
              <div className="form-group">
                <label><Clock size={14} style={{ verticalAlign: 'middle', marginRight: '5px' }} /> Inactividad Permitida</label>
                <select className="glass-input" value={inactivityMins} onChange={(e) => saveInactivity(e.target.value)} disabled={!isAdmin}>
                  <option value="5">5 Minutos</option>
                  <option value="15">15 Minutos</option>
                  <option value="30">30 Minutos</option>
                  <option value="60">1 Hora</option>
                </select>
              </div>
            </div>
            {!isAdmin && <p className="text-muted" style={{ marginTop: '1rem' }}>Solo administradores pueden modificar la configuración.</p>}
          </div>
        )}

        {activeTab === 'payments' && (
          <div>
            <h3 style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Métodos de Pago</h3>
            {canWrite && (
              <form onSubmit={addMethod} style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                <input className="glass-input" placeholder="Ej: Efectivo, Transferencia..." value={newMethod} onChange={e => setNewMethod(e.target.value)} required />
                <button type="submit" className="btn-primary">Agregar</button>
              </form>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
              {paymentMethods.map(m => (
                <div key={m.id} className="badge badge-info" style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {m.name}
                  {isAdmin && (
                    <button onClick={() => removeMethod(m.id)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>
                      <XIcon size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'banks' && (
          <div>
            <h3 style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Cuentas Bancarias</h3>
            {canWrite && (
              <form onSubmit={addBank} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: '1rem', alignItems: 'flex-end', marginBottom: '2rem' }}>
                <div className="form-group"><label>Banco</label><input className="glass-input" required value={bankForm.bank_name} onChange={e => setBankForm({ ...bankForm, bank_name: e.target.value })} /></div>
                <div className="form-group"><label>Nº Cuenta</label><input className="glass-input" required value={bankForm.account_number} onChange={e => setBankForm({ ...bankForm, account_number: e.target.value })} /></div>
                <div className="form-group"><label>Divisa</label>
                  <select className="glass-input" value={bankForm.currency} onChange={e => setBankForm({ ...bankForm, currency: e.target.value })}>
                    <option value="NIO">NIO</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
                <button type="submit" className="btn-primary" style={{ padding: '0.75rem' }}><Plus size={20} /></button>
              </form>
            )}
            <div className="glass-table-container" style={{ margin: 0 }}>
              <table className="glass-table">
                <thead><tr><th>Banco</th><th>Nº Cuenta</th><th>Divisa</th><th>Acciones</th></tr></thead>
                <tbody>
                  {bankAccounts.length === 0 ? (
                    <tr><td colSpan={4} style={{ textAlign: 'center', padding: '1.5rem' }}>Sin cuentas registradas.</td></tr>
                  ) : bankAccounts.map(b => (
                    <tr key={b.id}>
                      <td><strong>{b.bank_name}</strong></td>
                      <td>{b.account_number}</td>
                      <td>{b.currency}</td>
                      <td>
                        {isAdmin && <button onClick={() => removeBank(b.id)} className="btn-icon btn-icon-danger"><Trash2 size={16} /></button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'import' && (
          <div>
            <h3 style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Importación Masiva</h3>
            <p className="text-muted" style={{ marginBottom: '1rem' }}>
              Usa la plantilla para cargar proveedores, facturas y abonos desde Excel.
            </p>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
              <button className="btn-secondary" onClick={downloadTemplate}><Download size={16} /> Descargar Plantilla</button>
              {canWrite && (
                <label className={`btn-primary ${importing ? 'disabled' : ''}`} style={{ cursor: importing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: importing ? 0.6 : 1 }}>
                  <Upload size={16} /> {importing ? 'Importando...' : 'Seleccionar Archivo'}
                  <input type="file" hidden accept=".xlsx,.xls" disabled={importing} onChange={handleImportExcel} />
                </label>
              )}
            </div>
            <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <h4 style={{ marginBottom: '0.5rem' }}>Instrucciones:</h4>
              <ul style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', paddingLeft: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <li>La plantilla tiene 2 pestañas: <strong>Facturas</strong> y <strong>Abonos</strong>.</li>
                <li>En <strong>Facturas</strong>: se crean proveedores nuevos si no existen y se registran las facturas.</li>
                <li>En <strong>Abonos</strong>: se aplican pagos a facturas existentes usando el número de documento.</li>
                <li>Formato recomendado de fecha: <code>YYYY-MM-DD</code> (también acepta <code>DD/MM/YYYY</code>).</li>
                <li>Asegúrate de que los nombres de proveedores coincidan exactamente entre ambas pestañas.</li>
              </ul>
            </div>
          </div>
        )}

        {activeTab === 'users' && isAdmin && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>Usuarios y Roles</h3>
              <button className="btn-primary" onClick={() => setShowCreateUser(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <UserPlus size={16} /> Crear usuario
              </button>
            </div>
            <p className="text-muted" style={{ marginBottom: '1.5rem', fontSize: '0.9rem' }}>
              Crea usuarios, cambia roles, resetea contraseñas y desactiva cuentas. Los usuarios nuevos
              entran con el rol seleccionado y pueden iniciar sesión con su nombre de usuario.
            </p>
            <div className="glass-table-container" style={{ margin: 0 }}>
              <table className="glass-table">
                <thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr></thead>
                <tbody>
                  {usersList.length === 0 ? (
                    <tr><td colSpan={4} style={{ textAlign: 'center', padding: '1.5rem' }}>Sin usuarios.</td></tr>
                  ) : usersList.map(u => (
                    <tr key={u.id}>
                      <td>
                        {editingUsername?.id === u.id ? (
                          <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                            <input className="glass-input" style={{ padding: '0.3rem 0.5rem', fontSize: '0.85rem', width: '160px' }}
                              value={editingUsername.value}
                              onChange={e => setEditingUsername({ ...editingUsername, value: e.target.value })}
                              autoFocus />
                            <button onClick={saveUsername} className="btn-icon" title="Guardar"><Check size={14} /></button>
                            <button onClick={() => setEditingUsername(null)} className="btn-icon" title="Cancelar"><XIcon size={14} /></button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <strong>{u.username || '—'}</strong>
                            <button onClick={() => startEditUsername(u)} title="Editar usuario"
                              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0', fontSize: '0.9rem' }}>
                              ✏️
                            </button>
                          </div>
                        )}
                      </td>
                      <td>
                        <select className="glass-input" value={u.role} onChange={e => changeRole(u.id, e.target.value as UserRole)}
                          style={{ padding: '0.3rem 0.5rem', fontSize: '0.85rem' }}
                          disabled={u.id === profile?.id}>
                          <option value="admin">Administrador</option>
                          <option value="operador">Operador</option>
                          <option value="viewer">Solo lectura</option>
                        </select>
                      </td>
                      <td>
                        <span className={`badge ${u.active ? 'badge-success' : 'badge-danger'}`}>
                          {u.active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                          {u.id !== profile?.id && (
                            <button onClick={() => toggleActive(u)} className="btn-secondary" style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}>
                              {u.active ? 'Desactivar' : 'Activar'}
                            </button>
                          )}
                          <button onClick={() => handleResetPassword(u)} className="btn-icon" title="Resetear contraseña">
                            <Key size={14} />
                          </button>
                          {u.id !== profile?.id && (
                            <button onClick={() => handleDeleteUser(u)} className="btn-icon btn-icon-danger" title="Eliminar usuario">
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'bitacora' && isAdmin && <Bitacora />}

      </div>

      {/* Modal: Crear Usuario */}
      {showCreateUser && isAdmin && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content" style={{ width: '440px' }}>
            <div className="modal-header">
              <h2>Crear usuario</h2>
              <button className="btn-icon" onClick={() => setShowCreateUser(false)}><XIcon size={20} /></button>
            </div>
            <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label>Nombre de usuario *</label>
                <input className="glass-input" required autoFocus autoCapitalize="none" autoCorrect="off"
                  placeholder="Ej. juanperez"
                  pattern="[a-zA-Z0-9._\-]+"
                  title="Solo letras, números, '.', '_' o '-'"
                  value={newUserForm.username}
                  onChange={e => setNewUserForm({ ...newUserForm, username: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Contraseña * (mínimo 6 caracteres)</label>
                <input type="password" className="glass-input" required minLength={6}
                  placeholder="••••••••"
                  value={newUserForm.password}
                  onChange={e => setNewUserForm({ ...newUserForm, password: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Nombre completo (opcional)</label>
                <input className="glass-input"
                  placeholder="Ej. Juan Pérez"
                  value={newUserForm.full_name}
                  onChange={e => setNewUserForm({ ...newUserForm, full_name: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Rol *</label>
                <select className="glass-input" required value={newUserForm.role}
                  onChange={e => setNewUserForm({ ...newUserForm, role: e.target.value as UserRole })}>
                  <option value="admin">Administrador (control total)</option>
                  <option value="operador">Operador (crear/editar facturas y pagos)</option>
                  <option value="viewer">Solo lectura</option>
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowCreateUser(false)} disabled={creatingUser}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" disabled={creatingUser}>
                  {creatingUser ? 'Creando...' : 'Crear usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

function formatNumber(n: number): string {
  return n.toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
