-- T007 (historia 1): aislamiento por barbería.
-- El admin de A no lee, crea, modifica ni borra datos de B en ninguna tabla; sin sesión no hay
-- acceso; el super admin gestiona barberías; nadie con sesión modifica perfiles.
-- También: el admin solo cambia status y cancelled_at de una cita (SEC-001); una cita cancelada
-- no se reactiva; super admin y usuario sin perfil no tocan los datos internos (SEC-004/005);
-- una barbería desactivada corta el acceso de sus admins (SEC-006).
-- Datos propios del test (no depende de seed.sql); el rollback final no deja residuos.
begin;
create extension if not exists pgtap with schema extensions;

select plan(131);

-- ---------------------------------------------------------------------------
-- Datos de prueba (como postgres)
-- A = aaaaaaaa-…, B = bbbbbbbb-…, super admin = cccccccc-…, usuario sin perfil = dddddddd-…
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-0000000000a1', 'admin-a@test.example.com'),
  ('bbbbbbbb-0000-4000-8000-0000000000a1', 'admin-b@test.example.com'),
  ('cccccccc-0000-4000-8000-0000000000a1', 'super@test.example.com'),
  ('dddddddd-0000-4000-8000-0000000000a1', 'sinperfil@test.example.com');

insert into public.barbershops (id, name, subdomain) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Test A', 'test-a'),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'Test B', 'test-b');

insert into public.profiles (user_id, role, barbershop_id) values
  ('aaaaaaaa-0000-4000-8000-0000000000a1', 'admin', 'aaaaaaaa-0000-4000-8000-000000000001'),
  ('bbbbbbbb-0000-4000-8000-0000000000a1', 'admin', 'bbbbbbbb-0000-4000-8000-000000000001'),
  ('cccccccc-0000-4000-8000-0000000000a1', 'super_admin', null);

insert into public.barbers (id, barbershop_id, name) values
  ('aaaaaaaa-0000-4000-8000-0000000000b1', 'aaaaaaaa-0000-4000-8000-000000000001', 'Barbero A'),
  ('bbbbbbbb-0000-4000-8000-0000000000b1', 'bbbbbbbb-0000-4000-8000-000000000001', 'Barbero B');

insert into public.services (id, barbershop_id, name, duration_minutes, price) values
  ('aaaaaaaa-0000-4000-8000-0000000000c1', 'aaaaaaaa-0000-4000-8000-000000000001', 'Corte A', 30, 20000),
  ('bbbbbbbb-0000-4000-8000-0000000000c1', 'bbbbbbbb-0000-4000-8000-000000000001', 'Corte B', 30, 20000);

insert into public.barber_schedules (id, barbershop_id, barber_id, weekday, start_time, end_time) values
  ('aaaaaaaa-0000-4000-8000-0000000000d1', 'aaaaaaaa-0000-4000-8000-000000000001',
   'aaaaaaaa-0000-4000-8000-0000000000b1', 1, '09:00', '13:00'),
  ('bbbbbbbb-0000-4000-8000-0000000000d1', 'bbbbbbbb-0000-4000-8000-000000000001',
   'bbbbbbbb-0000-4000-8000-0000000000b1', 1, '09:00', '13:00');

insert into public.barber_blocks (id, barbershop_id, barber_id, starts_at, ends_at, reason) values
  ('aaaaaaaa-0000-4000-8000-0000000000e1', 'aaaaaaaa-0000-4000-8000-000000000001',
   'aaaaaaaa-0000-4000-8000-0000000000b1', '2030-01-01 15:00Z', '2030-01-01 17:00Z', 'Bloqueo A'),
  ('bbbbbbbb-0000-4000-8000-0000000000e1', 'bbbbbbbb-0000-4000-8000-000000000001',
   'bbbbbbbb-0000-4000-8000-0000000000b1', '2030-01-01 15:00Z', '2030-01-01 17:00Z', 'Bloqueo B');

