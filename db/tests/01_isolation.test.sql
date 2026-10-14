-- T007 (historia 1): aislamiento por barbería (spec 005: identidad por app.user_id, sin anon).
-- El admin de A no lee, crea, modifica ni borra datos de B en ninguna tabla; una conexión sin rol
-- de trabajo (app_login) no tiene acceso; el super admin solo lee barberías (las escribe db_owner);
-- nadie con sesión modifica perfiles.
-- Donde antes una política dejaba 0 filas y ahora falta el privilegio (UPDATE/DELETE de
-- barbershops, profiles, barber_schedules y barber_blocks; DELETE de appointments), el assert
-- espera 42501: el rechazo es más fuerte (por privilegio, sin llegar a RLS).
-- También: el admin solo cambia status y cancelled_at de una cita (SEC-001); una cita cancelada
-- no se reactiva; super admin y usuario sin perfil no tocan los datos internos (SEC-004/005);
-- una barbería desactivada corta el acceso de sus admins (SEC-006).
-- Datos propios del test (no depende de seed.sql); el rollback final no deja residuos.
begin;
create schema tap;
create extension pgtap with schema tap;
set search_path = tap, public;
-- Las pruebas cambian de rol dentro de la transacción: los roles necesitan ver las funciones de pgTAP.
grant usage on schema tap to authenticated, service_role, app_login;

select plan(163);

-- ---------------------------------------------------------------------------
-- Datos de prueba (como postgres)
-- A = aaaaaaaa-…, B = bbbbbbbb-…, super admin = cccccccc-…, usuario sin perfil = dddddddd-…
-- ---------------------------------------------------------------------------
insert into identity."user" (id, name, email) values
  ('aaaaaaaa-0000-4000-8000-0000000000a1', 'admin-a@test.example.com', 'admin-a@test.example.com'),
  ('bbbbbbbb-0000-4000-8000-0000000000a1', 'admin-b@test.example.com', 'admin-b@test.example.com'),
  ('cccccccc-0000-4000-8000-0000000000a1', 'super@test.example.com', 'super@test.example.com'),
  ('dddddddd-0000-4000-8000-0000000000a1', 'sinperfil@test.example.com', 'sinperfil@test.example.com');

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
-- upd_denied / del_denied: true si authenticated NO tiene el privilegio (el rechazo es 42501);
-- false si lo tiene y solo RLS puede dejar 0 filas.
create temp table access_cases (
  tbl text primary key, insert_sql text not null, update_sql text not null,
  upd_denied boolean not null, del_denied boolean not null);
insert into access_cases values
  ('barbers',
   $$ insert into public.barbers (barbershop_id, name) values ('aaaaaaaa-0000-4000-8000-000000000001', 'X') $$,
   $$ update public.barbers set name = 'X' returning id $$, false, false),
  ('services',
   $$ insert into public.services (barbershop_id, name, duration_minutes, price)
      values ('aaaaaaaa-0000-4000-8000-000000000001', 'X', 30, 0) $$,
   $$ update public.services set price = 0 returning id $$, false, false),
  ('barber_schedules',
   $$ insert into public.barber_schedules (barbershop_id, barber_id, weekday, start_time, end_time)
      values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000b1', 3, '09:00', '10:00') $$,
   $$ update public.barber_schedules set end_time = '12:00' returning id $$, true, false),
  ('barber_blocks',
   $$ insert into public.barber_blocks (barbershop_id, barber_id, starts_at, ends_at)
      values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000b1',
              '2030-03-01 15:00Z', '2030-03-01 16:00Z') $$,
   $$ update public.barber_blocks set reason = 'X' returning id $$, true, false),
  ('appointments',
   $$ insert into public.appointments (
        barbershop_id, barber_id, service_id, starts_at, ends_at, service_duration_minutes, service_price,
        customer_name, customer_phone, customer_email, data_consent_at)
      values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000b1',
              'aaaaaaaa-0000-4000-8000-0000000000c1', '2030-01-04 15:00Z', '2030-01-04 15:30Z', 30, 20000,
              'X', '+573000000000', 'x@test.example.com', now()) $$,
   $$ update public.appointments set status = 'cancelled', cancelled_at = now() returning id $$, false, true);
