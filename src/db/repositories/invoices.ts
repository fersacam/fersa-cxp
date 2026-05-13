import { supabase } from '../../lib/supabase';
import type { Invoice, InvoiceStatus, InvoiceWithSupplier } from '../../types/db';

export interface InvoiceFilters {
  status?: InvoiceStatus;
  supplier_id?: number;
  due_from?: string;
  due_to?: string;
  has_balance?: boolean;
}

export const invoicesRepo = {
  async list(filters: InvoiceFilters = {}): Promise<InvoiceWithSupplier[]> {
    let q = supabase
      .from('invoices')
      .select(`
        id, invoice_number, supplier_id, total, balance, issue_date, due_date,
        comment, status, created_by, created_at,
        suppliers ( name, supplier_code )
      `)
      .order('due_date', { ascending: true });

    if (filters.status) q = q.eq('status', filters.status);
    if (filters.supplier_id) q = q.eq('supplier_id', filters.supplier_id);
    if (filters.due_from) q = q.gte('due_date', filters.due_from);
    if (filters.due_to) q = q.lte('due_date', filters.due_to);
    if (filters.has_balance) q = q.gt('balance', 0);

    const { data, error } = await q;
    if (error) throw error;

    return (data ?? []).map((r: any) => ({
      id: r.id,
      invoice_number: r.invoice_number,
      supplier_id: r.supplier_id,
      total: Number(r.total),
      balance: Number(r.balance),
      issue_date: r.issue_date,
      due_date: r.due_date,
      comment: r.comment,
      status: r.status,
      created_by: r.created_by ?? null,
      created_at: r.created_at,
      supplier_name: r.suppliers?.name ?? null,
      supplier_code: r.suppliers?.supplier_code ?? null,
    } satisfies InvoiceWithSupplier));
  },

  async listBySupplier(supplierId: number, onlyWithBalance = false): Promise<Invoice[]> {
    let q = supabase
      .from('invoices')
      .select('id, invoice_number, supplier_id, total, balance, issue_date, due_date, comment, status, created_by, created_at')
      .eq('supplier_id', supplierId)
      .order('due_date', { ascending: true });
    if (onlyWithBalance) q = q.gt('balance', 0);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      ...r,
      total: Number(r.total),
      balance: Number(r.balance),
    })) as Invoice[];
  },

  async create(input: {
    invoice_number: string;
    supplier_id: number;
    total: number;
    issue_date: string;
    due_date: string;
    comment?: string | null;
  }): Promise<Invoice> {
    const { data: session } = await supabase.auth.getSession();
    const createdBy = session.session?.user.id ?? null;
    const { data, error } = await supabase
      .from('invoices')
      .insert({ ...input, created_by: createdBy })
      .select()
      .single();
    if (error) throw error;
    return data as Invoice;
  },

  async remove(id: number): Promise<void> {
    const { error } = await supabase.from('invoices').delete().eq('id', id);
    if (error) throw error;
  },
};
