-- T010 (historia 3): las horas se guardan en UTC y se recuperan en la hora local de la barbería.
begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

-- La zona de la sesión no debe influir en lo que se guarda: se fuerza una distinta a la de la barbería.
set local timezone = 'Asia/Tokyo';

insert into public.barbershops (id, name, subdomain, timezone) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Test zona', 'test-zona', 'America/Bogota');
insert into public.barbers (id, barbershop_id, name) values
  ('aaaaaaaa-0000-4000-8000-0000000000b1', 'aaaaaaaa-0000-4000-8000-000000000001', 'X');
insert into public.services (id, barbershop_id, name, duration_minutes, price) values
  ('aaaaaaaa-0000-4000-8000-0000000000c1', 'aaaaaaaa-0000-4000-8000-000000000001', 'Corte', 30, 20000);

-- Cita a las 10:00 hora local de la barbería, convertida con la zona guardada en barbershops.
insert into public.appointments (
  id, barbershop_id, barber_id, service_id, starts_at, ends_at,
  service_duration_minutes, service_price, customer_name, customer_phone, customer_email, data_consent_at)
select
  'aaaaaaaa-0000-4000-8000-0000000000f1', b.id, 'aaaaaaaa-0000-4000-8000-0000000000b1',
  'aaaaaaaa-0000-4000-8000-0000000000c1',
  timestamp '2030-01-07 10:00' at time zone b.timezone,
  timestamp '2030-01-07 10:00' at time zone b.timezone + interval '30 minutes',
  30, 20000, 'Cliente', '+573001234567', 'cliente@test.example.com', now()
from public.barbershops b
where b.id = 'aaaaaaaa-0000-4000-8000-000000000001';

-- Escenario 1: 10:00 en Bogotá (UTC−5) se guarda como 15:00 UTC
select is(
  (select starts_at from public.appointments where id = 'aaaaaaaa-0000-4000-8000-0000000000f1'),
  '2030-01-07 15:00:00+00'::timestamptz,
  '10:00 hora de Bogotá se guarda como 15:00 UTC'
);
select is(
  (select to_char(starts_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI')
   from public.appointments where id = 'aaaaaaaa-0000-4000-8000-0000000000f1'),
  '2030-01-07 15:00',
  'en UTC la cita es a las 15:00'
);

-- SC-003: se recupera exactamente como 10:00 hora local
select is(
  (select a.starts_at at time zone b.timezone
   from public.appointments a
   join public.barbershops b on b.id = a.barbershop_id
   where a.id = 'aaaaaaaa-0000-4000-8000-0000000000f1'),
  timestamp '2030-01-07 10:00',
  'se recupera como 10:00 hora local de la barbería'
);

-- Escenario 2: zona horaria inválida se rechaza
select throws_ok(
  $$ insert into public.barbershops (name, subdomain, timezone) values ('Mala', 'test-mala', 'Mars/Olympus') $$,
  '23514', null, 'zona horaria inexistente: rechazada'
);
select throws_ok(
  $$ insert into public.barbershops (name, subdomain, timezone) values ('Vacía', 'test-vacia', '') $$,
  '23514', null, 'zona horaria vacía: rechazada'
);
select is(
  (select timezone from public.barbershops where id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  'America/Bogota',
  'la barbería guarda su zona IANA'
);

-- Escenario 3: el horario semanal es hora local, no se desplaza con la zona de la sesión
insert into public.barber_schedules (barbershop_id, barber_id, weekday, start_time, end_time) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000b1', 1, '09:00', '18:00');
set local timezone = 'UTC';
select results_eq(
  $$ select start_time, end_time from public.barber_schedules
     where barbershop_id = 'aaaaaaaa-0000-4000-8000-000000000001' $$,
  $$ values (time '09:00', time '18:00') $$,
  'el horario 09:00–18:00 se conserva en hora local'
);

select * from finish();
rollback;
