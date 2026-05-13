import React, { useEffect, useState } from 'react';
import { auditRepo, type AuditLogRow } from '../db/repositories/auditLogs';

export const Bitacora: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLogs(await auditRepo.list(100));
      } catch (e: any) {
        setError(e?.message ?? 'Error cargando bitácora');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div>
      <div className="topbar">
        <h1 className="page-title">Bitácora de Auditoría</h1>
      </div>

      {error && (
        <div className="badge badge-danger" style={{ padding: '0.75rem', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      <div className="glass-panel glass-table-container">
        <table className="glass-table">
          <thead>
            <tr>
              <th>Fecha/Hora</th>
              <th>Usuario</th>
              <th>Módulo</th>
              <th>Acción</th>
              <th>Detalles</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>Cargando...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>No hay registros en la bitácora.</td></tr>
            ) : (
              logs.map(log => (
                <tr key={log.id}>
                  <td>{new Date(log.created_at).toLocaleString()}</td>
                  <td><strong>{log.user_name || 'Sistema'}</strong></td>
                  <td>{log.module}</td>
                  <td><span className="badge badge-warning">{log.action}</span></td>
                  <td>{log.details}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
