import { supabase } from '../../lib/supabase';

export const authRepo = {
  /**
   * Resuelve un nombre de usuario al email correspondiente vía la función RPC
   * `get_email_by_username`. Devuelve null si el usuario no existe o está inactivo.
   */
  async getEmailByUsername(username: string): Promise<string | null> {
    const { data, error } = await supabase.rpc('get_email_by_username', {
      p_username: username.trim().toLowerCase(),
    });
    if (error) {
      console.error('get_email_by_username error', error);
      return null;
    }
    return (data as string | null) ?? null;
  },

  /**
   * Login con nombre de usuario y contraseña.
   * Devuelve un objeto con success y un mensaje opcional de error.
   */
  async signInWithUsername(username: string, password: string): Promise<{ ok: true } | { ok: false; message: string }> {
    const email = await this.getEmailByUsername(username);
    if (!email) return { ok: false, message: 'Credenciales inválidas' };

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      const msg = error.message === 'Invalid login credentials' ? 'Credenciales inválidas' : error.message;
      return { ok: false, message: msg };
    }
    return { ok: true };
  },
};
