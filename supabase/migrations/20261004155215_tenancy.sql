-- Fase 1 (T003): barberías (inquilinos) y perfiles de usuario con su rol.
-- Políticas según specs/001-modelo-datos-rls/contracts/acceso-por-rol.md.
-- Toda operación sin política está denegada por RLS.

-- ---------------------------------------------------------------------------
-- barbershops
-- ---------------------------------------------------------------------------
create table public.barbershops (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  subdomain text not null unique
    check (subdomain ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$')
    check (subdomain not in ('www', 'app', 'api', 'admin')),
  timezone text not null default 'America/Bogota'
    check (private.is_valid_timezone(timezone)),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on column public.barbershops.subdomain is
  'Identifica la barbería en la URL. Minúsculas, números y guiones; www, app, api y admin reservados.';
comment on column public.barbershops.timezone is
  'Zona IANA de la barbería. Las fechas se guardan en UTC y se convierten a esta zona solo al mostrar o recibir.';

-- ---------------------------------------------------------------------------
-- profiles: vincula un usuario de Supabase Auth con su rol y su barbería
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null,
  barbershop_id uuid references public.barbershops (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- El super admin no pertenece a ninguna barbería; un admin pertenece a exactamente una.
  constraint profiles_role_barbershop_check
    check ((role = 'super_admin') = (barbershop_id is null))
);

create index profiles_barbershop_id_idx on public.profiles (barbershop_id);

-- ---------------------------------------------------------------------------
-- Funciones auxiliares para las políticas (research §1).
-- security definer: leen profiles sin depender de sus propias políticas.
-- Las políticas las llaman como (select ...) para evaluarlas una vez por consulta.
-- ---------------------------------------------------------------------------

-- Barbería del usuario con sesión; null si no tiene sesión, no tiene perfil, es super admin
-- o su barbería está desactivada (is_active = false): desactivar una barbería corta el acceso
-- de sus admins a todos sus datos (SEC-006). No afecta al super admin.
create function private.current_barbershop_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.barbershop_id
  from public.profiles p
  join public.barbershops b on b.id = p.barbershop_id
  where p.user_id = auth.uid()
    and b.is_active;
$$;

-- true si el usuario con sesión es super admin.
create function private.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.role = 'super_admin'
  );
$$;

revoke execute on function private.current_barbershop_id() from public, anon;
revoke execute on function private.is_super_admin() from public, anon;
grant execute on function private.current_barbershop_id() to authenticated;
grant execute on function private.is_super_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: barbershops
-- admin: SELECT de la propia. super_admin: todo sobre todas.
-- ---------------------------------------------------------------------------
alter table public.barbershops enable row level security;
revoke all on table public.barbershops from anon;
-- RLS no cubre TRUNCATE; TRIGGER y REFERENCES tampoco hacen falta con sesión (SEC-003).
revoke truncate, trigger, references on table public.barbershops from authenticated;

create policy barbershops_select on public.barbershops
  for select to authenticated
  using (
    id = (select private.current_barbershop_id())
    or (select private.is_super_admin())
  );

create policy barbershops_insert on public.barbershops
  for insert to authenticated
  with check ((select private.is_super_admin()));

create policy barbershops_update on public.barbershops
  for update to authenticated
  using ((select private.is_super_admin()))
  with check ((select private.is_super_admin()));

create policy barbershops_delete on public.barbershops
  for delete to authenticated
  using ((select private.is_super_admin()));

-- ---------------------------------------------------------------------------
-- RLS: profiles
-- Cada usuario ve su propio perfil; el super admin ve todos.
-- Nadie con sesión crea, modifica ni borra perfiles: sin políticas de INSERT,
-- UPDATE ni DELETE (denegado). Los perfiles los crea el servidor (clave secreta) o seed.sql.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
revoke all on table public.profiles from anon;
revoke truncate, trigger, references on table public.profiles from authenticated;

create policy profiles_select on public.profiles
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.is_super_admin())
  );
