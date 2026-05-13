import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  type: ToastType;
  title: string;
  message?: string;
}

interface ToastContextValue {
  show: (type: ToastType, title: string, message?: string) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 1;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const show = useCallback((type: ToastType, title: string, message?: string) => {
    const id = nextId++;
    setToasts(prev => [...prev, { id, type, title, message }]);
    setTimeout(() => remove(id), 5000);
  }, [remove]);

  const value: ToastContextValue = {
    show,
    success: (title, message) => show('success', title, message),
    error: (title, message) => show('error', title, message),
    info: (title, message) => show('info', title, message),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onClose={remove} />
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>');
  return ctx;
};

const ICON_BY_TYPE: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle size={20} />,
  error: <AlertCircle size={20} />,
  info: <Info size={20} />,
};

const COLOR_BY_TYPE: Record<ToastType, string> = {
  success: '#10b981',
  error: '#ef4444',
  info: '#3b82f6',
};

const ToastContainer: React.FC<{ toasts: Toast[]; onClose: (id: number) => void }> = ({ toasts, onClose }) => {
  return (
    <div style={{
      position: 'fixed',
      top: '1rem',
      right: '1rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem',
      zIndex: 9999,
      maxWidth: '380px',
    }}>
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onClose={onClose} />
      ))}
    </div>
  );
};

const ToastItem: React.FC<{ toast: Toast; onClose: (id: number) => void }> = ({ toast, onClose }) => {
  const [entering, setEntering] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setEntering(false), 10);
    return () => clearTimeout(t);
  }, []);

  const color = COLOR_BY_TYPE[toast.type];

  return (
    <div style={{
      background: 'var(--bg-card, #1e293b)',
      border: `1px solid ${color}40`,
      borderLeft: `4px solid ${color}`,
      borderRadius: '8px',
      padding: '0.75rem 1rem',
      display: 'flex',
      gap: '0.75rem',
      alignItems: 'flex-start',
      boxShadow: '0 6px 24px rgba(0,0,0,0.25)',
      transform: entering ? 'translateX(20px)' : 'translateX(0)',
      opacity: entering ? 0 : 1,
      transition: 'transform 0.2s ease, opacity 0.2s ease',
    }}>
      <div style={{ color, flexShrink: 0, marginTop: '2px' }}>{ICON_BY_TYPE[toast.type]}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{toast.title}</div>
        {toast.message && (
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.15rem' }}>
            {toast.message}
          </div>
        )}
      </div>
      <button onClick={() => onClose(toast.id)}
        style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0', display: 'flex' }}>
        <X size={16} />
      </button>
    </div>
  );
};
