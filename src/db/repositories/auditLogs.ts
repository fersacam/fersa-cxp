import { supabase } from '../../lib/supabase';
import type { AuditLog } from '../../types/db';

export interface AuditLogRow extends AuditLog {
  user_name: string | null;
}

export const auditRepo = {
  async log(action: string, module: string, details: string): Promise<void> {
    const { data: session } = await supabase.auth.getSession();
    const userId = session.session?.user.id;
    if (!userId) return;
    const { error } = await supabase
      .from('audit_logs')
      .insert({ user_id: userId, action, module, details });
    if (error) console.error('audit log error', error);
  },

  async list(limit = 100): Promise<AuditLogRow[]> {
    const { data, error } = await supabase
      .from('audit_logs')
      .select(`
        id, user_id, action, module, details, created_at,
        profiles ( full_name )
      `)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      id: r.id,
      user_id: r.user_id,
      action: r.action,
      module: r.module,
      details: r.details,
      created_at: r.created_at,
      user_name: r.profiles?.full_name ?? null,
    }));
  },
};
