-- Matriz de roles de ADR-017 (spec 005; tests obligatorios 1 y 5, FR-001, FR-002, FR-006).
-- Atributos, propiedad, membresías, CONNECT, pg_hba, privilegios exactos de identity y de db_backup,
-- y comportamiento real de cada rol (service_role, authenticated, auth_login, app_login).
-- Se ejecuta como superusuario; los roles se simulan con set local role dentro de la transacción.
begin;
create schema tap;
create extension pgtap with schema tap;
set search_path = tap, public;
grant usage on schema tap to authenticated, service_role, app_login, auth_login;

select no_plan();

-- ===========================================================================
-- 1. Atributos de cada rol: super, bypassrls, login, inherit, createdb, createrole, replication
-- ===========================================================================
create temp table expected_roles (rolname name, attrs text);
insert into expected_roles values
  ('db_owner',      'f,f,t,t,f,f,f'),
  ('db_backup',     'f,t,t,t,f,f,f'),
  ('app_login',     'f,f,t,f,f,f,f'),
  ('auth_login',    'f,f,t,t,f,f,f'),
  ('authenticated', 'f,f,f,t,f,f,f'),
  ('service_role',  'f,t,f,t,f,f,f');

select is(
  (select concat_ws(',', r.rolsuper, r.rolbypassrls, r.rolcanlogin, r.rolinherit, r.rolcreatedb,
                    r.rolcreaterole, r.rolreplication)
   from pg_roles r where r.rolname = e.rolname),
  e.attrs,
  format('atributos exactos de %s (super, bypassrls, login, inherit, createdb, createrole, replication)', e.rolname))
from expected_roles e
order by e.rolname;

select is_empty(
  $$ select rolname from pg_roles where rolsuper and rolname <> 'postgres' $$,
  'solo postgres es superusuario');
select is(
  (select array_agg(rolname::text order by rolname::text) from pg_roles where rolbypassrls and not rolsuper),
  array['db_backup', 'service_role'],
  'solo db_backup y service_role tienen BYPASSRLS (además del superusuario)');
select hasnt_role('anon', 'el rol anon no existe');

-- Límites de las conexiones de la app y de Better Auth
select ok(
  (select rolconfig @> array['statement_timeout=8s', 'lock_timeout=5s',
                             'idle_in_transaction_session_timeout=10s', 'TimeZone=UTC']
   from pg_roles where rolname = 'app_login'),
  'app_login: statement_timeout 8s, lock_timeout 5s, idle_in_transaction 10s, timezone UTC');
select ok(
  (select rolconfig @> array['statement_timeout=8s', 'lock_timeout=5s',
                             'idle_in_transaction_session_timeout=10s', 'TimeZone=UTC', 'search_path=identity']
   from pg_roles where rolname = 'auth_login'),
  'auth_login: mismos límites y search_path=identity');

-- ===========================================================================
-- 2. app_login: sin propiedad, sin privilegios propios, membresías sin herencia
-- ===========================================================================
select is_empty($$ select 1 from pg_class where relowner = 'app_login'::regrole $$, 'app_login no es dueño de ninguna relación (pg_class)');
select is_empty($$ select 1 from pg_proc where proowner = 'app_login'::regrole $$, 'app_login no es dueño de ninguna función (pg_proc)');
select is_empty($$ select 1 from pg_namespace where nspowner = 'app_login'::regrole $$, 'app_login no es dueño de ningún esquema (pg_namespace)');
select is_empty($$ select 1 from pg_type where typowner = 'app_login'::regrole $$, 'app_login no es dueño de ningún tipo (pg_type)');
select is_empty(
  $$ select 1 from pg_shdepend where refclassid = 'pg_authid'::regclass and refobjid = 'app_login'::regrole and deptype = 'o' $$,
  'app_login no es dueño de ningún objeto (pg_shdepend)');
select is(
  (select datdba::regrole::text from pg_database where datname = current_database()),
  'db_owner', 'la base barberias es de db_owner, no de app_login');

