import { supabase } from '../../lib/supabase';
import type { UserRole } from '../../types/db';

async function invoke(body: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (error) {
    let message = error.message;
    try {
      const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
      if (ctx && typeof ctx.json === 'function') {
        const body = await ctx.json();
        if (body?.error) message = body.error;
      }
    } catch { /* ignore */ }
    throw new Error(message);
  }
  if (data && typeof data === 'object' && 'error' in data && (data as { error: string }).error) {
    throw new Error((data as { error: string }).error);
  }
  return data;
}

export const adminUsersRepo = {
  async create(input: {
    username: string;
    password: string;
    role: UserRole;
    full_name?: string;
    email?: string;
  }): Promise<void> {
    await invoke({ action: 'create', ...input });
  },

  async remove(userId: string): Promise<void> {
    await invoke({ action: 'delete', user_id: userId });
  },

  async updatePassword(userId: string, newPassword: string): Promise<void> {
    await invoke({ action: 'update_password', user_id: userId, new_password: newPassword });
  },

  async updateEmail(userId: string, newEmail: string): Promise<void> {
    await invoke({ action: 'update_email', user_id: userId, new_email: newEmail });
  },
};
