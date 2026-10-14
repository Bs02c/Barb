-- migrate:up

-- Línea base del esquema (spec 005, ADR-017).
-- Excepción única de la constitución 1.2.0: sustituye a las 6 migraciones de Supabase
-- (supabase/migrations/), aplicadas solo en local. Desde aquí, nunca se edita una migración
-- aplicada: se crea una nueva.
--
-- Se aplica con dbmate como `db_owner` y con search_path=dbmate,public: todos los nombres van
-- calificados con su esquema. Los roles (db_owner, app_login, authenticated, service_role,
-- auth_login, db_backup) los crea db/init/roles.sh antes de esta migración.
--
-- Operaciones por rol (decididas aquí, tabla a tabla):
--   authenticated = admin de barbería con sesión (identidad en app.user_id; RLS por barbería)
--   service_role  = backend de la reserva pública (BYPASSRLS; solo los privilegios de abajo)
--   auth_login    = Better Auth; solo el esquema identity
--   app_login     = login del pool; sin privilegios propios (cambia de rol con SET LOCAL ROLE)
-- Toda operación sin política (o sin privilegio) queda denegada.

-- ---------------------------------------------------------------------------
-- Base, esquemas y extensiones
-- ---------------------------------------------------------------------------
-- Solo los roles de la lista pueden conectarse (PUBLIC no).
revoke connect on database barberias from public;
grant connect on database barberias to app_login, auth_login, db_owner, db_backup;

-- Las funciones nuevas de db_owner nacen sin EXECUTE para PUBLIC (estrecha, no amplía).
alter default privileges for role db_owner revoke execute on functions from public;

alter schema public owner to db_owner;
revoke all on schema public from public;
grant usage on schema public to authenticated, service_role;

-- extensions: lo crea roles.sh (pg_stat_statements); aquí solo se asegura. Nadie más lo usa.
create schema if not exists extensions;
-- btree_gist permite combinar igualdad (barber_id) y solapamiento de rangos en una misma
-- restricción de exclusión (citas y tramos de horario).
create extension if not exists btree_gist with schema extensions;

-- Funciones auxiliares que usan las políticas RLS.
create schema private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- Tablas de Better Auth. Solo auth_login las toca.
create schema identity;
revoke all on schema identity from public;
grant usage on schema identity to auth_login;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
-- Roles con sesión en el MVP. El cliente final no tiene cuenta.
create type public.user_role as enum ('super_admin', 'admin');

-- Estados de una cita. Única transición: active -> cancelled.
create type public.appointment_status as enum ('active', 'cancelled');

-- Rango sobre "time" para impedir tramos de horario semanal solapados.
-- Uso: private.timerange(start_time, end_time, '[)').
create type private.timerange as range (subtype = time);

-- ---------------------------------------------------------------------------
-- Identidad del admin (sustituye a auth.uid() de Supabase)
-- La app fija app.user_id con set_config(..., true) dentro de la transacción del panel.
-- ---------------------------------------------------------------------------
create function private.current_user_id()
returns uuid
language sql
stable
set search_path = ''
as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

revoke execute on function private.current_user_id() from public;
grant execute on function private.current_user_id() to authenticated;

