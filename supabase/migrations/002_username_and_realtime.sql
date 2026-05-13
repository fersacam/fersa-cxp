-- ============================================================================
-- Migración 002:
--   1. Login por nombre de usuario (columna `username` en profiles + RPC)
--   2. Notificaciones realtime para facturas y pagos
--   3. Trazabilidad: `created_by` en invoices
-- Aplicar en el SQL Editor de Supabase.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Columna username en profiles
-- ----------------------------------------------------------------------------
alter table public.profiles add column if not exists username text;

-- Índice único (case-insensitive) — usamos lower() para evitar duplicados por mayúsculas
create unique index if not exists profiles_username_unique
  on public.profiles (lower(username))
  where username is not null;

-- Backfill: usuarios existentes -> username = parte local del email
update public.profiles p
set username = lower(split_part(u.email, '@', 1))
from auth.users u
where p.id = u.id and (p.username is null or p.username = '');

-- ----------------------------------------------------------------------------
-- 2. Trigger handle_new_user actualizado para incluir username
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'viewer'),
    coalesce(
      lower(new.raw_user_meta_data->>'username'),
      lower(split_part(new.email, '@', 1))
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. RPC: dado un username, devolver el email (para login sin exponer auth.users)
--    SECURITY DEFINER → corre con permisos del owner, salta RLS.
--    Devuelve NULL si el usuario no existe o está desactivado.
-- ----------------------------------------------------------------------------
create or replace function public.get_email_by_username(p_username text)
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.email
  from auth.users u
  join public.profiles p on p.id = u.id
  where lower(p.username) = lower(p_username)
    and p.active = true
  limit 1;
$$;

revoke all on function public.get_email_by_username(text) from public;
grant execute on function public.get_email_by_username(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. Política para que el propio usuario pueda editar su username
--    (la política profiles_self_update ya existe pero bloqueaba cambio de rol)
-- ----------------------------------------------------------------------------
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select role from public.profiles where id = auth.uid())
    and active = (select active from public.profiles where id = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- 5. invoices.created_by (para filtrar notificaciones realtime del propio usuario)
-- ----------------------------------------------------------------------------
alter table public.invoices
  add column if not exists created_by uuid references auth.users(id) on delete set null;

-- ----------------------------------------------------------------------------
-- 6. Realtime: habilitar invoices y payments en la publicación supabase_realtime
--    Se envuelve en DO para que no rompa si ya están añadidas.
-- ----------------------------------------------------------------------------
do $$
begin
  begin
    alter publication supabase_realtime add table public.invoices;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.payments;
  exception when duplicate_object then null;
  end;
end $$;
