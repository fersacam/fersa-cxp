import { supabase } from '../../lib/supabase';
import type { Supplier, SupplierWithStats } from '../../types/db';

export const suppliersRepo = {
  async list(): Promise<SupplierWithStats[]> {
    const { data, error } = await supabase
      .from('suppliers')
      .select(`
        id, supplier_code, name, document_id, contact, supplier_type_id, created_at,
        supplier_types ( name ),
        invoices ( id, balance )
      `)
      .order('id', { ascending: false });

    if (error) throw error;

    return (data ?? []).map((row: any) => {
      const invoices = (row.invoices ?? []) as Array<{ id: number; balance: number }>;
      const total_deuda = invoices.reduce((sum, inv) => sum + Number(inv.balance || 0), 0);
      const inv_count = invoices.filter(inv => Number(inv.balance || 0) > 0).length;
      return {
        id: row.id,
        supplier_code: row.supplier_code,
        name: row.name,
        document_id: row.document_id,
        contact: row.contact,
        supplier_type_id: row.supplier_type_id,
        created_at: row.created_at,
        type_name: row.supplier_types?.name ?? null,
        total_deuda,
        inv_count,
      } satisfies SupplierWithStats;
    });
  },

  async create(input: {
    supplier_code: string;
    name: string;
    document_id?: string | null;
    contact?: string | null;
    supplier_type_id?: number | null;
  }): Promise<Supplier> {
    const { data, error } = await supabase
      .from('suppliers')
      .insert(input)
      .select()
      .single();
    if (error) throw error;
    return data as Supplier;
  },

  async update(id: number, input: {
    name?: string;
    document_id?: string | null;
    contact?: string | null;
    supplier_type_id?: number | null;
  }): Promise<Supplier> {
    const { data, error } = await supabase
      .from('suppliers')
      .update(input)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as Supplier;
  },

  async remove(id: number): Promise<void> {
    const { error } = await supabase.from('suppliers').delete().eq('id', id);
    if (error) throw error;
  },

  async nextCode(): Promise<string> {
    const { data, error } = await supabase
      .from('suppliers')
      .select('id')
      .order('id', { ascending: false })
      .limit(1);
    if (error) throw error;
    const lastId = data && data.length > 0 ? Number(data[0].id) : 0;
    return `PROV-${String(lastId + 1).padStart(4, '0')}`;
  },
};
