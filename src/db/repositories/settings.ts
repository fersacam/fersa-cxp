import { supabase } from '../../lib/supabase';

export const settingsRepo = {
  async get(key: string): Promise<string | null> {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', key)
      .maybeSingle();
    if (error) {
      console.error('settings get error', error);
      return null;
    }
    return data?.value ?? null;
  },

  async set(key: string, value: string): Promise<void> {
    const { error } = await supabase
      .from('settings')
      .upsert({ key, value }, { onConflict: 'key' });
    if (error) throw error;
  },
};
