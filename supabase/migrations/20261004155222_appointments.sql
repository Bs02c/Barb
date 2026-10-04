-- Fase 1 (T005): citas.
-- - FK compuestas: barbero y servicio deben ser de la misma barbería que la cita.
-- - Exclusión: dos citas activas del mismo barbero no se solapan; las canceladas no bloquean.
--   Error de Postgres al violarla: 23P01 (exclusion_violation), constraint appointments_no_overlap.
-- - Duración y precio del servicio se copian en la cita al reservar (FR-012).
-- - Pendiente de la fase 4: que la cita caiga dentro del horario y fuera de bloqueos (research §5).

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

revoke execute on function private.appointments_prevent_reactivation() from public, anon;

create trigger appointments_prevent_reactivation
  before update of status on public.appointments
  for each row
  execute function private.appointments_prevent_reactivation();

-- ---------------------------------------------------------------------------
-- RLS: el admin ve y cancela las citas de su barbería.
-- Sin políticas de INSERT ni DELETE: las citas las crea la reserva pública desde el
-- servidor (clave secreta) y una cita cancelada se conserva.
-- Con sesión solo se pueden modificar status y cancelled_at (SEC-001): los datos del
-- cliente, el consentimiento, el precio, la hora y el barbero no se tocan desde el panel.
-- ---------------------------------------------------------------------------
alter table public.appointments enable row level security;
revoke all on table public.appointments from anon;
revoke truncate, trigger, references on table public.appointments from authenticated;
revoke update on table public.appointments from authenticated;
grant update (status, cancelled_at) on table public.appointments to authenticated;

create policy appointments_select on public.appointments
  for select to authenticated
  using (barbershop_id = (select private.current_barbershop_id()));

create policy appointments_update on public.appointments
  for update to authenticated
  using (barbershop_id = (select private.current_barbershop_id()))
  with check (barbershop_id = (select private.current_barbershop_id()));
