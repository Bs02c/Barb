-- Spec 003 (T003): token de cancelación. Solo se guarda el hash (SHA-256, 32 bytes), único,
-- y el admin autenticado no puede escribirlo (solo status y cancelled_at).
-- Códigos: 23514 check, 23505 unique, 42501 permiso denegado.
begin;
create extension if not exists pgtap with schema extensions;

select plan(8);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-0000000000a1', 'admin-a@test.example.com');
insert into public.barbershops (id, name, subdomain) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Test A', 'test-a');
insert into public.profiles (user_id, role, barbershop_id) values
  ('aaaaaaaa-0000-4000-8000-0000000000a1', 'admin', 'aaaaaaaa-0000-4000-8000-000000000001');
insert into public.barbers (id, barbershop_id, name) values
  ('aaaaaaaa-0000-4000-8000-0000000000b1', 'aaaaaaaa-0000-4000-8000-000000000001', 'X');
insert into public.services (id, barbershop_id, name, duration_minutes, price) values
  ('aaaaaaaa-0000-4000-8000-0000000000c1', 'aaaaaaaa-0000-4000-8000-000000000001', 'Corte', 30, 20000);

-- Inserta una cita en A en el día indicado (huecos distintos para no chocar) con el hash dado.
create function pg_temp.book(day int, h bytea)
returns void
language sql
as $$
  insert into public.appointments (
    barbershop_id, barber_id, service_id, starts_at, ends_at,
    service_duration_minutes, service_price,
    customer_name, customer_phone, customer_email, data_consent_at, cancel_token_hash)
  values (
    'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000b1',
    'aaaaaaaa-0000-4000-8000-0000000000c1',
    '2030-03-01 15:00Z'::timestamptz + make_interval(days => day),
    '2030-03-01 15:30Z'::timestamptz + make_interval(days => day),
    30, 20000, 'Cliente', '+57300123456' || day, 'cliente@test.example.com', now(), h);
$$;

select lives_ok($$ select pg_temp.book(0, decode(repeat('ab', 32), 'hex')) $$, 'acepta hash de 32 bytes');
select lives_ok($$ select pg_temp.book(1, null) $$, 'acepta hash null');
select lives_ok($$ select pg_temp.book(2, null) $$, 'acepta varios hashes null (índice parcial)');

select throws_ok(
  $$ select pg_temp.book(3, decode(repeat('cd', 31), 'hex')) $$,
  '23514', 'new row for relation "appointments" violates check constraint "appointments_cancel_token_hash_length"',
  'rechaza hash de 31 bytes');
select throws_ok(
  $$ select pg_temp.book(4, decode(repeat('cd', 33), 'hex')) $$,
  '23514', 'new row for relation "appointments" violates check constraint "appointments_cancel_token_hash_length"',
  'rechaza hash de 33 bytes');
select throws_ok(
  $$ select pg_temp.book(5, decode(repeat('ab', 32), 'hex')) $$,
  '23505', 'duplicate key value violates unique constraint "appointments_cancel_token_hash_key"',
  'rechaza hash duplicado');

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-0000000000a1","role":"authenticated"}';

select throws_ok(
  $$ update public.appointments set cancel_token_hash = decode(repeat('ef', 32), 'hex') $$,
  '42501', null, 'admin autenticado: no puede actualizar cancel_token_hash');
select lives_ok(
  $$ update public.appointments set status = 'cancelled', cancelled_at = now() where cancel_token_hash is null $$,
  'admin autenticado: sí puede cancelar (status y cancelled_at)');

select * from finish();
rollback;