insert into public.appointments (
  id, barbershop_id, barber_id, service_id, starts_at, ends_at,
  service_duration_minutes, service_price, customer_name, customer_phone, customer_email, data_consent_at
) values
  ('aaaaaaaa-0000-4000-8000-0000000000f1', 'aaaaaaaa-0000-4000-8000-000000000001',
   'aaaaaaaa-0000-4000-8000-0000000000b1', 'aaaaaaaa-0000-4000-8000-0000000000c1',
   '2030-01-02 15:00Z', '2030-01-02 15:30Z', 30, 20000, 'Cliente A', '+573001110000', 'a@test.example.com', now()),
  ('bbbbbbbb-0000-4000-8000-0000000000f1', 'bbbbbbbb-0000-4000-8000-000000000001',
   'bbbbbbbb-0000-4000-8000-0000000000b1', 'bbbbbbbb-0000-4000-8000-0000000000c1',
   '2030-01-02 15:00Z', '2030-01-02 15:30Z', 30, 20000, 'Cliente B', '+573002220000', 'b@test.example.com', now());

-- Casos de acceso a las cinco tablas internas de una barbería, para repetirlos con varios
-- usuarios sin acceso (super admin, sin perfil, admin de barbería desactivada) sin copiar bloques.
-- insert_sql apunta a la barbería A con datos válidos: solo puede fallar por RLS.
-- update_sql usa columnas que authenticated puede actualizar, para que el 0 filas venga de RLS.
create temp table access_cases (tbl text primary key, insert_sql text not null, update_sql text not null);
insert into access_cases values
  ('barbers',
   $$ insert into public.barbers (barbershop_id, name) values ('aaaaaaaa-0000-4000-8000-000000000001', 'X') $$,
   $$ update public.barbers set name = 'X' returning id $$),
  ('services',
   $$ insert into public.services (barbershop_id, name, duration_minutes, price)
      values ('aaaaaaaa-0000-4000-8000-000000000001', 'X', 30, 0) $$,
   $$ update public.services set price = 0 returning id $$),
  ('barber_schedules',
   $$ insert into public.barber_schedules (barbershop_id, barber_id, weekday, start_time, end_time)
      values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000b1', 3, '09:00', '10:00') $$,
   $$ update public.barber_schedules set end_time = '12:00' returning id $$),
  ('barber_blocks',
   $$ insert into public.barber_blocks (barbershop_id, barber_id, starts_at, ends_at)
      values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000b1',
              '2030-03-01 15:00Z', '2030-03-01 16:00Z') $$,
   $$ update public.barber_blocks set reason = 'X' returning id $$),
  ('appointments',
   $$ insert into public.appointments (
        barbershop_id, barber_id, service_id, starts_at, ends_at, service_duration_minutes, service_price,
        customer_name, customer_phone, customer_email, data_consent_at)
      values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000b1',
              'aaaaaaaa-0000-4000-8000-0000000000c1', '2030-01-04 15:00Z', '2030-01-04 15:30Z', 30, 20000,
              'X', '+573000000000', 'x@test.example.com', now()) $$,
   $$ update public.appointments set status = 'cancelled', cancelled_at = now() returning id $$);
grant select on access_cases to authenticated;

-- ===========================================================================
-- Admin de A
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-0000000000a1","role":"authenticated"}';

-- ---- barbershops: solo ve la suya y no puede modificar ninguna --------------
select results_eq(
  $$ select id from public.barbershops $$,
  $$ values ('aaaaaaaa-0000-4000-8000-000000000001'::uuid) $$,
  'admin A: solo ve su barbería'
);
select throws_ok(
  $$ insert into public.barbershops (name, subdomain) values ('Intrusa', 'intrusa') $$,
  '42501', null, 'admin A: no crea barberías'
);
select is_empty(
  $$ update public.barbershops set name = 'X' where id = 'bbbbbbbb-0000-4000-8000-000000000001' returning id $$,
  'admin A: no modifica la barbería B'
);
select is_empty(
  $$ update public.barbershops set subdomain = 'otro' where id = 'aaaaaaaa-0000-4000-8000-000000000001' returning id $$,
  'admin A: no modifica su propia barbería (solo super admin)'
);
select is_empty(
  $$ delete from public.barbershops where id = 'bbbbbbbb-0000-4000-8000-000000000001' returning id $$,
  'admin A: no borra la barbería B'
);

