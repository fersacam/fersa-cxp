import { supabase } from '../../lib/supabase';
import type { PaymentMethod } from '../../types/db';

export const paymentMethodsRepo = {
  async list(): Promise<PaymentMethod[]> {
    const { data, error } = await supabase
      .from('payment_methods')
      .select('*')
      .order('name', { ascending: true });
    if (error) throw error;
    return (data ?? []) as PaymentMethod[];
  },

  async create(name: string): Promise<PaymentMethod> {
    const { data, error } = await supabase
      .from('payment_methods')
      .insert({ name: name.trim() })
      .select()
      .single();
    if (error) throw error;
    return data as PaymentMethod;
  },

  async remove(id: number): Promise<void> {
    const { error } = await supabase.from('payment_methods').delete().eq('id', id);
    if (error) throw error;
  },
};
