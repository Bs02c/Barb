-- T011 (historia 4 y casos límite): consentimiento, formatos, coherencia y borrado.
-- Códigos: 23502 not null, 23514 check, 23505 unique, 23503 foreign key, 23P01 exclusión.
-- MAINT-005: cada caso viola una sola regla y se comprueba el código Y el nombre de la restricción
-- (mensaje exacto de Postgres). Excepción documentada: en appointments, "fin <= inicio" incumple a la
-- vez appointments_time_order_check y otra regla de duración (time_order se deduce de
-- duration_check + duración >= 1, así que no puede violarse sola); esos casos usan throws_matching
-- con la lista exacta de restricciones que pueden saltar.
begin;
create extension if not exists pgtap with schema extensions;

select plan(34);

-- ---------------------------------------------------------------------------
-- Datos de prueba
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-0000000000a1', 'u1@test.example.com');

insert into public.barbershops (id, name, subdomain) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Test A', 'test-a'),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'Test B', 'test-b');
insert into public.barbers (id, barbershop_id, name) values
  ('aaaaaaaa-0000-4000-8000-0000000000b1', 'aaaaaaaa-0000-4000-8000-000000000001', 'X'),
  ('bbbbbbbb-0000-4000-8000-0000000000b1', 'bbbbbbbb-0000-4000-8000-000000000001', 'Z');
insert into public.services (id, barbershop_id, name, duration_minutes, price) values
  ('aaaaaaaa-0000-4000-8000-0000000000c1', 'aaaaaaaa-0000-4000-8000-000000000001', 'Corte', 30, 20000),
  ('bbbbbbbb-0000-4000-8000-0000000000c1', 'bbbbbbbb-0000-4000-8000-000000000001', 'Corte', 30, 20000);
insert into public.barber_schedules (barbershop_id, barber_id, weekday, start_time, end_time) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000b1', 1, '09:00', '13:00');
insert into public.barber_blocks (barbershop_id, barber_id, starts_at, ends_at) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000b1', '2030-02-01 15:00Z', '2030-02-01 17:00Z');

-- Inserta una cita en A a partir de un JSON con los campos que cambian respecto de una cita válida.
create function pg_temp.book(p jsonb default '{}')
returns void
language sql
as $$
  insert into public.appointments (
    barbershop_id, barber_id, service_id, starts_at, ends_at,
    service_duration_minutes, service_price, status, cancelled_at,
    customer_name, customer_phone, customer_email, data_consent_at)
  select
    coalesce((v ->> 'barbershop_id')::uuid, 'aaaaaaaa-0000-4000-8000-000000000001'),
    coalesce((v ->> 'barber_id')::uuid, 'aaaaaaaa-0000-4000-8000-0000000000b1'),
    coalesce((v ->> 'service_id')::uuid, 'aaaaaaaa-0000-4000-8000-0000000000c1'),
    coalesce((v ->> 'starts_at')::timestamptz, '2030-01-07 15:00Z'),
    coalesce((v ->> 'ends_at')::timestamptz, '2030-01-07 15:30Z'),
    coalesce((v ->> 'service_duration_minutes')::int, 30),
    coalesce((v ->> 'service_price')::numeric, 20000),
    coalesce((v ->> 'status')::public.appointment_status, 'active'),
    (v ->> 'cancelled_at')::timestamptz,
    coalesce(v ->> 'customer_name', 'Cliente'),
    coalesce(v ->> 'customer_phone', '+573001234567'),
    coalesce(v ->> 'customer_email', 'cliente@test.example.com'),
    case when v ? 'data_consent_at' then (v ->> 'data_consent_at')::timestamptz else now() end
  from (select p as v) s;
$$;

-- Mensaje exacto de Postgres al violar un check concreto.
create function pg_temp.check_msg(tbl text, con text)
returns text
language sql
immutable
as $$ select format('new row for relation "%s" violates check constraint "%s"', tbl, con) $$;