-- ---- profiles: solo ve el suyo y no puede cambiar ninguno --------------------
select results_eq(
  $$ select user_id from public.profiles $$,
  $$ values ('aaaaaaaa-0000-4000-8000-0000000000a1'::uuid) $$,
  'admin A: solo ve su propio perfil'
);
select is_empty(
  $$ update public.profiles set role = 'super_admin', barbershop_id = null
     where user_id = 'aaaaaaaa-0000-4000-8000-0000000000a1' returning user_id $$,
  'admin A: no puede subirse a super admin'
);
select is_empty(
  $$ update public.profiles set barbershop_id = 'bbbbbbbb-0000-4000-8000-000000000001'
     where user_id = 'aaaaaaaa-0000-4000-8000-0000000000a1' returning user_id $$,
  'admin A: no puede cambiarse de barbería'
);
select throws_ok(
  $$ insert into public.profiles (user_id, role, barbershop_id)
     values ('dddddddd-0000-4000-8000-0000000000a1', 'admin', 'aaaaaaaa-0000-4000-8000-000000000001') $$,
  '42501', null, 'admin A: no crea perfiles'
);
select is_empty(
  $$ delete from public.profiles where user_id = 'bbbbbbbb-0000-4000-8000-0000000000a1' returning user_id $$,
  'admin A: no borra perfiles'
);

-- ---- barbers ------------------------------------------------------------------
select results_eq(
  $$ select id from public.barbers $$,
  $$ values ('aaaaaaaa-0000-4000-8000-0000000000b1'::uuid) $$,
  'admin A: solo ve sus barberos'
);
select lives_ok(
  $$ insert into public.barbers (barbershop_id, name) values ('aaaaaaaa-0000-4000-8000-000000000001', 'Nuevo A') $$,
  'admin A: crea barberos en su barbería'
);
select throws_ok(
  $$ insert into public.barbers (barbershop_id, name) values ('bbbbbbbb-0000-4000-8000-000000000001', 'Intruso') $$,
  '42501', null, 'admin A: no crea barberos en B'
);
select is_empty(
  $$ update public.barbers set name = 'X' where id = 'bbbbbbbb-0000-4000-8000-0000000000b1' returning id $$,
  'admin A: no modifica barberos de B (con su id)'
);
select throws_ok(
  $$ update public.barbers set barbershop_id = 'bbbbbbbb-0000-4000-8000-000000000001'
     where id = 'aaaaaaaa-0000-4000-8000-0000000000b1' $$,
  '42501', null, 'admin A: no mueve un barbero a B'
);
select is_empty(
  $$ delete from public.barbers where id = 'bbbbbbbb-0000-4000-8000-0000000000b1' returning id $$,
  'admin A: no borra barberos de B'
);

-- ---- services -----------------------------------------------------------------
select results_eq(
  $$ select id from public.services $$,
  $$ values ('aaaaaaaa-0000-4000-8000-0000000000c1'::uuid) $$,
  'admin A: solo ve sus servicios'
);
select throws_ok(
  $$ insert into public.services (barbershop_id, name, duration_minutes, price)
     values ('bbbbbbbb-0000-4000-8000-000000000001', 'Intruso', 30, 0) $$,
  '42501', null, 'admin A: no crea servicios en B'
);
select is_empty(
  $$ update public.services set price = 0 where id = 'bbbbbbbb-0000-4000-8000-0000000000c1' returning id $$,
  'admin A: no modifica servicios de B'
);
select throws_ok(
  $$ update public.services set barbershop_id = 'bbbbbbbb-0000-4000-8000-000000000001'
     where id = 'aaaaaaaa-0000-4000-8000-0000000000c1' $$,
  '42501', null, 'admin A: no mueve un servicio a B'
);
select is_empty(
  $$ delete from public.services where id = 'bbbbbbbb-0000-4000-8000-0000000000c1' returning id $$,
  'admin A: no borra servicios de B'
);

-- ---- barber_schedules ---------------------------------------------------------
select results_eq(
  $$ select id from public.barber_schedules $$,
  $$ values ('aaaaaaaa-0000-4000-8000-0000000000d1'::uuid) $$,
  'admin A: solo ve sus horarios'
);
select throws_ok(
  $$ insert into public.barber_schedules (barbershop_id, barber_id, weekday, start_time, end_time)
     values ('bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000b1', 2, '09:00', '10:00') $$,
  '42501', null, 'admin A: no crea horarios en B'
);
select throws_ok(
  $$ insert into public.barber_schedules (barbershop_id, barber_id, weekday, start_time, end_time)
     values ('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000b1', 2, '09:00', '10:00') $$,
  '23503', null, 'admin A: no crea un horario en A para un barbero de B (FK compuesta)'
);
select is_empty(
  $$ update public.barber_schedules set end_time = '12:00' where id = 'bbbbbbbb-0000-4000-8000-0000000000d1' returning id $$,
  'admin A: no modifica horarios de B'
);
select throws_ok(
  $$ update public.barber_schedules set barbershop_id = 'bbbbbbbb-0000-4000-8000-000000000001'
     where id = 'aaaaaaaa-0000-4000-8000-0000000000d1' $$,
  '42501', null, 'admin A: no mueve un horario a B'
);
select is_empty(
  $$ delete from public.barber_schedules where id = 'bbbbbbbb-0000-4000-8000-0000000000d1' returning id $$,
  'admin A: no borra horarios de B'
);

