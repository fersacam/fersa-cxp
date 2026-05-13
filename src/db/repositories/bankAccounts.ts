import { supabase } from '../../lib/supabase';
import type { BankAccount } from '../../types/db';

export const bankAccountsRepo = {
  async list(): Promise<BankAccount[]> {
    const { data, error } = await supabase
      .from('bank_accounts')
      .select('*')
      .order('bank_name', { ascending: true });
    if (error) throw error;
    return (data ?? []) as BankAccount[];
  },

  async create(input: { bank_name: string; account_number: string; currency: string; description?: string | null }): Promise<BankAccount> {
    const { data, error } = await supabase
      .from('bank_accounts')
      .insert(input)
      .select()
      .single();
    if (error) throw error;
    return data as BankAccount;
  },

  async remove(id: number): Promise<void> {
    const { error } = await supabase.from('bank_accounts').delete().eq('id', id);
    if (error) throw error;
  },
};