-- ---------------------------------------------------------------------------
-- Citas: consentimiento y formatos (historia 4)
-- Las citas rechazadas usan el hueco 2030-01-08 15:00Z para no chocar con la cita válida.
-- ---------------------------------------------------------------------------
select lives_ok($$ select pg_temp.book() $$, 'cita válida con consentimiento: aceptada');
select throws_ok(
  $$ select pg_temp.book('{"data_consent_at": null, "starts_at": "2030-01-08 15:00Z", "ends_at": "2030-01-08 15:30Z"}') $$,
  '23502', 'null value in column "data_consent_at" of relation "appointments" violates not-null constraint',
  'cita sin consentimiento de datos: rechazada'
);
select throws_ok(
  $$ select pg_temp.book('{"customer_phone": "3001234567", "starts_at": "2030-01-08 15:00Z", "ends_at": "2030-01-08 15:30Z"}') $$,
  '23514', pg_temp.check_msg('appointments', 'appointments_customer_phone_check'),
  'teléfono sin prefijo internacional: rechazado'
);
select throws_ok(
  $$ select pg_temp.book('{"customer_phone": "+57 300 123 4567", "starts_at": "2030-01-08 15:00Z", "ends_at": "2030-01-08 15:30Z"}') $$,
  '23514', pg_temp.check_msg('appointments', 'appointments_customer_phone_check'),
  'teléfono con espacios (no E.164): rechazado'
);
select throws_ok(
  $$ select pg_temp.book('{"customer_email": "no-es-correo", "starts_at": "2030-01-08 15:00Z", "ends_at": "2030-01-08 15:30Z"}') $$,
  '23514', pg_temp.check_msg('appointments', 'appointments_customer_email_check1'),
  'correo inválido (formato): rechazado'
);
select throws_ok(
  $$ select pg_temp.book('{"customer_name": "", "starts_at": "2030-01-08 15:00Z", "ends_at": "2030-01-08 15:30Z"}') $$,
  '23514', pg_temp.check_msg('appointments', 'appointments_customer_name_check'),
  'nombre vacío: rechazado'
);

-- ---------------------------------------------------------------------------
-- Citas: coherencia de tiempos y estado
-- ---------------------------------------------------------------------------
-- Fin <= inicio: dos reglas a la vez (ver cabecera).
select throws_matching(
  $$ select pg_temp.book('{"starts_at": "2030-01-08 15:30Z", "ends_at": "2030-01-08 15:00Z"}') $$,
  '^new row for relation "appointments" violates check constraint "appointments_(duration|time_order)_check"$',
  'cita con fin anterior al inicio: rechazada (duration_check / time_order_check)'
);
select throws_matching(
  $$ select pg_temp.book('{"starts_at": "2030-01-08 15:00Z", "ends_at": "2030-01-08 15:00Z"}') $$,
  '^new row for relation "appointments" violates check constraint "appointments_(duration|time_order)_check"$',
  'cita con fin igual al inicio: rechazada (duration_check / time_order_check)'
);
select throws_matching(
  $$ select pg_temp.book('{"service_duration_minutes": 0, "starts_at": "2030-01-08 15:00Z", "ends_at": "2030-01-08 15:00Z"}') $$,
  '^new row for relation "appointments" violates check constraint "appointments_(service_duration_minutes|time_order)_check"$',
  'cita con duración 0: rechazada (service_duration_minutes_check / time_order_check)'
);
-- Una sola regla
select throws_ok(
  $$ select pg_temp.book('{"starts_at": "2030-01-08 15:00Z", "ends_at": "2030-01-08 15:45Z"}') $$,
  '23514', pg_temp.check_msg('appointments', 'appointments_duration_check'),
  'fin distinto de inicio + duración (y posterior al inicio): rechazada'
);
select throws_ok(
  $$ select pg_temp.book('{"service_duration_minutes": 481, "starts_at": "2030-01-08 15:00Z", "ends_at": "2030-01-08 23:01Z"}') $$,
  '23514', pg_temp.check_msg('appointments', 'appointments_service_duration_minutes_check'),
  'cita de más de 480 minutos (fin coherente): rechazada'
);
select throws_ok(
  $$ select pg_temp.book('{"service_price": -1, "starts_at": "2030-01-08 15:00Z", "ends_at": "2030-01-08 15:30Z"}') $$,
  '23514', pg_temp.check_msg('appointments', 'appointments_service_price_check'),
  'cita con precio negativo: rechazada'
);
select throws_ok(
  $$ select pg_temp.book('{"status": "cancelled", "starts_at": "2030-01-08 15:00Z", "ends_at": "2030-01-08 15:30Z"}') $$,
  '23514', pg_temp.check_msg('appointments', 'appointments_cancelled_at_check'),
  'cancelada sin cancelled_at: rechazada'
);
select throws_ok(
  $$ select pg_temp.book('{"cancelled_at": "2030-01-01 00:00Z", "starts_at": "2030-01-08 15:00Z", "ends_at": "2030-01-08 15:30Z"}') $$,
  '23514', pg_temp.check_msg('appointments', 'appointments_cancelled_at_check'),
  'activa con cancelled_at: rechazada'
);
select throws_ok(
  $$ select pg_temp.book('{"service_id": "bbbbbbbb-0000-4000-8000-0000000000c1", "starts_at": "2030-01-08 15:00Z", "ends_at": "2030-01-08 15:30Z"}') $$,
  '23503', 'insert or update on table "appointments" violates foreign key constraint "appointments_service_fkey"',
  'cita de A con un servicio de B: rechazada (FK compuesta)'
);