-- ---- barber_blocks ------------------------------------------------------------
select results_eq(
  $$ select id from public.barber_blocks $$,
  $$ values ('aaaaaaaa-0000-4000-8000-0000000000e1'::uuid) $$,
  'admin A: solo ve sus bloqueos'
);
select throws_ok(
  $$ insert into public.barber_blocks (barbershop_id, barber_id, starts_at, ends_at)
     values ('bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000b1',
             '2030-02-01 15:00Z', '2030-02-01 16:00Z') $$,
  '42501', null, 'admin A: no crea bloqueos en B'
);
select throws_ok(
  $$ insert into public.barber_blocks (barbershop_id, barber_id, starts_at, ends_at)
     values ('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000b1',
             '2030-02-01 15:00Z', '2030-02-01 16:00Z') $$,
  '23503', null, 'admin A: no crea un bloqueo en A para un barbero de B (FK compuesta)'
);
select is_empty(
  $$ update public.barber_blocks set reason = 'X' where id = 'bbbbbbbb-0000-4000-8000-0000000000e1' returning id $$,
  'admin A: no modifica bloqueos de B'
);
select throws_ok(
  $$ update public.barber_blocks set barbershop_id = 'bbbbbbbb-0000-4000-8000-000000000001'
     where id = 'aaaaaaaa-0000-4000-8000-0000000000e1' $$,
  '42501', null, 'admin A: no mueve un bloqueo a B'
);
select is_empty(
  $$ delete from public.barber_blocks where id = 'bbbbbbbb-0000-4000-8000-0000000000e1' returning id $$,
  'admin A: no borra bloqueos de B'
);

-- ---- appointments -------------------------------------------------------------
select results_eq(
  $$ select id from public.appointments $$,
  $$ values ('aaaaaaaa-0000-4000-8000-0000000000f1'::uuid) $$,
  'admin A: solo ve sus citas'
);
select throws_ok(
  $$ insert into public.appointments (
       barbershop_id, barber_id, service_id, starts_at, ends_at, service_duration_minutes, service_price,
       customer_name, customer_phone, customer_email, data_consent_at)
     values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000b1',
             'aaaaaaaa-0000-4000-8000-0000000000c1', '2030-01-03 15:00Z', '2030-01-03 15:30Z', 30, 20000,
             'X', '+573000000000', 'x@test.example.com', now()) $$,
  '42501', null, 'admin A: no crea citas (las crea el servidor)'
);
select is_empty(
  $$ update public.appointments set status = 'cancelled', cancelled_at = now()
     where id = 'bbbbbbbb-0000-4000-8000-0000000000f1' returning id $$,
  'admin A: no cancela citas de B'
);
-- SEC-001: en su propia cita, el admin solo puede cambiar status y cancelled_at
select throws_ok(
  format('update public.appointments set %I = %s where id = %L', c.col, c.val, 'aaaaaaaa-0000-4000-8000-0000000000f1'),
  '42501', null, format('admin A: no modifica appointments.%s de su cita', c.col)
)
from (values
  ('data_consent_at', 'now()'),
  ('customer_phone', quote_literal('+573009999999')),
  ('customer_name', quote_literal('Otro')),
  ('customer_email', quote_literal('otro@test.example.com')),
  ('service_price', '0'),
  ('service_duration_minutes', '60'),
  ('starts_at', quote_literal('2030-01-02 16:00Z')),
  ('ends_at', quote_literal('2030-01-02 16:30Z')),
  ('barber_id', quote_literal('aaaaaaaa-0000-4000-8000-0000000000b1')),
  ('service_id', quote_literal('aaaaaaaa-0000-4000-8000-0000000000c1'))
) as c (col, val);
select throws_ok(
  $$ update public.appointments set barbershop_id = 'bbbbbbbb-0000-4000-8000-000000000001'
     where id = 'aaaaaaaa-0000-4000-8000-0000000000f1' $$,
  '42501', null, 'admin A: no mueve una cita a B'
);
select is_empty(
  $$ delete from public.appointments where id = 'aaaaaaaa-0000-4000-8000-0000000000f1' returning id $$,
  'admin A: no borra citas, ni las propias'
);
select is_empty(
  $$ delete from public.appointments where id = 'bbbbbbbb-0000-4000-8000-0000000000f1' returning id $$,
  'admin A: no borra citas de B'
);
select isnt_empty(
  $$ update public.appointments set status = 'cancelled', cancelled_at = now()
     where id = 'aaaaaaaa-0000-4000-8000-0000000000f1' returning id $$,
  'admin A: cancela citas de su barbería'
);
select throws_ok(
  $$ update public.appointments set status = 'active', cancelled_at = null
     where id = 'aaaaaaaa-0000-4000-8000-0000000000f1' $$,
  '23514', 'una cita cancelada no puede reactivarse',
  'admin A: no reactiva una cita cancelada'
);

