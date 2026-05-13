import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth';

import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Proveedores } from './pages/Proveedores';
import { Facturas } from './pages/Facturas';
import { Abonos } from './pages/Abonos';
import { Ajustes } from './pages/Ajustes';
import { Reportes } from './pages/Reportes';

const App: React.FC = () => {
  const { session, loading, init } = useAuthStore();

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    init().then(fn => { cleanup = fn; });
    return () => { cleanup?.(); };
  }, [init]);

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', background: 'var(--bg-main)', color: 'white' }}>
        <h2>Iniciando Sistema CXP...</h2>
      </div>
    );
  }

  return (
    <Router basename={import.meta.env.BASE_URL}>
      <Routes>
        {!session ? (
          <Route path="*" element={<Login />} />
        ) : (
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="proveedores" element={<Proveedores />} />
            <Route path="facturas" element={<Facturas />} />
            <Route path="abonos" element={<Abonos />} />
            <Route path="reportes" element={<Reportes />} />
            <Route path="ajustes" element={<Ajustes />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        )}
      </Routes>
    </Router>
  );
};

export default App;