-- FR-014: localizar las citas de un teléfono o correo dentro de la barbería
select is(
  (select count(*)::int from public.appointments
   where barbershop_id = 'aaaaaaaa-0000-4000-8000-000000000001'
     and (customer_phone = '+573001234567' or customer_email = 'cliente@test.example.com')),
  1, 'se localizan las citas por teléfono o correo en la barbería'
);

-- ---------------------------------------------------------------------------
-- Servicios
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.services (barbershop_id, name, duration_minutes, price)
     values ('aaaaaaaa-0000-4000-8000-000000000001', 'S', 0, 0) $$,
  '23514', pg_temp.check_msg('services', 'services_duration_minutes_check'),
  'servicio de 0 minutos: rechazado'
);
select throws_ok(
  $$ insert into public.services (barbershop_id, name, duration_minutes, price)
     values ('aaaaaaaa-0000-4000-8000-000000000001', 'S', -10, 0) $$,
  '23514', pg_temp.check_msg('services', 'services_duration_minutes_check'),
  'servicio de duración negativa: rechazado'
);
select throws_ok(
  $$ insert into public.services (barbershop_id, name, duration_minutes, price)
     values ('aaaaaaaa-0000-4000-8000-000000000001', 'S', 30, -1) $$,
  '23514', pg_temp.check_msg('services', 'services_price_check'),
  'servicio con precio negativo: rechazado'
);

-- ---------------------------------------------------------------------------
-- Horario semanal y bloqueos
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.barber_schedules (barbershop_id, barber_id, weekday, start_time, end_time)
     values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000b1', 2, '13:00', '09:00') $$,
  '23514', pg_temp.check_msg('barber_schedules', 'barber_schedules_time_order_check'),
  'tramo con fin anterior al inicio: rechazado'
);
select throws_ok(
  $$ insert into public.barber_schedules (barbershop_id, barber_id, weekday, start_time, end_time)
     values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000b1', 8, '09:00', '10:00') $$,
  '23514', pg_temp.check_msg('barber_schedules', 'barber_schedules_weekday_check'),
  'día de la semana fuera de 1–7: rechazado'
);
select throws_ok(
  $$ insert into public.barber_schedules (barbershop_id, barber_id, weekday, start_time, end_time)
     values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000b1', 1, '12:00', '15:00') $$,
  '23P01', 'conflicting key value violates exclusion constraint "barber_schedules_no_overlap"',
  'tramo solapado del mismo barbero y día: rechazado'
);
select lives_ok(
  $$ insert into public.barber_schedules (barbershop_id, barber_id, weekday, start_time, end_time)
     values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000b1', 1, '14:00', '19:00') $$,
  'segundo tramo el mismo día (mañana y tarde): aceptado'
);
select throws_ok(
  $$ insert into public.barber_blocks (barbershop_id, barber_id, starts_at, ends_at)
     values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000b1',
             '2030-02-02 17:00Z', '2030-02-02 15:00Z') $$,
  '23514', pg_temp.check_msg('barber_blocks', 'barber_blocks_time_order_check'),
  'bloqueo con fin anterior al inicio: rechazado'
);