-- ===========================================================================
-- Usuario con sesión pero sin perfil: no ve ni modifica nada
-- ===========================================================================
set local request.jwt.claims = '{"sub":"dddddddd-0000-4000-8000-0000000000a1","role":"authenticated"}';

select is_empty($$ select id from public.barbershops $$, 'sin perfil: no ve barberías');
select is_empty($$ select user_id from public.profiles $$, 'sin perfil: no ve perfiles');
select is_empty(format('select id from public.%I', tbl), format('sin perfil: no lee %s', tbl))
  from access_cases order by tbl;
select throws_ok(insert_sql, '42501', null, format('sin perfil: no inserta en %s', tbl))
  from access_cases order by tbl;
select is_empty(update_sql, format('sin perfil: UPDATE en %s afecta 0 filas', tbl))
  from access_cases order by tbl;
select is_empty(format('delete from public.%I returning id', tbl), format('sin perfil: DELETE en %s afecta 0 filas', tbl))
  from access_cases order by tbl;

-- ===========================================================================
-- Sin sesión (anon): ningún acceso a ninguna tabla
-- ===========================================================================
reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select throws_ok($$ select 1 from public.barbershops $$, '42501', null, 'anon: no lee barbershops');
select throws_ok($$ select 1 from public.profiles $$, '42501', null, 'anon: no lee profiles');
select throws_ok($$ select 1 from public.barbers $$, '42501', null, 'anon: no lee barbers');
select throws_ok($$ select 1 from public.services $$, '42501', null, 'anon: no lee services');
select throws_ok($$ select 1 from public.barber_schedules $$, '42501', null, 'anon: no lee barber_schedules');
select throws_ok($$ select 1 from public.barber_blocks $$, '42501', null, 'anon: no lee barber_blocks');
select throws_ok($$ select 1 from public.appointments $$, '42501', null, 'anon: no lee appointments');
select throws_ok(
  $$ update public.appointments set customer_name = 'X' $$,
  '42501', null, 'anon: no modifica appointments'
);

-- ===========================================================================
-- Super admin: gestiona barberías, no ve datos internos de ninguna
-- ===========================================================================
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-0000-4000-8000-0000000000a1","role":"authenticated"}';

select is(
  (select count(*)::int from public.barbershops
   where id in ('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001')),
  2, 'super admin: ve todas las barberías'
);
select lives_ok(
  $$ insert into public.barbershops (id, name, subdomain)
     values ('cccccccc-0000-4000-8000-000000000001', 'Nueva', 'test-nueva') $$,
  'super admin: da de alta barberías'
);
select isnt_empty(
  $$ update public.barbershops set name = 'Test B renombrada'
     where id = 'bbbbbbbb-0000-4000-8000-000000000001' returning id $$,
  'super admin: modifica barberías'
);
select isnt_empty(
  $$ delete from public.barbershops where id = 'cccccccc-0000-4000-8000-000000000001' returning id $$,
  'super admin: borra barberías'
);
select is(
  (select count(*)::int from public.profiles
   where user_id in ('aaaaaaaa-0000-4000-8000-0000000000a1', 'bbbbbbbb-0000-4000-8000-0000000000a1')),
  2, 'super admin: ve todos los perfiles'
);
select is_empty(
  $$ update public.profiles set role = 'super_admin', barbershop_id = null
     where user_id = 'aaaaaaaa-0000-4000-8000-0000000000a1' returning user_id $$,
  'super admin: tampoco modifica perfiles con sesión'
);
-- Mínimo privilegio: el super admin no lee ni modifica los datos internos de ninguna barbería
select is_empty(format('select id from public.%I', tbl), format('super admin: no lee %s', tbl))
  from access_cases order by tbl;
