import { supabase } from '../../lib/supabase';
import type { Profile, UserRole } from '../../types/db';

export const profilesRepo = {
  async me(): Promise<Profile | null> {
    const { data: session } = await supabase.auth.getSession();
    const userId = session.session?.user.id;
    if (!userId) return null;
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) {
      console.error('profile fetch error', error);
      return null;
    }
    return data as Profile;
  },

  async list(): Promise<Profile[]> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('full_name', { ascending: true });
    if (error) throw error;
    return (data ?? []) as Profile[];
  },

  async updateRole(id: string, role: UserRole): Promise<void> {
    const { error } = await supabase
      .from('profiles')
      .update({ role })
      .eq('id', id);
    if (error) throw error;
  },

  async setActive(id: string, active: boolean): Promise<void> {
    const { error } = await supabase
      .from('profiles')
      .update({ active })
      .eq('id', id);
    if (error) throw error;
  },

  async updateUsername(id: string, username: string): Promise<void> {
    const trimmed = username.trim().toLowerCase();
    if (!trimmed) throw new Error('Nombre de usuario vacío');
    const { error } = await supabase
      .from('profiles')
      .update({ username: trimmed })
      .eq('id', id);
    if (error) throw error;
  },

  async updateFullName(id: string, fullName: string): Promise<void> {
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName })
      .eq('id', id);
    if (error) throw error;
  },
};
