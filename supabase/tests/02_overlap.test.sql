-- T008 (historia 2): un barbero no puede tener dos citas activas solapadas.
-- La simultaneidad real (escenario 5) la prueba tests/integration/appointments-concurrency.test.ts.
-- Error esperado al solapar: 23P01 (exclusion_violation).
begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

-- Datos de prueba: una barbería, barberos X e Y, un servicio de 30 minutos.
insert into public.barbershops (id, name, subdomain) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Test solapes', 'test-solapes');
insert into public.barbers (id, barbershop_id, name) values
  ('aaaaaaaa-0000-4000-8000-0000000000b1', 'aaaaaaaa-0000-4000-8000-000000000001', 'X'),
  ('aaaaaaaa-0000-4000-8000-0000000000b2', 'aaaaaaaa-0000-4000-8000-000000000001', 'Y');
insert into public.services (id, barbershop_id, name, duration_minutes, price) values
  ('aaaaaaaa-0000-4000-8000-0000000000c1', 'aaaaaaaa-0000-4000-8000-000000000001', 'Corte', 30, 20000);

-- Inserta una cita de 30 minutos que empieza a la hora local indicada (Bogotá) del 2030-01-07.
create temp sequence phone_seq;
create function pg_temp.book(p_barber uuid, p_local_start text)
returns uuid
language sql
as $$
  insert into public.appointments (
    barbershop_id, barber_id, service_id, starts_at, ends_at,
    service_duration_minutes, service_price, customer_name, customer_phone, customer_email, data_consent_at)
  values (
    'aaaaaaaa-0000-4000-8000-000000000001', p_barber, 'aaaaaaaa-0000-4000-8000-0000000000c1',
    ('2030-01-07 ' || p_local_start)::timestamp at time zone 'America/Bogota',
    ('2030-01-07 ' || p_local_start)::timestamp at time zone 'America/Bogota' + interval '30 minutes',
    30, 20000, 'Cliente', '+5730000' || lpad(nextval('pg_temp.phone_seq')::text, 5, '0'), 'cliente@test.example.com', now())
  returning id;
$$;

-- Cita base: 10:00–10:30 con X
select lives_ok(
  $$ select pg_temp.book('aaaaaaaa-0000-4000-8000-0000000000b1', '10:00') $$,
  'cita base 10:00–10:30 con X'
);

-- Escenario 1: 10:15–10:45 con X se rechaza
select throws_ok(
  $$ select pg_temp.book('aaaaaaaa-0000-4000-8000-0000000000b1', '10:15') $$,
  '23P01', null, 'solapada 10:15–10:45 con X: rechazada (23P01)'
);

-- Mismo inicio y fin exactos también se rechaza
select throws_ok(
  $$ select pg_temp.book('aaaaaaaa-0000-4000-8000-0000000000b1', '10:00') $$,
  '23P01', null, 'idéntica 10:00–10:30 con X: rechazada (23P01)'
);

-- Escenario 2: contigua 10:30–11:00 con X se acepta
select lives_ok(
  $$ select pg_temp.book('aaaaaaaa-0000-4000-8000-0000000000b1', '10:30') $$,
  'contigua 10:30–11:00 con X: aceptada'
);

-- Escenario 3: 10:00–10:30 con Y se acepta
select lives_ok(
  $$ select pg_temp.book('aaaaaaaa-0000-4000-8000-0000000000b2', '10:00') $$,
  'misma hora con otro barbero (Y): aceptada'
);

-- Escenario 4: se cancela la cita base y el hueco queda libre
update public.appointments
set status = 'cancelled', cancelled_at = now()
where barber_id = 'aaaaaaaa-0000-4000-8000-0000000000b1'
  and starts_at = timestamp '2030-01-07 10:00' at time zone 'America/Bogota';

select lives_ok(
  $$ select pg_temp.book('aaaaaaaa-0000-4000-8000-0000000000b1', '10:00') $$,
  'tras cancelar, 10:00–10:30 con X: aceptada'
);

-- La cancelada y la nueva conviven; solo hay una activa en ese hueco
select is(
  (select count(*)::int from public.appointments
   where barber_id = 'aaaaaaaa-0000-4000-8000-0000000000b1'
     and starts_at = timestamp '2030-01-07 10:00' at time zone 'America/Bogota'
     and status = 'active'),
  1, 'una sola cita activa de X a las 10:00'
);

select * from finish();
rollback;
