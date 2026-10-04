-- Fase 1 (T004): barberos, servicios, horario semanal y bloqueos.
-- Cada tabla pertenece a una barbería. Las tablas hijas referencian (barber_id, barbershop_id)
-- con FK compuesta: la base de datos rechaza apuntar a un barbero de otra barbería (research §3).
-- Políticas: el admin hace SELECT, INSERT, UPDATE y DELETE solo en su barbería;
-- el super admin no ve estas tablas (mínimo privilegio).

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
-- RLS: misma regla en las cuatro tablas (barbería propia del admin).
-- with check en INSERT y UPDATE impide crear o mover registros a otra barbería.
-- ---------------------------------------------------------------------------
alter table public.barbers enable row level security;
revoke all on table public.barbers from anon;
revoke truncate, trigger, references on table public.barbers from authenticated;

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

alter table public.services enable row level security;
revoke all on table public.services from anon;
revoke truncate, trigger, references on table public.services from authenticated;

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

alter table public.barber_schedules enable row level security;
revoke all on table public.barber_schedules from anon;
revoke truncate, trigger, references on table public.barber_schedules from authenticated;

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

alter table public.barber_blocks enable row level security;
revoke all on table public.barber_blocks from anon;
revoke truncate, trigger, references on table public.barber_blocks from authenticated;

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
