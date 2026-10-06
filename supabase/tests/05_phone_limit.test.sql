-- T020: tope de 2 citas activas futuras por número y barbería (trigger appointments_phone_limit).
-- Error esperado: 23514 con el mensaje exacto del trigger.
begin;
create extension if not exists pgtap with schema extensions;

select plan(8);

insert into public.barbershops (id, name, subdomain) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Test A', 'test-a'),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'Test B', 'test-b');
insert into public.barbers (id, barbershop_id, name) values
  ('aaaaaaaa-0000-4000-8000-0000000000b1', 'aaaaaaaa-0000-4000-8000-000000000001', 'X'),
  ('bbbbbbbb-0000-4000-8000-0000000000b1', 'bbbbbbbb-0000-4000-8000-000000000001', 'Z');
insert into public.services (id, barbershop_id, name, duration_minutes, price) values
  ('aaaaaaaa-0000-4000-8000-0000000000c1', 'aaaaaaaa-0000-4000-8000-000000000001', 'Corte', 30, 20000),
  ('bbbbbbbb-0000-4000-8000-0000000000c1', 'bbbbbbbb-0000-4000-8000-000000000001', 'Corte', 30, 20000);

-- Cita de 30 minutos. Las horas son offsets en horas desde ahora (negativo = pasado).
create function pg_temp.book(p_shop text, p_phone text, p_hours int, p_status text default 'active')
returns void
language sql
as $$
  insert into public.appointments (
    barbershop_id, barber_id, service_id, starts_at, ends_at,
    service_duration_minutes, service_price, status, cancelled_at,
    customer_name, customer_phone, customer_email, data_consent_at)
  select
    s.id, b.id, c.id,
    date_trunc('hour', now()) + p_hours * interval '1 hour',
    date_trunc('hour', now()) + p_hours * interval '1 hour' + interval '30 minutes',
    30, 20000, p_status::public.appointment_status,
    case when p_status = 'cancelled' then now() end,
    'Cliente', p_phone, 'cliente@test.example.com', now()
  from public.barbershops s
  join public.barbers b on b.barbershop_id = s.id
  join public.services c on c.barbershop_id = s.id
  where s.subdomain = p_shop;
$$;

select lives_ok($$ select pg_temp.book('test-a', '+573001234567', 48) $$, 'primera cita activa futura: aceptada');
select lives_ok($$ select pg_temp.book('test-a', '+573001234567', 50) $$, 'segunda cita activa futura: aceptada');
-- (a)
select throws_ok(
  $$ select pg_temp.book('test-a', '+573001234567', 52) $$,
  '23514', 'tope de citas activas por número (appointments_phone_limit)',
  'tercera cita activa futura del mismo número: rechazada'
);
-- (b) con 2 activas ya, una cancelada nueva no cuenta ni se limita; y una cancelada previa no cuenta
select lives_ok($$ select pg_temp.book('test-a', '+573002223344', 60, 'cancelled') $$, '(f) insertar una cita ya cancelada: no se limita');
select lives_ok(
  $$ select pg_temp.book('test-a', '+573002223344', 62, 'cancelled');
     select pg_temp.book('test-a', '+573002223344', 64);
     select pg_temp.book('test-a', '+573002223344', 66) $$,
  '(b) las canceladas no cuentan: 2 canceladas + 2 activas, aceptadas'
);
-- (c)
select lives_ok(
  $$ select pg_temp.book('test-a', '+573003334455', -72);
     select pg_temp.book('test-a', '+573003334455', -48);
     select pg_temp.book('test-a', '+573003334455', 70);
     select pg_temp.book('test-a', '+573003334455', 72) $$,
  '(c) las citas pasadas no cuentan: 2 pasadas + 2 futuras, aceptadas'
);
-- (d)
select lives_ok($$ select pg_temp.book('test-b', '+573001234567', 48) $$, '(d) el mismo número en otra barbería no cuenta');
-- (e)
select lives_ok($$ select pg_temp.book('test-a', '+573005556677', 80) $$, '(e) otro número en la misma barbería no cuenta');

select * from finish();
rollback;