-- ---------------------------------------------------------------------------
-- Barberías: subdominio
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.barbershops (name, subdomain) values ('S', 'LaBarberia') $$,
  '23514', pg_temp.check_msg('barbershops', 'barbershops_subdomain_check'),
  'subdominio con mayúsculas: rechazado (formato)'
);
select throws_ok(
  $$ insert into public.barbershops (name, subdomain) values ('S', '-barberia') $$,
  '23514', pg_temp.check_msg('barbershops', 'barbershops_subdomain_check'),
  'subdominio que empieza por guion: rechazado (formato)'
);
select throws_ok(
  $$ insert into public.barbershops (name, subdomain) values ('S', 'www') $$,
  '23514', pg_temp.check_msg('barbershops', 'barbershops_subdomain_check1'),
  'subdominio reservado (www): rechazado (lista de reservados)'
);
select throws_ok(
  $$ insert into public.barbershops (name, subdomain) values ('S', 'test-a') $$,
  '23505', 'duplicate key value violates unique constraint "barbershops_subdomain_key"',
  'subdominio repetido: rechazado'
);

-- ---------------------------------------------------------------------------
-- Perfiles incoherentes
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.profiles (user_id, role, barbershop_id)
     values ('aaaaaaaa-0000-4000-8000-0000000000a1', 'admin', null) $$,
  '23514', pg_temp.check_msg('profiles', 'profiles_role_barbershop_check'),
  'admin sin barbería: rechazado'
);
select throws_ok(
  $$ insert into public.profiles (user_id, role, barbershop_id)
     values ('aaaaaaaa-0000-4000-8000-0000000000a1', 'super_admin', 'aaaaaaaa-0000-4000-8000-000000000001') $$,
  '23514', pg_temp.check_msg('profiles', 'profiles_role_barbershop_check'),
  'super admin con barbería: rechazado'
);

-- ---------------------------------------------------------------------------
-- Borrado (FK de appointments con NO ACTION)
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ delete from public.barbers where id = 'aaaaaaaa-0000-4000-8000-0000000000b1' $$,
  '23503', 'update or delete on table "barbers" violates foreign key constraint "appointments_barber_fkey" on table "appointments"',
  'borrar un barbero con citas: rechazado'
);
select throws_ok(
  $$ delete from public.services where id = 'aaaaaaaa-0000-4000-8000-0000000000c1' $$,
  '23503', 'update or delete on table "services" violates foreign key constraint "appointments_service_fkey" on table "appointments"',
  'borrar un servicio con citas: rechazado'
);

-- Desactivar no borra las citas
update public.barbers set is_active = false where id = 'aaaaaaaa-0000-4000-8000-0000000000b1';
update public.services set is_active = false where id = 'aaaaaaaa-0000-4000-8000-0000000000c1';

insert into public.profiles (user_id, role, barbershop_id)
values ('aaaaaaaa-0000-4000-8000-0000000000a1', 'admin', 'aaaaaaaa-0000-4000-8000-000000000001');

select lives_ok(
  $$ delete from public.barbershops where id = 'aaaaaaaa-0000-4000-8000-000000000001' $$,
  'borrar una barbería con barberos, servicios y citas: aceptado (cascada)'
);
select ok(
  not exists (select 1 from public.barbers where barbershop_id = 'aaaaaaaa-0000-4000-8000-000000000001')
  and not exists (select 1 from public.services where barbershop_id = 'aaaaaaaa-0000-4000-8000-000000000001')
  and not exists (select 1 from public.barber_schedules where barbershop_id = 'aaaaaaaa-0000-4000-8000-000000000001')
  and not exists (select 1 from public.barber_blocks where barbershop_id = 'aaaaaaaa-0000-4000-8000-000000000001')
  and not exists (select 1 from public.appointments where barbershop_id = 'aaaaaaaa-0000-4000-8000-000000000001')
  and not exists (select 1 from public.profiles where barbershop_id = 'aaaaaaaa-0000-4000-8000-000000000001')
  and exists (select 1 from public.barbers where barbershop_id = 'bbbbbbbb-0000-4000-8000-000000000001'),
  'la cascada no deja huérfanos de A y no toca B'
);

select * from finish();
rollback;
