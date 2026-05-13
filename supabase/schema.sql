-- ============================================================================
-- Soft FERSA / Cuentas por Pagar - Esquema Supabase
-- Aplicar en el SQL Editor de Supabase.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Extensiones
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 2. Profiles (extiende auth.users con rol y nombre)
--    Roles: 'admin' | 'operador' | 'viewer'
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  role        text not null default 'viewer'
              check (role in ('admin', 'operador', 'viewer')),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Trigger: cuando se crea un usuario en auth, crea su profile
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'viewer')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Helper: rol del usuario actual
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- ----------------------------------------------------------------------------
-- 3. Catálogos
-- ----------------------------------------------------------------------------
create table if not exists public.supplier_types (
  id          bigint generated always as identity primary key,
  name        text unique not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.payment_methods (
  id          bigint generated always as identity primary key,
  name        text unique not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.bank_accounts (
  id              bigint generated always as identity primary key,
  bank_name       text not null,
  account_number  text not null,
  currency        text not null default 'NIO',
  description     text,
  created_at      timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 4. Proveedores
-- ----------------------------------------------------------------------------
create table if not exists public.suppliers (
  id                bigint generated always as identity primary key,
  supplier_code     text unique,
  name              text not null,
  document_id       text,
  contact           text,
  supplier_type_id  bigint references public.supplier_types(id) on delete set null,
  created_at        timestamptz not null default now()
);

create index if not exists idx_suppliers_type on public.suppliers(supplier_type_id);
create index if not exists idx_suppliers_name on public.suppliers(name);

-- ----------------------------------------------------------------------------
-- 5. Facturas
--    balance se mantiene automáticamente por trigger desde payments.
-- ----------------------------------------------------------------------------
create table if not exists public.invoices (
  id              bigint generated always as identity primary key,
  invoice_number  text not null,
  supplier_id     bigint not null references public.suppliers(id) on delete restrict,
  total           numeric(14,2) not null check (total >= 0),
  balance         numeric(14,2) not null default 0 check (balance >= 0),
  issue_date      date not null,
  due_date        date not null,
  comment         text,
  status          text not null default 'PENDIENTE'
                  check (status in ('PENDIENTE', 'PARCIAL', 'PAGADA')),
  created_at      timestamptz not null default now()
);

create index if not exists idx_invoices_supplier on public.invoices(supplier_id);
create index if not exists idx_invoices_status_due on public.invoices(status, due_date);
create index if not exists idx_invoices_due on public.invoices(due_date);

-- Cuando se crea una factura, balance = total (si no se especificó otra cosa)
create or replace function public.init_invoice_balance()
returns trigger
language plpgsql
as $$
begin
  if new.balance = 0 and new.total > 0 then
    new.balance := new.total;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_invoices_init_balance on public.invoices;
create trigger trg_invoices_init_balance
before insert on public.invoices
for each row execute function public.init_invoice_balance();

-- ----------------------------------------------------------------------------
-- 6. Pagos / Abonos
-- ----------------------------------------------------------------------------
create table if not exists public.payments (
  id                  bigint generated always as identity primary key,
  invoice_id          bigint not null references public.invoices(id) on delete restrict,
  amount              numeric(14,2) not null check (amount > 0),
  payment_method_id   bigint references public.payment_methods(id) on delete set null,
  bank_account_id     bigint references public.bank_accounts(id) on delete set null,
  reference           text,
  payment_date        date not null,
  created_by          uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now()
);

create index if not exists idx_payments_invoice on public.payments(invoice_id);
create index if not exists idx_payments_date on public.payments(payment_date);

-- Recalcula balance + status de la factura cuando cambian sus pagos
create or replace function public.recalc_invoice_balance()
returns trigger
language plpgsql
as $$
declare
  v_invoice_id bigint;
  v_total      numeric(14,2);
  v_paid       numeric(14,2);
  v_new_bal    numeric(14,2);
  v_new_status text;
begin
  v_invoice_id := coalesce(new.invoice_id, old.invoice_id);

  select total into v_total
  from public.invoices
  where id = v_invoice_id;

  select coalesce(sum(amount), 0) into v_paid
  from public.payments
  where invoice_id = v_invoice_id;

  if v_paid > v_total then
    raise exception 'El total de abonos (%) supera el monto de la factura (%)', v_paid, v_total;
  end if;

  v_new_bal := v_total - v_paid;
  v_new_status := case
    when v_paid >= v_total then 'PAGADA'
    when v_paid > 0        then 'PARCIAL'
    else                        'PENDIENTE'
  end;

  update public.invoices
  set balance = v_new_bal,
      status  = v_new_status
  where id = v_invoice_id;

  return null;
end;
$$;

drop trigger if exists trg_payments_recalc on public.payments;
create trigger trg_payments_recalc
after insert or update or delete on public.payments
for each row execute function public.recalc_invoice_balance();

-- ----------------------------------------------------------------------------
-- 7. Bitácora / Audit
-- ----------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id          bigint generated always as identity primary key,
  user_id     uuid references auth.users(id) on delete set null,
  action      text not null,
  module      text not null,
  details     text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_audit_user_date on public.audit_logs(user_id, created_at desc);
create index if not exists idx_audit_date on public.audit_logs(created_at desc);

-- ----------------------------------------------------------------------------
-- 8. Settings (clave/valor)
-- ----------------------------------------------------------------------------
create table if not exists public.settings (
  key    text primary key,
  value  text
);

-- ----------------------------------------------------------------------------
-- 9. Seeds
-- ----------------------------------------------------------------------------
insert into public.supplier_types (name) values
  ('Servicios'), ('Materiales'), ('Mercadería'), ('Equipos')
on conflict (name) do nothing;

insert into public.payment_methods (name) values
  ('Transferencia'), ('Efectivo'), ('Cheque'), ('Tarjeta')
on conflict (name) do nothing;

insert into public.settings (key, value) values
  ('currency', 'NIO'),
  ('idle_timeout_minutes', '15')
on conflict (key) do nothing;

-- ============================================================================
-- 10. Row Level Security
-- ============================================================================

alter table public.profiles        enable row level security;
alter table public.supplier_types  enable row level security;
alter table public.payment_methods enable row level security;
alter table public.bank_accounts   enable row level security;
alter table public.suppliers       enable row level security;
alter table public.invoices        enable row level security;
alter table public.payments        enable row level security;
alter table public.audit_logs      enable row level security;
alter table public.settings        enable row level security;

-- ---------- profiles ----------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));

drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles
  for all to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- ---------- Catálogos y operativas: helper de políticas ----------
-- Patrón: SELECT para todos autenticados, INSERT/UPDATE para admin+operador, DELETE solo admin.

-- supplier_types
drop policy if exists st_select on public.supplier_types;
create policy st_select on public.supplier_types
  for select to authenticated using (true);
drop policy if exists st_write on public.supplier_types;
create policy st_write on public.supplier_types
  for insert to authenticated
  with check (public.current_user_role() in ('admin', 'operador'));
drop policy if exists st_update on public.supplier_types;
create policy st_update on public.supplier_types
  for update to authenticated
  using (public.current_user_role() in ('admin', 'operador'))
  with check (public.current_user_role() in ('admin', 'operador'));
drop policy if exists st_delete on public.supplier_types;
create policy st_delete on public.supplier_types
  for delete to authenticated
  using (public.current_user_role() = 'admin');

-- payment_methods
drop policy if exists pm_select on public.payment_methods;
create policy pm_select on public.payment_methods
  for select to authenticated using (true);
drop policy if exists pm_write on public.payment_methods;
create policy pm_write on public.payment_methods
  for insert to authenticated
  with check (public.current_user_role() in ('admin', 'operador'));
drop policy if exists pm_update on public.payment_methods;
create policy pm_update on public.payment_methods
  for update to authenticated
  using (public.current_user_role() in ('admin', 'operador'))
  with check (public.current_user_role() in ('admin', 'operador'));
drop policy if exists pm_delete on public.payment_methods;
create policy pm_delete on public.payment_methods
  for delete to authenticated
  using (public.current_user_role() = 'admin');

-- bank_accounts
drop policy if exists ba_select on public.bank_accounts;
create policy ba_select on public.bank_accounts
  for select to authenticated using (true);
drop policy if exists ba_write on public.bank_accounts;
create policy ba_write on public.bank_accounts
  for insert to authenticated
  with check (public.current_user_role() in ('admin', 'operador'));
drop policy if exists ba_update on public.bank_accounts;
create policy ba_update on public.bank_accounts
  for update to authenticated
  using (public.current_user_role() in ('admin', 'operador'))
  with check (public.current_user_role() in ('admin', 'operador'));
drop policy if exists ba_delete on public.bank_accounts;
create policy ba_delete on public.bank_accounts
  for delete to authenticated
  using (public.current_user_role() = 'admin');

-- suppliers
drop policy if exists sup_select on public.suppliers;
create policy sup_select on public.suppliers
  for select to authenticated using (true);
drop policy if exists sup_write on public.suppliers;
create policy sup_write on public.suppliers
  for insert to authenticated
  with check (public.current_user_role() in ('admin', 'operador'));
drop policy if exists sup_update on public.suppliers;
create policy sup_update on public.suppliers
  for update to authenticated
  using (public.current_user_role() in ('admin', 'operador'))
  with check (public.current_user_role() in ('admin', 'operador'));
drop policy if exists sup_delete on public.suppliers;
create policy sup_delete on public.suppliers
  for delete to authenticated
  using (public.current_user_role() = 'admin');

-- invoices
drop policy if exists inv_select on public.invoices;
create policy inv_select on public.invoices
  for select to authenticated using (true);
drop policy if exists inv_write on public.invoices;
create policy inv_write on public.invoices
  for insert to authenticated
  with check (public.current_user_role() in ('admin', 'operador'));
drop policy if exists inv_update on public.invoices;
create policy inv_update on public.invoices
  for update to authenticated
  using (public.current_user_role() in ('admin', 'operador'))
  with check (public.current_user_role() in ('admin', 'operador'));
drop policy if exists inv_delete on public.invoices;
create policy inv_delete on public.invoices
  for delete to authenticated
  using (public.current_user_role() = 'admin');

-- payments
drop policy if exists pay_select on public.payments;
create policy pay_select on public.payments
  for select to authenticated using (true);
drop policy if exists pay_write on public.payments;
create policy pay_write on public.payments
  for insert to authenticated
  with check (public.current_user_role() in ('admin', 'operador'));
drop policy if exists pay_update on public.payments;
create policy pay_update on public.payments
  for update to authenticated
  using (public.current_user_role() in ('admin', 'operador'))
  with check (public.current_user_role() in ('admin', 'operador'));
drop policy if exists pay_delete on public.payments;
create policy pay_delete on public.payments
  for delete to authenticated
  using (public.current_user_role() = 'admin');

-- audit_logs: cualquiera puede insertar (la app registra acciones).
-- Solo admin lee. Nadie actualiza ni borra.
drop policy if exists audit_insert on public.audit_logs;
create policy audit_insert on public.audit_logs
  for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists audit_select_admin on public.audit_logs;
create policy audit_select_admin on public.audit_logs
  for select to authenticated
  using (public.current_user_role() = 'admin');

-- settings: lectura libre, escritura admin
drop policy if exists settings_select on public.settings;
create policy settings_select on public.settings
  for select to authenticated using (true);
drop policy if exists settings_admin on public.settings;
create policy settings_admin on public.settings
  for all to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- ============================================================================
-- FIN
-- ============================================================================
