import { supabase } from '../../lib/supabase';
import type { Payment } from '../../types/db';

export interface PaymentRow extends Payment {
  method_name: string | null;
  bank_name: string | null;
  account_number: string | null;
  currency: string | null;
  invoice_number: string | null;
  supplier_name: string | null;
  supplier_code: string | null;
}

export interface PaymentFilters {
  date_from?: string;
  date_to?: string;
  supplier_id?: number;
  invoice_id?: number;
  limit?: number;
}

const SELECT_WITH_RELATIONS = `
  id, invoice_id, amount, payment_method_id, bank_account_id, reference,
  payment_date, created_by, created_at,
  payment_methods ( name ),
  bank_accounts ( bank_name, account_number, currency ),
  invoices ( invoice_number, supplier_id, suppliers ( name, supplier_code ) )
`;

function mapRow(r: any): PaymentRow {
  return {
    id: r.id,
    invoice_id: r.invoice_id,
    amount: Number(r.amount),
    payment_method_id: r.payment_method_id,
    bank_account_id: r.bank_account_id,
    reference: r.reference,
    payment_date: r.payment_date,
    created_by: r.created_by,
    created_at: r.created_at,
    method_name: r.payment_methods?.name ?? null,
    bank_name: r.bank_accounts?.bank_name ?? null,
    account_number: r.bank_accounts?.account_number ?? null,
    currency: r.bank_accounts?.currency ?? null,
    invoice_number: r.invoices?.invoice_number ?? null,
    supplier_name: r.invoices?.suppliers?.name ?? null,
    supplier_code: r.invoices?.suppliers?.supplier_code ?? null,
  };
}

export const paymentsRepo = {
  async listByInvoice(invoiceId: number): Promise<PaymentRow[]> {
    const { data, error } = await supabase
      .from('payments')
      .select(SELECT_WITH_RELATIONS)
      .eq('invoice_id', invoiceId)
      .order('payment_date', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapRow);
  },

  async listRecent(limit = 5): Promise<PaymentRow[]> {
    const { data, error } = await supabase
      .from('payments')
      .select(SELECT_WITH_RELATIONS)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map(mapRow);
  },

  async list(filters: PaymentFilters = {}): Promise<PaymentRow[]> {
    let q = supabase
      .from('payments')
      .select(SELECT_WITH_RELATIONS)
      .order('payment_date', { ascending: false });

    if (filters.date_from) q = q.gte('payment_date', filters.date_from);
    if (filters.date_to) q = q.lte('payment_date', filters.date_to);
    if (filters.invoice_id) q = q.eq('invoice_id', filters.invoice_id);
    if (filters.limit) q = q.limit(filters.limit);

    const { data, error } = await q;
    if (error) throw error;
    let rows = (data ?? []).map(mapRow);
    if (filters.supplier_id) {
      rows = rows.filter(r => {
        const sid = (r as any).invoices?.supplier_id;
        return sid === undefined ? true : sid === filters.supplier_id;
      });
    }
    return rows;
  },

  async create(input: {
    invoice_id: number;
    amount: number;
    payment_method_id: number | null;
    bank_account_id: number | null;
    reference?: string | null;
    payment_date: string;
  }): Promise<Payment> {
    const { data: session } = await supabase.auth.getSession();
    const createdBy = session.session?.user.id ?? null;
    const { data, error } = await supabase
      .from('payments')
      .insert({ ...input, created_by: createdBy })
      .select()
      .single();
    if (error) throw error;
    return data as Payment;
  },

  async update(id: number, input: {
    amount?: number;
    payment_method_id?: number | null;
    bank_account_id?: number | null;
    reference?: string | null;
    payment_date?: string;
  }): Promise<Payment> {
    const { data, error } = await supabase
      .from('payments')
      .update(input)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as Payment;
  },

  async remove(id: number): Promise<void> {
    const { error } = await supabase.from('payments').delete().eq('id', id);
    if (error) throw error;
  },
};
