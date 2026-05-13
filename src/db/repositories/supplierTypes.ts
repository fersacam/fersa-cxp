import { supabase } from '../../lib/supabase';
import type { SupplierType } from '../../types/db';

export const supplierTypesRepo = {
  async list(): Promise<SupplierType[]> {
    const { data, error } = await supabase
      .from('supplier_types')
      .select('*')
      .order('name', { ascending: true });
    if (error) throw error;
    return (data ?? []) as SupplierType[];
  },

  async create(name: string): Promise<SupplierType> {
    const { data, error } = await supabase
      .from('supplier_types')
      .insert({ name: name.trim() })
      .select()
      .single();
    if (error) throw error;
    return data as SupplierType;
  },

  async remove(id: number): Promise<void> {
    const { error } = await supabase.from('supplier_types').delete().eq('id', id);
    if (error) throw error;
  },
};
