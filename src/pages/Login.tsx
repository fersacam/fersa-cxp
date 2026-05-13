import React, { useState } from 'react';
import { authRepo } from '../db/repositories/auth';
import { auditRepo } from '../db/repositories/auditLogs';
import { Wallet, Eye, EyeOff } from 'lucide-react';

export const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await authRepo.signInWithUsername(username, password);
      if (result.ok === false) {
        setError(result.message);
        return;
      }
      // El listener de onAuthStateChange refresca sesión y profile.
      auditRepo.log('LOGIN', 'Auth', `Inicio de sesión: ${username.trim().toLowerCase()}`).catch(() => {});
    } catch (err: any) {
      setError('Error de conexión: ' + (err?.message ?? String(err)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container" style={{ flexDirection: 'column' }}>
      <div className="login-card glass-panel">
        <div className="login-header">
          <Wallet size={48} color="var(--accent-color)" style={{ margin: '0 auto 1rem' }} />
          <h1>Cuentas por Pagar</h1>
          <p>Ingrese sus credenciales para continuar</p>
        </div>

        {error && (
          <div className="badge badge-danger" style={{ textAlign: 'center', padding: '0.75rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="form-group">
            <label>Usuario</label>
            <input
              type="text"
              className="glass-input"
              placeholder="Ej. admin"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
            />
          </div>

          <div className="form-group">
            <label>Contraseña</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                className="glass-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                style={{ paddingRight: '40px' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer',
                }}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Ingresando...' : 'Iniciar Sesión'}
          </button>
        </form>
      </div>
      <div style={{ marginTop: '2rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
        Creado por Emilius
      </div>
    </div>
  );
};