select throws_ok(insert_sql, '42501', null, format('super admin: no inserta en %s', tbl))
  from access_cases order by tbl;
select is_empty(update_sql, format('super admin: UPDATE en %s afecta 0 filas', tbl))
  from access_cases order by tbl;
select is_empty(format('delete from public.%I returning id', tbl), format('super admin: DELETE en %s afecta 0 filas', tbl))
  from access_cases order by tbl;

-- ===========================================================================
-- Nadie reactiva una cita cancelada, tampoco el servidor (postgres / clave secreta)
-- ===========================================================================
reset role;

select throws_ok(
  $$ update public.appointments set status = 'active', cancelled_at = null
     where id = 'aaaaaaaa-0000-4000-8000-0000000000f1' $$,
  '23514', 'una cita cancelada no puede reactivarse',
  'postgres: tampoco reactiva una cita cancelada'
);

-- ===========================================================================
-- SEC-006: barbería A desactivada. Su admin pierde el acceso; el super admin no.
-- ===========================================================================
update public.barbershops set is_active = false where id = 'aaaaaaaa-0000-4000-8000-000000000001';

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-0000000000a1","role":"authenticated"}';

select is_empty($$ select id from public.barbershops $$, 'admin de barbería desactivada: no ve su barbería');
select is_empty(format('select id from public.%I', tbl), format('admin de barbería desactivada: no lee %s', tbl))
  from access_cases order by tbl;
select throws_ok(insert_sql, '42501', null, format('admin de barbería desactivada: no inserta en %s', tbl))
  from access_cases order by tbl;
select is_empty(update_sql, format('admin de barbería desactivada: UPDATE en %s afecta 0 filas', tbl))
  from access_cases order by tbl;
select is_empty(format('delete from public.%I returning id', tbl),
                format('admin de barbería desactivada: DELETE en %s afecta 0 filas', tbl))
  from access_cases order by tbl;

set local request.jwt.claims = '{"sub":"cccccccc-0000-4000-8000-0000000000a1","role":"authenticated"}';
select isnt_empty(
  $$ select id from public.barbershops where id = 'aaaaaaaa-0000-4000-8000-000000000001' and not is_active $$,
  'super admin: sigue viendo la barbería desactivada'
);

-- ===========================================================================
-- Comprobación final como postgres: los datos de B siguen intactos
-- ===========================================================================
reset role;

select ok(
  (select count(*) = 1 from public.barbers
     where barbershop_id = 'bbbbbbbb-0000-4000-8000-000000000001' and name = 'Barbero B')
  and (select count(*) = 1 from public.services
     where barbershop_id = 'bbbbbbbb-0000-4000-8000-000000000001' and price = 20000)
  and (select count(*) = 1 from public.barber_schedules
     where barbershop_id = 'bbbbbbbb-0000-4000-8000-000000000001' and end_time = '13:00')
  and (select count(*) = 1 from public.barber_blocks
     where barbershop_id = 'bbbbbbbb-0000-4000-8000-000000000001' and reason = 'Bloqueo B')
  and (select count(*) = 1 from public.appointments
     where barbershop_id = 'bbbbbbbb-0000-4000-8000-000000000001' and customer_name = 'Cliente B' and status = 'active')
  and (select role = 'admin' and barbershop_id = 'aaaaaaaa-0000-4000-8000-000000000001'
     from public.profiles where user_id = 'aaaaaaaa-0000-4000-8000-0000000000a1')
  and (select count(*) = 1 from public.appointments
     where id = 'aaaaaaaa-0000-4000-8000-0000000000f1' and status = 'cancelled'
       and customer_name = 'Cliente A' and customer_phone = '+573001110000')
  and (select count(*) = 2 from public.barbers where barbershop_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  'los datos de B, el perfil de A y la cita cancelada de A no cambiaron'
);

select * from finish();
rollback;
