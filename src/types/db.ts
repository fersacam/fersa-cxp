export type UserRole = 'admin' | 'operador' | 'viewer';

export interface Profile {
  id: string;
  full_name: string | null;
  username: string | null;
  role: UserRole;
  active: boolean;
  created_at: string;
}

export interface SupplierType {
  id: number;
  name: string;
  created_at: string;
}

export interface PaymentMethod {
  id: number;
  name: string;
  created_at: string;
}

export interface BankAccount {
  id: number;
  bank_name: string;
  account_number: string;
  currency: string;
  description: string | null;
  created_at: string;
}

export interface Supplier {
  id: number;
  supplier_code: string | null;
  name: string;
  document_id: string | null;
  contact: string | null;
  supplier_type_id: number | null;
  created_at: string;
}

export interface SupplierWithStats extends Supplier {
  type_name: string | null;
  total_deuda: number;
  inv_count: number;
}

export type InvoiceStatus = 'PENDIENTE' | 'PARCIAL' | 'PAGADA';

export interface Invoice {
  id: number;
  invoice_number: string;
  supplier_id: number;
  total: number;
  balance: number;
  issue_date: string;
  due_date: string;
  comment: string | null;
  status: InvoiceStatus;
  created_by: string | null;
  created_at: string;
}

export interface InvoiceWithSupplier extends Invoice {
  supplier_name: string | null;
  supplier_code: string | null;
}

export interface Payment {
  id: number;
  invoice_id: number;
  amount: number;
  payment_method_id: number | null;
  bank_account_id: number | null;
  reference: string | null;
  payment_date: string;
  created_by: string | null;
  created_at: string;
}

export interface AuditLog {
  id: number;
  user_id: string | null;
  action: string;
  module: string;
  details: string | null;
  created_at: string;
}

export interface Setting {
  key: string;
  value: string | null;
}