grant select on access_cases to authenticated, app_login;

-- ===========================================================================
-- Admin de A
-- ===========================================================================
set local role authenticated;
set local app.user_id = 'aaaaaaaa-0000-4000-8000-0000000000a1';

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
select throws_ok(
  $$ update public.barbershops set name = 'X' where id = 'bbbbbbbb-0000-4000-8000-000000000001' returning id $$,
  '42501', null, 'admin A: no modifica la barbería B'
);
select throws_ok(
  $$ update public.barbershops set subdomain = 'otro' where id = 'aaaaaaaa-0000-4000-8000-000000000001' returning id $$,
  '42501', null, 'admin A: no modifica su propia barbería (solo db_owner por script)'
);
select throws_ok(
  $$ delete from public.barbershops where id = 'bbbbbbbb-0000-4000-8000-000000000001' returning id $$,
  '42501', null, 'admin A: no borra la barbería B'
);
-- Spec 006: UPDATE de description y address (política barbershops_update)
select isnt_empty(
  $$ update public.barbershops set description = 'Cortes clásicos', address = 'Calle 1 # 2-3'
     where id = 'aaaaaaaa-0000-4000-8000-000000000001' returning id $$,
  'admin A: modifica description y address de su barbería'
);
select is_empty(
  $$ update public.barbershops set description = 'Intrusa', address = 'Intrusa'
     where id = 'bbbbbbbb-0000-4000-8000-000000000001' returning id $$,
  'admin A: description y address de la barbería B afectan 0 filas'
);
select throws_ok(
  format('update public.barbershops set %I = %s where id = %L', c.col, c.val, 'aaaaaaaa-0000-4000-8000-000000000001'),
  '42501', null, format('admin A: no modifica barbershops.%s de su barbería', c.col)
)
from (values
  ('name', quote_literal('Otro')),
  ('subdomain', quote_literal('otro')),
  ('timezone', quote_literal('America/Bogota')),
  ('is_active', 'false')
) as c (col, val);
select isnt_empty(
  $$ update public.services set description = 'Corte a tijera' where id = 'aaaaaaaa-0000-4000-8000-0000000000c1' returning id $$,
  'admin A: modifica services.description de su servicio'
);
select is_empty(
  $$ update public.services set description = 'Intruso' where id = 'bbbbbbbb-0000-4000-8000-0000000000c1' returning id $$,
  'admin A: services.description de B afecta 0 filas'
);