-- Sin privilegios directos (NOINHERIT: los de authenticated y service_role no cuentan)
select is_empty(
  format($q$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = %L and c.relkind in ('r', 'p', 'v', 'm')
               and (has_table_privilege('app_login', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
                    or has_any_column_privilege('app_login', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')) $q$, s.nsp),
  format('app_login sin privilegios directos en ninguna tabla de %s', s.nsp))
from (values ('public'), ('private'), ('identity'), ('dbmate')) as s (nsp);
select is_empty(
  $$ select n.nspname from pg_namespace n
     where n.nspname in ('public', 'private', 'identity', 'extensions', 'dbmate')
       and has_schema_privilege('app_login', n.oid, 'USAGE,CREATE') $$,
  'app_login sin USAGE ni CREATE en ningún esquema de la aplicación');
select is_empty(
  $$ select p.oid::regprocedure from pg_proc p
     where p.pronamespace = 'private'::regnamespace and p.proname !~ '^time(multi)?range$'
       and has_function_privilege('app_login', p.oid, 'EXECUTE') $$,
  'app_login sin EXECUTE en funciones de private');

-- Membresías: authenticated y service_role con INHERIT FALSE, SET TRUE; ninguna otra
select is(
  (select array_agg(roleid::regrole::text order by roleid::regrole::text) from pg_auth_members where member = 'app_login'::regrole),
  array['authenticated', 'service_role'],
  'app_login es miembro solo de authenticated y service_role');
-- Los roles de trabajo no son miembros de nada (revisión spec 005, SEC-013): un `grant db_owner to
-- authenticated` haría al panel dueño de las tablas y RLS no se aplicaría. Lo vigila también la
-- comprobación al arrancar (src/lib/db/startup-check.ts).
select is_empty(
  $$ select member::regrole, roleid::regrole from pg_auth_members
     where member in ('authenticated'::regrole, 'service_role'::regrole) $$,
  'authenticated y service_role no son miembros de ningún rol');
select is(
  (select inherit_option from pg_auth_members where member = 'app_login'::regrole and roleid = 'authenticated'::regrole),
  false, 'app_login -> authenticated: INHERIT FALSE');
select is(
  (select set_option from pg_auth_members where member = 'app_login'::regrole and roleid = 'authenticated'::regrole),
  true, 'app_login -> authenticated: SET TRUE');
select is(
  (select inherit_option from pg_auth_members where member = 'app_login'::regrole and roleid = 'service_role'::regrole),
  false, 'app_login -> service_role: INHERIT FALSE');
select is(
  (select set_option from pg_auth_members where member = 'app_login'::regrole and roleid = 'service_role'::regrole),
  true, 'app_login -> service_role: SET TRUE');
select ok(not pg_has_role('app_login', 'db_owner', 'member'), 'app_login no es miembro de db_owner');

-- ===========================================================================
-- 3. db_backup: solo lectura
-- ===========================================================================
select ok(pg_has_role('db_backup', 'pg_read_all_data', 'member'), 'db_backup es miembro de pg_read_all_data');
select is_empty(
  $$ select n.nspname || '.' || c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname in ('public', 'private', 'identity', 'dbmate') and c.relkind in ('r', 'p')
       and has_table_privilege('db_backup', c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES') $$,
  'db_backup sin escritura (INSERT, UPDATE, DELETE, TRUNCATE) en ninguna tabla');
select is_empty(
  $$ select n.nspname || '.' || c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname in ('public', 'identity', 'dbmate') and c.relkind in ('r', 'p')
       and not has_table_privilege('db_backup', c.oid, 'SELECT') $$,
  'db_backup lee todas las tablas (para pg_dump)');
select ok(
  not pg_has_role('db_backup', 'authenticated', 'usage') and not pg_has_role('db_backup', 'service_role', 'usage'),
  'db_backup no hereda authenticated ni service_role');
select is_empty(
  $$ select n.nspname from pg_namespace n
     where n.nspname in ('public', 'private', 'identity', 'extensions', 'dbmate')
       and has_schema_privilege('db_backup', n.oid, 'CREATE') $$,
  'db_backup no puede crear objetos en ningún esquema');

-- ===========================================================================
-- 4. CONNECT y pg_hba
-- ===========================================================================
select ok(not has_database_privilege('public', current_database(), 'CONNECT'), 'CONNECT revocado a PUBLIC');
select is(
  (select array_agg(r.rolname::text order by r.rolname::text) from pg_roles r
   where r.rolcanlogin and r.rolname <> 'postgres' and has_database_privilege(r.oid, current_database(), 'CONNECT')),
  array['app_login', 'auth_login', 'db_backup', 'db_owner'],
  'CONNECT solo para app_login, auth_login, db_owner y db_backup (además del superusuario)');
select is_empty($$ select * from pg_hba_file_rules where auth_method = 'trust' $$, 'pg_hba.conf sin ninguna línea trust');
select is_empty($$ select * from pg_hba_file_rules where error is not null $$, 'pg_hba.conf sin errores');
select is_empty(
  $$ select * from pg_hba_file_rules where auth_method not in ('peer', 'scram-sha-256', 'reject') $$,
  'pg_hba.conf solo usa peer (postgres local), scram-sha-256 y reject');
-- Revisión spec 005, SEC-003: por red nunca "cualquier origen", y el superusuario nunca por red.
select is_empty(
  $$ select * from pg_hba_file_rules
      where type like 'host%' and auth_method <> 'reject' and address in ('0.0.0.0', '::', 'all') $$,
  'pg_hba.conf no acepta conexiones por red desde cualquier dirección');
select is_empty(
  $$ select * from pg_hba_file_rules
      where type like 'host%' and auth_method <> 'reject' and ('postgres' = any(user_name) or 'all' = any(user_name)) $$,
  'por red no entra el superusuario ni "all"');
select is_empty(
  $$ select * from pg_hba_file_rules
      where type like 'host%' and auth_method <> 'reject' and not (database = array['barberias']) $$,
  'por red solo se conecta a la base barberias');

-- ===========================================================================
-- 5. identity: solo auth_login
-- ===========================================================================
select ok(c.relrowsecurity, format('RLS activo en identity.%s', c.relname))
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'identity' and c.relkind = 'r'
order by c.relname;
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'identity' and c.relkind = 'r'),
  5, 'identity tiene las 5 tablas de Better Auth');
select table_privs_are('identity', c.relname, 'auth_login', array['DELETE', 'INSERT', 'SELECT', 'UPDATE'],
  format('auth_login: SELECT, INSERT, UPDATE y DELETE en identity.%s', c.relname))
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'identity' and c.relkind = 'r'
order by c.relname;
select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'identity' and c.relkind = 'r'
       and (has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
            or has_table_privilege('service_role', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
            or has_any_column_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
            or has_any_column_privilege('service_role', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')) $$,
  'authenticated y service_role sin ningún privilegio en identity.*');
select is_empty(
  $$ select n.nspname from pg_namespace n
     where n.nspname in ('identity', 'extensions', 'dbmate')
       and (has_schema_privilege('authenticated', n.oid, 'USAGE,CREATE')
            or has_schema_privilege('service_role', n.oid, 'USAGE,CREATE')) $$,
  'authenticated y service_role sin USAGE en identity, extensions ni dbmate');
select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname in ('public', 'private', 'dbmate') and c.relkind in ('r', 'p')
       and has_table_privilege('auth_login', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') $$,
  'auth_login sin privilegios en las tablas de negocio ni en dbmate');
select is_empty(
  $$ select tablename from pg_policies where schemaname = 'identity' and roles <> array['auth_login']::name[] $$,
  'las únicas políticas de identity son para auth_login');

-- ===========================================================================
-- 6. Datos de prueba para el comportamiento (como superusuario)
-- A = barbería activa con admin; C = barbería DESACTIVADA con admin; D = usuario sin perfil
-- ===========================================================================
insert into identity."user" (id, name, email) values
  ('aaaaaaaa-0000-4000-8000-0000000000a1', 'admin-a@test.example.com', 'admin-a@test.example.com'),
  ('cccccccc-0000-4000-8000-0000000000a1', 'admin-c@test.example.com', 'admin-c@test.example.com'),
  ('dddddddd-0000-4000-8000-0000000000a1', 'sinperfil@test.example.com', 'sinperfil@test.example.com');
insert into public.barbershops (id, name, subdomain, is_active) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Test A', 'test-a', true),
  ('cccccccc-0000-4000-8000-000000000001', 'Test C', 'test-c', false);
insert into public.profiles (user_id, role, barbershop_id) values
  ('aaaaaaaa-0000-4000-8000-0000000000a1', 'admin', 'aaaaaaaa-0000-4000-8000-000000000001'),
  ('cccccccc-0000-4000-8000-0000000000a1', 'admin', 'cccccccc-0000-4000-8000-000000000001');
insert into public.barbers (id, barbershop_id, name) values
  ('aaaaaaaa-0000-4000-8000-0000000000b1', 'aaaaaaaa-0000-4000-8000-000000000001', 'Barbero A'),
  ('cccccccc-0000-4000-8000-0000000000b1', 'cccccccc-0000-4000-8000-000000000001', 'Barbero C');
insert into public.services (id, barbershop_id, name, duration_minutes, price) values
  ('aaaaaaaa-0000-4000-8000-0000000000c1', 'aaaaaaaa-0000-4000-8000-000000000001', 'Corte A', 30, 20000),
  ('cccccccc-0000-4000-8000-0000000000c1', 'cccccccc-0000-4000-8000-000000000001', 'Corte C', 30, 20000);
insert into public.barber_schedules (barbershop_id, barber_id, weekday, start_time, end_time) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000b1', 1, '09:00', '13:00'),
  ('cccccccc-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-0000000000b1', 1, '09:00', '13:00');
insert into public.barber_blocks (barbershop_id, barber_id, starts_at, ends_at) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000b1', '2030-01-01 15:00Z', '2030-01-01 17:00Z'),
  ('cccccccc-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-0000000000b1', '2030-01-01 15:00Z', '2030-01-01 17:00Z');
insert into public.appointments (
  barbershop_id, barber_id, service_id, starts_at, ends_at, service_duration_minutes, service_price,
  customer_name, customer_phone, customer_email, data_consent_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000b1', 'aaaaaaaa-0000-4000-8000-0000000000c1',
   '2030-01-02 15:00Z', '2030-01-02 15:30Z', 30, 20000, 'Cliente A', '+573001110000', 'a@test.example.com', now()),
  ('cccccccc-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-0000000000b1', 'cccccccc-0000-4000-8000-0000000000c1',
   '2030-01-02 15:00Z', '2030-01-02 15:30Z', 30, 20000, 'Cliente C', '+573002220000', 'c@test.example.com', now());

create temp table business_tables (tbl text primary key);
insert into business_tables values
  ('appointments'), ('barber_blocks'), ('barber_schedules'), ('barbers'), ('barbershops'), ('profiles'), ('services');
grant select on business_tables to authenticated;

-- Control: como superusuario las siete tablas tienen datos (si no, los "0 filas" no probarían nada)
select isnt_empty(format('select 1 from public.%I', tbl), format('control: %s tiene filas', tbl))
from business_tables order by tbl;

-- ===========================================================================
-- 7. Test 5: usuario sin perfil y admin de barbería desactivada ven 0 filas en TODAS las tablas
-- ===========================================================================
set local role authenticated;
set local app.user_id = 'dddddddd-0000-4000-8000-0000000000a1';
select is_empty(format('select 1 from public.%I', tbl), format('usuario sin perfil: 0 filas en %s', tbl))
from business_tables order by tbl;

set local app.user_id = 'cccccccc-0000-4000-8000-0000000000a1';
-- Su propio perfil sigue visible (profiles_select por user_id); el resto, nada
select is_empty(format('select 1 from public.%I', tbl), format('admin de barbería desactivada: 0 filas en %s', tbl))
from business_tables where tbl <> 'profiles' order by tbl;
select is((select count(*)::int from public.profiles), 1, 'admin de barbería desactivada: solo ve su propio perfil');

-- Sin identidad (app.user_id vacío): 0 filas en todas
set local app.user_id = '';
select is_empty(format('select 1 from public.%I', tbl), format('authenticated sin app.user_id: 0 filas en %s', tbl))
from business_tables order by tbl;
reset role;
-- Con la variable restablecida: tampoco hay filas
reset app.user_id;
set local role authenticated;
select is_empty(format('select 1 from public.%I', tbl), format('authenticated con app.user_id restablecido: 0 filas en %s', tbl))
from business_tables order by tbl;

-- ===========================================================================
-- 8. authenticated (admin de A): comportamiento real con los privilegios exactos
-- ===========================================================================
set local app.user_id = 'aaaaaaaa-0000-4000-8000-0000000000a1';
select is((select count(*)::int from public.barbershops), 1, 'authenticated (admin A): ve solo su barbería');
select lives_ok(
  $$ insert into public.barber_schedules (barbershop_id, barber_id, weekday, start_time, end_time)
     values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000b1', 2, '09:00', '13:00') $$,
  'authenticated: inserta un tramo de horario (exclusión con private.timerange y btree_gist funciona sin EXECUTE)');
select throws_ok(
  $$ insert into public.barber_schedules (barbershop_id, barber_id, weekday, start_time, end_time)
     values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000b1', 2, '12:00', '15:00') $$,
  '23P01', null, 'authenticated: un tramo solapado se rechaza (23P01)');
select throws_ok($$ select 1 from identity."user" $$, '42501', null, 'authenticated: no lee identity."user"');
select throws_ok($$ select 1 from identity.session $$, '42501', null, 'authenticated: no lee identity.session');
select throws_ok($$ select private.is_valid_timezone('UTC') $$, '42501', null, 'authenticated: no ejecuta private.is_valid_timezone');
select throws_ok($$ select 1 from dbmate.schema_migrations $$, '42501', null, 'authenticated: no lee dbmate.schema_migrations');
select throws_ok($$ truncate public.barbers $$, '42501', null, 'authenticated: no puede TRUNCATE');
select is(
  (select private.current_user_id()), 'aaaaaaaa-0000-4000-8000-0000000000a1'::uuid,
  'private.current_user_id() devuelve app.user_id');
reset role;

-- ===========================================================================
-- 9. service_role (reserva pública): privilegios y restricciones reales
-- ===========================================================================
set local role service_role;
select is((select count(*)::int from public.barbershops where subdomain in ('test-a', 'test-c')), 2,
          'service_role: lee todas las barberías (BYPASSRLS)');
select throws_ok($$ select 1 from public.profiles $$, '42501', null, 'service_role: ningún privilegio sobre profiles');
select throws_ok($$ select 1 from identity."user" $$, '42501', null, 'service_role: no lee identity."user"');
select throws_ok(
  $$ insert into public.barbershops (name, subdomain) values ('Intrusa', 'intrusa') $$,
  '42501', null, 'service_role: no crea barberías');
select throws_ok(
  $$ update public.appointments set customer_name = 'X' $$,
  '42501', null, 'service_role: no actualiza datos del cliente (solo status y cancelled_at)');
select throws_ok($$ delete from public.appointments $$, '42501', null, 'service_role: no borra citas');
select throws_ok($$ truncate public.appointments $$, '42501', null, 'service_role: no puede TRUNCATE');
select lives_ok(
  $$ insert into public.appointments (
       barbershop_id, barber_id, service_id, starts_at, ends_at, service_duration_minutes, service_price,
       customer_name, customer_phone, customer_email, data_consent_at, cancel_token_hash)
     values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000b1',
             'aaaaaaaa-0000-4000-8000-0000000000c1', '2030-05-01 15:00Z', '2030-05-01 15:30Z', 30, 20000,
             'Cliente', '+573009990000', 'cliente@test.example.com', now(), decode(repeat('ab', 32), 'hex')) $$,
  'service_role: inserta una cita con su hash de cancelación');
select throws_ok(
  $$ insert into public.appointments (
       barbershop_id, barber_id, service_id, starts_at, ends_at, service_duration_minutes, service_price,
       customer_name, customer_phone, customer_email, data_consent_at)
     values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000b1',
             'aaaaaaaa-0000-4000-8000-0000000000c1', '2030-05-01 15:15Z', '2030-05-01 15:45Z', 30, 20000,
             'Otro', '+573008880000', 'otro@test.example.com', now()) $$,
  '23P01', null, 'service_role: una cita solapada se rechaza (23P01, exclusión con btree_gist)');
select lives_ok(
  $$ insert into public.appointments (
       barbershop_id, barber_id, service_id, starts_at, ends_at, service_duration_minutes, service_price,
       customer_name, customer_phone, customer_email, data_consent_at)
     values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000b1',
             'aaaaaaaa-0000-4000-8000-0000000000c1', '2030-05-02 15:00Z', '2030-05-02 15:30Z', 30, 20000,
             'Cliente', '+573009990000', 'cliente@test.example.com', now()) $$,
  'service_role: segunda cita activa del mismo número');
select throws_ok(
  $$ insert into public.appointments (
       barbershop_id, barber_id, service_id, starts_at, ends_at, service_duration_minutes, service_price,
       customer_name, customer_phone, customer_email, data_consent_at)
     values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000b1',
             'aaaaaaaa-0000-4000-8000-0000000000c1', '2030-05-03 15:00Z', '2030-05-03 15:30Z', 30, 20000,
             'Cliente', '+573009990000', 'cliente@test.example.com', now()) $$,
  '23514', 'tope de citas activas por número (appointments_phone_limit)',
  'service_role: la tercera cita activa del número se rechaza (trigger sin EXECUTE explícito)');
select isnt_empty(
  $$ update public.appointments set status = 'cancelled', cancelled_at = now()
     where cancel_token_hash = decode(repeat('ab', 32), 'hex') and status = 'active' returning id $$,
  'service_role: cancela una cita por el hash del token (UPDATE de status y cancelled_at)');
select throws_ok(
  $$ update public.appointments set status = 'active', cancelled_at = null
     where cancel_token_hash = decode(repeat('ab', 32), 'hex') $$,
  '23514', 'una cita cancelada no puede reactivarse', 'service_role: no reactiva una cita cancelada');
reset role;

-- ===========================================================================
-- 10. auth_login (Better Auth): solo identity; las políticas le dejan trabajar
-- ===========================================================================
set local role auth_login;
select lives_ok(
  $$ insert into identity.session ("expiresAt", token, "userId")
     values (now() + interval '1 day', 'token-de-prueba', 'aaaaaaaa-0000-4000-8000-0000000000a1') $$,
  'auth_login: crea una sesión');
select is((select count(*)::int from identity.session where token = 'token-de-prueba'), 1, 'auth_login: lee la sesión');
select lives_ok(
  $$ insert into identity."rateLimit" (key, count, "lastRequest") values ('127.0.0.1/sign-in/email', 1, 1) $$,
  'auth_login: escribe en rateLimit');
select lives_ok($$ delete from identity.session where token = 'token-de-prueba' $$, 'auth_login: borra la sesión');
select throws_ok($$ select 1 from public.barbers $$, '42501', null, 'auth_login: no lee barbers');
select throws_ok($$ select 1 from public.profiles $$, '42501', null, 'auth_login: no lee profiles');
select throws_ok($$ truncate identity.session $$, '42501', null, 'auth_login: no puede TRUNCATE');
reset role;

-- ===========================================================================
-- 11. app_login: solo puede cambiar a authenticated o service_role
-- ===========================================================================
set local role app_login;
select throws_ok($$ select 1 from public.barbershops $$, '42501', null, 'app_login sin cambiar de rol: no lee barbershops');
-- SET ROLE se comprueba contra el usuario de la sesión (aquí el superusuario), así que desde pgTAP no se
-- puede probar con SET; se consulta la opción SET de la membresía. La prueba real, con una conexión
-- de app_login, está en tests/integration/pool.test.ts (T041).
select ok(not pg_has_role('app_login', r.rolname, 'SET'), format('app_login no puede cambiar a %s', r.rolname))
from (values ('db_owner'), ('db_backup'), ('auth_login'), ('postgres')) as r (rolname)
order by r.rolname;
select ok(pg_has_role('app_login', 'authenticated', 'SET'), 'app_login puede cambiar a authenticated (SET)');
select ok(pg_has_role('app_login', 'service_role', 'SET'), 'app_login puede cambiar a service_role (SET)');
select ok(
  not pg_has_role('app_login', 'authenticated', 'USAGE') and not pg_has_role('app_login', 'service_role', 'USAGE'),
  'app_login no hereda los privilegios de authenticated ni de service_role (sin USAGE de membresía)');
reset role;

select * from finish();
rollback;