-- Devuelve true si "tz" es una zona horaria que Postgres reconoce (p. ej. 'America/Bogota').
-- Se declara immutable para poder usarla en un check; la lista de zonas solo cambia al
-- actualizar Postgres (research §6).
create function private.is_valid_timezone(tz text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  perform now() at time zone tz;
  return true;
exception
  when invalid_parameter_value then
    return false;
end;
$$;

-- El check de barbershops solo se evalúa al escribir barberías, y las barberías solo las escribe
-- db_owner (script de alta): ningún rol de la app necesita EXECUTE.
revoke execute on function private.is_valid_timezone(text) from public;

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
-- Better Auth (esquema identity). Columnas por defecto de Better Auth 1.7.7 con ids uuid
-- (generateId: "uuid"). Solo auth_login tiene privilegios (ver el final del archivo).
-- ---------------------------------------------------------------------------
create table identity."user" (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  "emailVerified" boolean not null default false,
  image text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table identity.session (
  id uuid primary key default gen_random_uuid(),
  "expiresAt" timestamptz not null,
  token text not null unique,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  "ipAddress" text,
  "userAgent" text,
  "userId" uuid not null references identity."user" (id) on delete cascade
);
create index session_user_id_idx on identity.session ("userId");
create index session_expires_at_idx on identity.session ("expiresAt"); -- limpieza de caducadas

create table identity.account (
  id uuid primary key default gen_random_uuid(),
  "accountId" text not null,
  "providerId" text not null,
  "userId" uuid not null references identity."user" (id) on delete cascade,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope text,
  password text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  constraint account_provider_account_key unique ("providerId", "accountId")
);
create index account_user_id_idx on identity.account ("userId");

create table identity.verification (
  id uuid primary key default gen_random_uuid(),
  identifier text not null,
  value text not null,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create index verification_identifier_idx on identity.verification (identifier);

create table identity."rateLimit" (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  count integer not null,
  "lastRequest" bigint not null
);

-- ---------------------------------------------------------------------------
-- profiles: vincula un usuario de identity con su rol y su barbería
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key references identity."user" (id) on delete cascade,
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
-- security definer (dueño db_owner, dueño de profiles y por tanto exento de RLS): leen profiles
-- sin depender de sus propias políticas. Las políticas las llaman como (select ...) para
-- evaluarlas una vez por consulta.
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
  where p.user_id = (select private.current_user_id())
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
    where p.user_id = (select private.current_user_id())
      and p.role = 'super_admin'
  );
$$;

revoke execute on function private.current_barbershop_id() from public;
revoke execute on function private.is_super_admin() from public;
grant execute on function private.current_barbershop_id() to authenticated;
grant execute on function private.is_super_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- barbers
-- ---------------------------------------------------------------------------
create table public.barbers (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  -- Destino de las FK compuestas de las tablas hijas.
  constraint barbers_id_barbershop_id_key unique (id, barbershop_id)
);

create index barbers_barbershop_id_idx on public.barbers (barbershop_id);

-- ---------------------------------------------------------------------------
-- services
-- ---------------------------------------------------------------------------
create table public.services (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  duration_minutes integer not null check (duration_minutes between 1 and 480),
  price numeric(12, 2) not null check (price >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint services_id_barbershop_id_key unique (id, barbershop_id)
);

create index services_barbershop_id_idx on public.services (barbershop_id);

-- ---------------------------------------------------------------------------
-- barber_schedules: tramos del horario semanal, en hora LOCAL de la barbería
-- ---------------------------------------------------------------------------
create table public.barber_schedules (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops (id) on delete cascade,
  barber_id uuid not null,
  weekday smallint not null check (weekday between 1 and 7), -- ISO: 1 = lunes … 7 = domingo
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  constraint barber_schedules_barber_fkey
    foreign key (barber_id, barbershop_id)
    references public.barbers (id, barbershop_id) on delete cascade,
  constraint barber_schedules_time_order_check check (end_time > start_time),
  -- Un barbero no puede tener dos tramos solapados el mismo día ([) permite tramos contiguos).
  constraint barber_schedules_no_overlap
    exclude using gist (
      barber_id with =,
      weekday with =,
      private.timerange(start_time, end_time, '[)') with &&
    )
);

comment on table public.barber_schedules is
  'Horario semanal por tramos. start_time y end_time están en hora local de la barbería (barbershops.timezone), no en UTC.';

create index barber_schedules_barbershop_id_idx on public.barber_schedules (barbershop_id);

-- ---------------------------------------------------------------------------
-- barber_blocks: ausencias puntuales (vacaciones, citas médicas…), en UTC
-- ---------------------------------------------------------------------------
create table public.barber_blocks (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops (id) on delete cascade,
  barber_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text check (char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  constraint barber_blocks_barber_fkey
    foreign key (barber_id, barbershop_id)
    references public.barbers (id, barbershop_id) on delete cascade,
  constraint barber_blocks_time_order_check check (ends_at > starts_at)
);

create index barber_blocks_barbershop_id_starts_at_idx on public.barber_blocks (barbershop_id, starts_at);
create index barber_blocks_barber_id_idx on public.barber_blocks (barber_id);

-- ---------------------------------------------------------------------------
-- appointments
-- - FK compuestas: barbero y servicio deben ser de la misma barbería que la cita.
-- - Exclusión: dos citas activas del mismo barbero no se solapan; las canceladas no bloquean.
--   Error de Postgres al violarla: 23P01 (exclusion_violation), constraint appointments_no_overlap.
-- - Duración y precio del servicio se copian en la cita al reservar (FR-012).
-- ---------------------------------------------------------------------------
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops (id) on delete cascade,
  barber_id uuid not null,
  service_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  service_duration_minutes integer not null check (service_duration_minutes between 1 and 480),
  service_price numeric(12, 2) not null check (service_price >= 0),
  status public.appointment_status not null default 'active',
  cancelled_at timestamptz,
  customer_name text not null check (char_length(customer_name) between 1 and 100),
  customer_phone text not null check (customer_phone ~ '^\+[1-9][0-9]{7,14}$'), -- E.164
  customer_email text not null
    check (char_length(customer_email) <= 254)
    check (customer_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  data_consent_at timestamptz not null, -- autorización de tratamiento de datos (Ley 1581 de 2012)
  created_at timestamptz not null default now(),

  -- NO ACTION (por defecto) y no RESTRICT: NO ACTION se comprueba al final de la sentencia.
  -- Así, borrar la barbería borra en cascada sus citas, barberos y servicios sin error,
  -- y borrar directamente un barbero o servicio con citas se sigue rechazando (23503).
  constraint appointments_barber_fkey
    foreign key (barber_id, barbershop_id)
    references public.barbers (id, barbershop_id) on delete no action,
  constraint appointments_service_fkey
    foreign key (service_id, barbershop_id)
    references public.services (id, barbershop_id) on delete no action,

  constraint appointments_time_order_check check (ends_at > starts_at),
  constraint appointments_duration_check
    check (ends_at = starts_at + service_duration_minutes * interval '1 minute'),
  constraint appointments_cancelled_at_check
    check ((status = 'cancelled') = (cancelled_at is not null)),

  constraint appointments_no_overlap
    exclude using gist (
      barber_id with =,
      tstzrange(starts_at, ends_at, '[)') with &&
    ) where (status = 'active')
);

-- Agenda de una barbería por fechas.
create index appointments_barbershop_id_starts_at_idx on public.appointments (barbershop_id, starts_at);
-- Agenda de un barbero por fechas y FK a barbers: el índice de la exclusión no sirve para la FK
-- porque es parcial (solo citas activas) y no ve las canceladas (PERF-001).
create index appointments_barber_id_starts_at_idx on public.appointments (barber_id, starts_at);
-- Búsqueda de las citas de un cliente por teléfono o correo dentro de la barbería:
-- solicitudes de borrado de datos y tope de citas activas por teléfono (FR-014).
create index appointments_barbershop_id_customer_phone_idx on public.appointments (barbershop_id, customer_phone);
create index appointments_barbershop_id_customer_email_idx on public.appointments (barbershop_id, customer_email);
-- FK a services (comprobación al borrar un servicio).
create index appointments_service_id_idx on public.appointments (service_id);

-- Spec 003: token de cancelación de la cita. Solo se guarda el hash; el token en claro nunca
-- se almacena (FR-003).
alter table public.appointments
  add column cancel_token_hash bytea
    constraint appointments_cancel_token_hash_length check (octet_length(cancel_token_hash) = 32);

create unique index appointments_cancel_token_hash_key
  on public.appointments (cancel_token_hash)
  where cancel_token_hash is not null;

comment on column public.appointments.cancel_token_hash is
  'SHA-256 (32 bytes) del token de cancelación enviado por correo. El token en claro nunca se guarda (spec 003 FR-003). Null en citas sin token (seed y anteriores).';

comment on table public.appointments is
  'Citas. Permisos de columna: authenticated actualiza solo status y cancelled_at; cancel_token_hash solo lo escribe el backend con service_role.';

-- ---------------------------------------------------------------------------
-- Una cita cancelada no vuelve a estar activa (para todos los roles, también el servidor).
-- Error: SQLSTATE 23514 (check_violation), constraint appointments_status_transition,
-- mensaje 'una cita cancelada no puede reactivarse'. Para cambiar la hora se crea una cita nueva.
-- ---------------------------------------------------------------------------
create function private.appointments_prevent_reactivation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'cancelled' and new.status = 'active' then
    raise exception 'una cita cancelada no puede reactivarse'
      using errcode = 'check_violation',
            constraint = 'appointments_status_transition',
            detail = format('appointment id %s', old.id);
  end if;
  return new;
end;
$$;

revoke execute on function private.appointments_prevent_reactivation() from public;

create trigger appointments_prevent_reactivation
  before update of status on public.appointments
  for each row
  execute function private.appointments_prevent_reactivation();

-- ---------------------------------------------------------------------------
-- Tope de citas activas futuras por número de teléfono y barbería, aplicado en la base de datos.
--
-- Motivo: book.ts cuenta y luego inserta (dos pasos). Con reservas simultáneas del mismo número
-- todas ven 0 citas y se guardan todas (research §4 revisado, 2026-10-06). El trigger se pone en
-- fila por (barbería, número) con un candado de transacción, cuenta y rechaza la tercera.
-- El candado se libera al terminar la transacción. La función es VOLATILE (por defecto) para que
-- el count tome una instantánea nueva tras el candado y vea lo que la otra transacción confirmó.
--
-- El 2 debe coincidir con MAX_ACTIVE_PER_PHONE en src/lib/booking/book.ts: cambiar ambos a la vez.
-- Error: SQLSTATE 23514 (check_violation), constraint appointments_phone_limit.
-- ---------------------------------------------------------------------------
create function private.appointments_enforce_phone_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'active' and new.starts_at > now() then
    perform pg_advisory_xact_lock(
      hashtextextended(new.barbershop_id::text || ':' || new.customer_phone, 0));

    if (select count(*)
          from public.appointments a
         where a.barbershop_id = new.barbershop_id
           and a.customer_phone = new.customer_phone
           and a.status = 'active'
           and a.starts_at > now()) >= 2 then
      raise exception 'tope de citas activas por número (appointments_phone_limit)'
        using errcode = 'check_violation',
              constraint = 'appointments_phone_limit';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function private.appointments_enforce_phone_limit() from public;

create trigger appointments_phone_limit
  before insert on public.appointments
  for each row
  execute function private.appointments_enforce_phone_limit();

-- ---------------------------------------------------------------------------
-- RLS (research §1): activado en todas las tablas de negocio.
-- ---------------------------------------------------------------------------
alter table public.barbershops enable row level security;
alter table public.profiles enable row level security;
alter table public.barbers enable row level security;
alter table public.services enable row level security;
alter table public.barber_schedules enable row level security;
alter table public.barber_blocks enable row level security;
alter table public.appointments enable row level security;

-- barbershops: el admin ve la suya; el super admin ve todas.
-- Las políticas barbershops_insert/update/delete del super admin de Supabase se ELIMINAN: sin
-- privilegio de escritura serían código muerto, y el alta de barberías va solo por el script
-- del dueño (db_owner; ADR-017 §3: "solo lo que usa el código"). INSERT, UPDATE y DELETE
-- quedan denegados por privilegio y por ausencia de política.
create policy barbershops_select on public.barbershops
  for select to authenticated
  using (
    id = (select private.current_barbershop_id())
    or (select private.is_super_admin())
  );

-- profiles: cada usuario ve su propio perfil; el super admin ve todos.
-- Nadie con sesión crea, modifica ni borra perfiles: sin privilegios ni políticas de INSERT,
-- UPDATE ni DELETE (denegado). Los perfiles los crea db_owner (script de alta o seed).
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    user_id = (select private.current_user_id())
    or (select private.is_super_admin())
  );

-- barbers, services, barber_schedules y barber_blocks: barbería propia del admin.
-- with check en INSERT y UPDATE impide crear o mover registros a otra barbería.
-- El super admin no ve estas tablas (mínimo privilegio).
create policy barbers_select on public.barbers
  for select to authenticated
  using (barbershop_id = (select private.current_barbershop_id()));
create policy barbers_insert on public.barbers
  for insert to authenticated
  with check (barbershop_id = (select private.current_barbershop_id()));
create policy barbers_update on public.barbers
  for update to authenticated
  using (barbershop_id = (select private.current_barbershop_id()))
  with check (barbershop_id = (select private.current_barbershop_id()));
create policy barbers_delete on public.barbers
  for delete to authenticated
  using (barbershop_id = (select private.current_barbershop_id()));

create policy services_select on public.services
  for select to authenticated
  using (barbershop_id = (select private.current_barbershop_id()));
create policy services_insert on public.services
  for insert to authenticated
  with check (barbershop_id = (select private.current_barbershop_id()));
create policy services_update on public.services
  for update to authenticated
  using (barbershop_id = (select private.current_barbershop_id()))
  with check (barbershop_id = (select private.current_barbershop_id()));
create policy services_delete on public.services
  for delete to authenticated
  using (barbershop_id = (select private.current_barbershop_id()));

create policy barber_schedules_select on public.barber_schedules
  for select to authenticated
  using (barbershop_id = (select private.current_barbershop_id()));
create policy barber_schedules_insert on public.barber_schedules
  for insert to authenticated
  with check (barbershop_id = (select private.current_barbershop_id()));
create policy barber_schedules_update on public.barber_schedules
  for update to authenticated
  using (barbershop_id = (select private.current_barbershop_id()))
  with check (barbershop_id = (select private.current_barbershop_id()));
create policy barber_schedules_delete on public.barber_schedules
  for delete to authenticated
  using (barbershop_id = (select private.current_barbershop_id()));

create policy barber_blocks_select on public.barber_blocks
  for select to authenticated
  using (barbershop_id = (select private.current_barbershop_id()));
create policy barber_blocks_insert on public.barber_blocks
  for insert to authenticated
  with check (barbershop_id = (select private.current_barbershop_id()));
create policy barber_blocks_update on public.barber_blocks
  for update to authenticated
  using (barbershop_id = (select private.current_barbershop_id()))
  with check (barbershop_id = (select private.current_barbershop_id()));
create policy barber_blocks_delete on public.barber_blocks
  for delete to authenticated
  using (barbershop_id = (select private.current_barbershop_id()));

-- appointments: el admin ve y cancela las citas de su barbería.
-- Sin políticas de INSERT ni DELETE: las citas las crea la reserva pública desde el servidor
-- (service_role) y una cita cancelada se conserva.
-- Con sesión solo se pueden modificar status y cancelled_at (SEC-001, privilegio de columna).
create policy appointments_select on public.appointments
  for select to authenticated
  using (barbershop_id = (select private.current_barbershop_id()));

create policy appointments_update on public.appointments
  for update to authenticated
  using (barbershop_id = (select private.current_barbershop_id()))
  with check (barbershop_id = (select private.current_barbershop_id()));

-- ---------------------------------------------------------------------------
-- identity: RLS activado. auth_login no es dueño ni tiene BYPASSRLS, así que sin una política
-- RLS le negaría todo y Better Auth no funcionaría. Cada tabla tiene UNA política, solo para
-- auth_login; el resto de roles no tiene ni privilegios ni política (denegado dos veces).
-- ---------------------------------------------------------------------------
alter table identity."user" enable row level security;
alter table identity.session enable row level security;
alter table identity.account enable row level security;
alter table identity.verification enable row level security;
alter table identity."rateLimit" enable row level security;

create policy user_auth_login on identity."user" for all to auth_login using (true) with check (true);
create policy session_auth_login on identity.session for all to auth_login using (true) with check (true);
create policy account_auth_login on identity.account for all to auth_login using (true) with check (true);
create policy verification_auth_login on identity.verification for all to auth_login using (true) with check (true);
create policy rate_limit_auth_login on identity."rateLimit" for all to auth_login using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Privilegios EXACTOS por rol (data-model.md §Privilegios). Solo lo que usa el código.
-- Sin TRUNCATE, TRIGGER ni REFERENCES para nadie; sin GRANT ALL.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from public, authenticated, service_role;
revoke all on all tables in schema identity from public, authenticated, service_role;

-- authenticated (panel)
grant select on public.barbershops to authenticated;
grant select on public.profiles to authenticated;
grant select, insert, delete on public.barbers to authenticated;
grant update (name, is_active) on public.barbers to authenticated;
grant select, insert, delete on public.services to authenticated;
grant update (name, duration_minutes, price, is_active) on public.services to authenticated;
grant select, insert, delete on public.barber_schedules to authenticated;
grant select, insert, delete on public.barber_blocks to authenticated;
grant select on public.appointments to authenticated;
grant update (status, cancelled_at) on public.appointments to authenticated;

-- service_role (reserva, cancelación y lecturas públicas). Ningún privilegio sobre profiles.
grant select on public.barbershops to service_role;
grant select on public.barbers to service_role;
grant select on public.services to service_role;
grant select on public.barber_schedules to service_role;
grant select on public.barber_blocks to service_role;
grant select, insert on public.appointments to service_role;
grant update (status, cancelled_at) on public.appointments to service_role;

-- auth_login (Better Auth)
grant select, insert, update, delete on identity."user" to auth_login;
grant select, insert, update, delete on identity.session to auth_login;
grant select, insert, update, delete on identity.account to auth_login;
grant select, insert, update, delete on identity.verification to auth_login;
grant select, insert, update, delete on identity."rateLimit" to auth_login;

-- migrate:down

-- Solo para local. Elimina lo creado por esta migración. El esquema extensions y
-- pg_stat_statements los crea roles.sh, así que solo se quita btree_gist.
drop table if exists identity."rateLimit", identity.verification, identity.account, identity.session cascade;
drop table if exists public.appointments, public.barber_blocks, public.barber_schedules,
  public.services, public.barbers, public.profiles, public.barbershops cascade;
drop table if exists identity."user" cascade;
drop schema if exists private cascade;
drop schema if exists identity cascade;
drop type if exists public.appointment_status;
drop type if exists public.user_role;
drop extension if exists btree_gist cascade;
revoke all on schema public from authenticated, service_role;
grant usage on schema public to public;
alter default privileges for role db_owner grant execute on functions to public;
grant connect on database barberias to public;