-- ---- profiles: solo ve el suyo y no puede cambiar ninguno --------------------
select results_eq(
  $$ select user_id from public.profiles $$,
  $$ values ('aaaaaaaa-0000-4000-8000-0000000000a1'::uuid) $$,
  'admin A: solo ve su propio perfil'
);
select throws_ok(
  $$ update public.profiles set role = 'super_admin', barbershop_id = null
     where user_id = 'aaaaaaaa-0000-4000-8000-0000000000a1' returning user_id $$,
  '42501', null, 'admin A: no puede subirse a super admin'
);
select throws_ok(
  $$ update public.profiles set barbershop_id = 'bbbbbbbb-0000-4000-8000-000000000001'
     where user_id = 'aaaaaaaa-0000-4000-8000-0000000000a1' returning user_id $$,
  '42501', null, 'admin A: no puede cambiarse de barbería'
);
select throws_ok(
  $$ insert into public.profiles (user_id, role, barbershop_id)
     values ('dddddddd-0000-4000-8000-0000000000a1', 'admin', 'aaaaaaaa-0000-4000-8000-000000000001') $$,
  '42501', null, 'admin A: no crea perfiles'
);
select throws_ok(
  $$ delete from public.profiles where user_id = 'bbbbbbbb-0000-4000-8000-0000000000a1' returning user_id $$,
  '42501', null, 'admin A: no borra perfiles'
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
select throws_ok(
  $$ update public.barber_schedules set end_time = '12:00' where id = 'bbbbbbbb-0000-4000-8000-0000000000d1' returning id $$,
  '42501', null, 'admin A: no modifica horarios de B'
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
select throws_ok(
  $$ update public.barber_blocks set reason = 'X' where id = 'bbbbbbbb-0000-4000-8000-0000000000e1' returning id $$,
  '42501', null, 'admin A: no modifica bloqueos de B'
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
select throws_ok(
  $$ delete from public.appointments where id = 'aaaaaaaa-0000-4000-8000-0000000000f1' returning id $$,
  '42501', null, 'admin A: no borra citas, ni las propias'
);
select throws_ok(
  $$ delete from public.appointments where id = 'bbbbbbbb-0000-4000-8000-0000000000f1' returning id $$,
  '42501', null, 'admin A: no borra citas de B'
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
set local app.user_id = 'dddddddd-0000-4000-8000-0000000000a1';

select is_empty($$ select id from public.barbershops $$, 'sin perfil: no ve barberías');
select is_empty($$ select user_id from public.profiles $$, 'sin perfil: no ve perfiles');
select is_empty(format('select id from public.%I', tbl), format('sin perfil: no lee %s', tbl))
  from access_cases order by tbl;
select throws_ok(insert_sql, '42501', null, format('sin perfil: no inserta en %s', tbl))
  from access_cases order by tbl;
select is_empty(update_sql, format('sin perfil: UPDATE en %s afecta 0 filas', tbl))
  from access_cases where not upd_denied order by tbl;
select throws_ok(update_sql, '42501', null, format('sin perfil: UPDATE en %s denegado por privilegio', tbl))
  from access_cases where upd_denied order by tbl;
select is_empty(format('delete from public.%I returning id', tbl), format('sin perfil: DELETE en %s afecta 0 filas', tbl))
  from access_cases where not del_denied order by tbl;
select throws_ok(format('delete from public.%I returning id', tbl), '42501', null,
                 format('sin perfil: DELETE en %s denegado por privilegio', tbl))
  from access_cases where del_denied order by tbl;
-- Spec 006: description y address de barbershops
select is_empty(
  $$ update public.barbershops set description = 'X', address = 'X' returning id $$,
  'sin perfil: description y address de barbershops afectan 0 filas'
);
select throws_ok(
  format('update public.barbershops set %I = %s', c.col, c.val),
  '42501', null, format('sin perfil: no modifica barbershops.%s', c.col)
)
from (values
  ('name', quote_literal('Otro')), ('subdomain', quote_literal('otro')),
  ('timezone', quote_literal('America/Bogota')), ('is_active', 'false')
) as c (col, val);
select is_empty(
  $$ update public.services set description = 'X' returning id $$,
  'sin perfil: services.description afecta 0 filas'
);

-- ===========================================================================
-- Sin rol de trabajo (sustituye a anon): una conexión de la app que no cambió a authenticated ni
-- a service_role (app_login es NOINHERIT) no tiene acceso a ninguna tabla.
-- ===========================================================================
reset role;
set local role app_login;

select throws_ok($$ select 1 from public.barbershops $$, '42501', null, 'app_login sin rol de trabajo: no lee barbershops');
select throws_ok($$ select 1 from public.profiles $$, '42501', null, 'app_login sin rol de trabajo: no lee profiles');
select throws_ok($$ select 1 from public.barbers $$, '42501', null, 'app_login sin rol de trabajo: no lee barbers');
select throws_ok($$ select 1 from public.services $$, '42501', null, 'app_login sin rol de trabajo: no lee services');
select throws_ok($$ select 1 from public.barber_schedules $$, '42501', null, 'app_login sin rol de trabajo: no lee barber_schedules');
select throws_ok($$ select 1 from public.barber_blocks $$, '42501', null, 'app_login sin rol de trabajo: no lee barber_blocks');
select throws_ok($$ select 1 from public.appointments $$, '42501', null, 'app_login sin rol de trabajo: no lee appointments');
select throws_ok(
  $$ update public.appointments set customer_name = 'X' $$,
  '42501', null, 'app_login sin rol de trabajo: no modifica appointments'
);
select throws_ok(
  $$ update public.barbershops set description = 'X', address = 'X' $$,
  '42501', null, 'app_login sin rol de trabajo: no modifica description ni address de barbershops'
);
select throws_ok(
  $$ update public.barbershops set name = 'X' $$,
  '42501', null, 'app_login sin rol de trabajo: no modifica barbershops.name'
);
select throws_ok(
  $$ update public.services set description = 'X' $$,
  '42501', null, 'app_login sin rol de trabajo: no modifica services.description'
);

-- ===========================================================================
-- service_role (web pública): lee, pero no modifica barberías ni servicios (spec 006)
-- ===========================================================================
reset role;
set local role service_role;

select throws_ok(
  $$ update public.barbershops set description = 'X', address = 'X'
     where id = 'aaaaaaaa-0000-4000-8000-000000000001' $$,
  '42501', null, 'service_role: no modifica description ni address de su barbería'
);
select throws_ok(
  $$ update public.barbershops set description = 'X', address = 'X'
     where id = 'bbbbbbbb-0000-4000-8000-000000000001' $$,
  '42501', null, 'service_role: no modifica description ni address de otra barbería'
);
select throws_ok(
  $$ update public.barbershops set name = 'X' where id = 'aaaaaaaa-0000-4000-8000-000000000001' $$,
  '42501', null, 'service_role: no modifica barbershops.name'
);
select throws_ok(
  $$ update public.services set description = 'X' where id = 'aaaaaaaa-0000-4000-8000-0000000000c1' $$,
  '42501', null, 'service_role: no modifica services.description'
);

-- ===========================================================================
-- Super admin: gestiona barberías, no ve datos internos de ninguna
-- ===========================================================================
reset role;
set local role authenticated;
set local app.user_id = 'cccccccc-0000-4000-8000-0000000000a1';

select is(
  (select count(*)::int from public.barbershops
   where id in ('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001')),
  2, 'super admin: ve todas las barberías'
);
-- Antes el super admin escribía barberías con sesión; ahora solo db_owner (script de alta): 42501.
select throws_ok(
  $$ insert into public.barbershops (id, name, subdomain)
     values ('cccccccc-0000-4000-8000-000000000001', 'Nueva', 'test-nueva') $$,
  '42501', null, 'super admin: no da de alta barberías con sesión (solo db_owner)'
);
select throws_ok(
  $$ update public.barbershops set name = 'Test B renombrada'
     where id = 'bbbbbbbb-0000-4000-8000-000000000001' returning id $$,
  '42501', null, 'super admin: no modifica barberías con sesión (solo db_owner)'
);
select throws_ok(
  $$ delete from public.barbershops where id = 'aaaaaaaa-0000-4000-8000-000000000001' returning id $$,
  '42501', null, 'super admin: no borra barberías con sesión (solo db_owner)'
);
select is(
  (select count(*)::int from public.profiles
   where user_id in ('aaaaaaaa-0000-4000-8000-0000000000a1', 'bbbbbbbb-0000-4000-8000-0000000000a1')),
  2, 'super admin: ve todos los perfiles'
);
select throws_ok(
  $$ update public.profiles set role = 'super_admin', barbershop_id = null
     where user_id = 'aaaaaaaa-0000-4000-8000-0000000000a1' returning user_id $$,
  '42501', null, 'super admin: tampoco modifica perfiles con sesión'
);
-- Mínimo privilegio: el super admin no lee ni modifica los datos internos de ninguna barbería
select is_empty(format('select id from public.%I', tbl), format('super admin: no lee %s', tbl))
  from access_cases order by tbl;
select throws_ok(insert_sql, '42501', null, format('super admin: no inserta en %s', tbl))
  from access_cases order by tbl;
select is_empty(update_sql, format('super admin: UPDATE en %s afecta 0 filas', tbl))
  from access_cases where not upd_denied order by tbl;
select throws_ok(update_sql, '42501', null, format('super admin: UPDATE en %s denegado por privilegio', tbl))
  from access_cases where upd_denied order by tbl;
select is_empty(format('delete from public.%I returning id', tbl), format('super admin: DELETE en %s afecta 0 filas', tbl))
  from access_cases where not del_denied order by tbl;
select throws_ok(format('delete from public.%I returning id', tbl), '42501', null,
                 format('super admin: DELETE en %s denegado por privilegio', tbl))
  from access_cases where del_denied order by tbl;
-- Spec 006: description y address de barbershops
select is_empty(
  $$ update public.barbershops set description = 'X', address = 'X' returning id $$,
  'super admin: description y address de barbershops afectan 0 filas'
);
select throws_ok(
  format('update public.barbershops set %I = %s', c.col, c.val),
  '42501', null, format('super admin: no modifica barbershops.%s', c.col)
)
from (values
  ('name', quote_literal('Otro')), ('subdomain', quote_literal('otro')),
  ('timezone', quote_literal('America/Bogota')), ('is_active', 'false')
) as c (col, val);

-- ===========================================================================
-- Nadie reactiva una cita cancelada, tampoco el servidor (superusuario / db_owner)
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
set local app.user_id = 'aaaaaaaa-0000-4000-8000-0000000000a1';

select is_empty($$ select id from public.barbershops $$, 'admin de barbería desactivada: no ve su barbería');
select is_empty(format('select id from public.%I', tbl), format('admin de barbería desactivada: no lee %s', tbl))
  from access_cases order by tbl;
select throws_ok(insert_sql, '42501', null, format('admin de barbería desactivada: no inserta en %s', tbl))
  from access_cases order by tbl;
select is_empty(update_sql, format('admin de barbería desactivada: UPDATE en %s afecta 0 filas', tbl))
  from access_cases where not upd_denied order by tbl;
select throws_ok(update_sql, '42501', null, format('admin de barbería desactivada: UPDATE en %s denegado por privilegio', tbl))
  from access_cases where upd_denied order by tbl;
select is_empty(format('delete from public.%I returning id', tbl),
                format('admin de barbería desactivada: DELETE en %s afecta 0 filas', tbl))
  from access_cases where not del_denied order by tbl;
select throws_ok(format('delete from public.%I returning id', tbl), '42501', null,
                 format('admin de barbería desactivada: DELETE en %s denegado por privilegio', tbl))
  from access_cases where del_denied order by tbl;
-- Spec 006: description y address de barbershops
select is_empty(
  $$ update public.barbershops set description = 'X', address = 'X' returning id $$,
  'admin de barbería desactivada: description y address de barbershops afectan 0 filas'
);
select throws_ok(
  format('update public.barbershops set %I = %s', c.col, c.val),
  '42501', null, format('admin de barbería desactivada: no modifica barbershops.%s', c.col)
)
from (values
  ('name', quote_literal('Otro')), ('subdomain', quote_literal('otro')),
  ('timezone', quote_literal('America/Bogota')), ('is_active', 'false')
) as c (col, val);
select is_empty(
  $$ update public.services set description = 'X' returning id $$,
  'admin de barbería desactivada: services.description afecta 0 filas'
);

set local app.user_id = 'cccccccc-0000-4000-8000-0000000000a1';
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
