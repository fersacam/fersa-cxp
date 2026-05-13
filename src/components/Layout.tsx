import React, { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { profilesRepo } from '../db/repositories/profiles';
import { settingsRepo } from '../db/repositories/settings';
import { useRealtimeNotifications } from '../hooks/useRealtimeNotifications';
import type { Profile } from '../types/db';
import {
  LayoutDashboard,
  Users,
  FileText,
  CreditCard,
  Settings,
  LogOut,
  Wallet,
  PieChart,
  Sun,
  Moon,
} from 'lucide-react';

export const Layout: React.FC = () => {
  const { signOut, profile } = useAuthStore();
  const [users, setUsers] = useState<Profile[]>([]);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useRealtimeNotifications();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await profilesRepo.list();
        if (!cancelled) setUsers(list.filter(p => p.active));
      } catch (e) {
        console.error(e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let inactivityMins = 15;
    let cancelled = false;

    const setupTimer = async () => {
      try {
        const raw = await settingsRepo.get('idle_timeout_minutes');
        const parsed = raw ? parseInt(raw, 10) : NaN;
        if (!isNaN(parsed) && parsed > 0) inactivityMins = parsed;
      } catch {}
      if (cancelled) return;

      const resetTimer = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          alert('Sesión cerrada por inactividad.');
          signOut();
        }, inactivityMins * 60 * 1000);
      };

      resetTimer();
      const events = ['mousemove', 'keydown', 'mousedown', 'scroll'];
      events.forEach(e => window.addEventListener(e, resetTimer));

      return () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        events.forEach(e => window.removeEventListener(e, resetTimer));
      };
    };

    let cleanup: (() => void) | undefined;
    setupTimer().then(fn => { if (fn) cleanup = fn; });
    return () => { cancelled = true; cleanup?.(); };
  }, [signOut]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <Wallet color="var(--accent-color)" />
          <span>FERSA CXP</span>
        </div>

        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <NavLink to="/" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <LayoutDashboard size={20} />
            <span>Dashboard</span>
          </NavLink>
          <NavLink to="/proveedores" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <Users size={20} />
            <span>Proveedores</span>
          </NavLink>
          <NavLink to="/facturas" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <FileText size={20} />
            <span>Facturas CXP</span>
          </NavLink>
          <NavLink to="/abonos" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <CreditCard size={20} />
            <span>Abonos</span>
          </NavLink>
          <NavLink to="/reportes" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <PieChart size={20} />
            <span>Reportes</span>
          </NavLink>
          <NavLink to="/ajustes" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <Settings size={20} />
            <span>Ajustes</span>
          </NavLink>

          <hr style={{ borderColor: 'var(--border-color)', margin: '1rem 0' }} />

          <div style={{ padding: '0 1rem' }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Usuarios
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.9rem' }}>
              {users.map(u => (
                <div key={u.id} style={{ color: 'var(--text-primary)' }}>• {u.username || u.id.slice(0, 8)}</div>
              ))}
            </div>
          </div>
        </nav>

        <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
          {profile && (
            <div style={{ padding: '0.5rem 1rem 1rem', fontSize: '0.85rem' }}>
              <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{profile.username || profile.full_name}</div>
              <div style={{
                color: profile.role === 'viewer' ? 'var(--warning-color, #f59e0b)' : 'var(--text-secondary)',
                fontWeight: profile.role === 'viewer' ? 600 : 'normal',
              }}>
                Rol: {profile.role}
              </div>
            </div>
          )}
          <button onClick={toggleTheme} className="nav-link" style={{ width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', marginBottom: '0.5rem' }}>
            {theme === 'dark' ? <Sun size={20} color="var(--warning-color)" /> : <Moon size={20} color="var(--accent-color)" />}
            <span style={{ color: 'var(--text-primary)' }}>{theme === 'dark' ? 'Modo Claro' : 'Modo Oscuro'}</span>
          </button>

          <button onClick={signOut} className="nav-link" style={{ width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', marginBottom: '0.5rem' }}>
            <LogOut size={20} color="var(--danger-color)" />
            <span style={{ color: 'var(--danger-color)' }}>Cerrar Sesión</span>
          </button>

          <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
            Creado por Emilius
          </div>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
};
