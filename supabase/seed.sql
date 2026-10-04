-- Datos de demostración. SOLO para la base local (`npx supabase start` / `npm run db:reset`).
-- Nunca se cargan en el entorno de pruebas ni en producción: el entorno de pruebas tendrá en la
-- fase 7 su propio seed, sin usuarios con contraseña conocida (ADR-014).
-- Se aplica con `npm run db:reset` después de las migraciones.
--
-- Usuarios de demostración (contraseña común, solo existe en local): Demo-Barberia-2026
--   superadmin@example.com            super_admin
--   admin@labarberia.example.com      admin de "La Barbería"  (subdominio labarberia)
--   admin@elcorte.example.com         admin de "El Corte"     (subdominio elcorte)
--
-- UUIDs fijos para que el conjunto de datos sea siempre el mismo.

-- ---------------------------------------------------------------------------
-- Usuarios de Supabase Auth
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  extensions.crypt('Demo-Barberia-2026', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(),
  '', '', '', ''
from (values
  ('00000000-0000-4000-8000-000000000001'::uuid, 'superadmin@example.com'),
  ('00000000-0000-4000-8000-000000000002'::uuid, 'admin@labarberia.example.com'),
  ('00000000-0000-4000-8000-000000000003'::uuid, 'admin@elcorte.example.com')
) as u (id, email);

insert into auth.identities (user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at)
select
  u.id, 'email', u.id::text,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  now(), now(), now()
from auth.users u
where u.id in (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003'
);

-- ---------------------------------------------------------------------------
-- Barberías
-- ---------------------------------------------------------------------------
insert into public.barbershops (id, name, subdomain, timezone) values
  ('11111111-1111-4111-8111-111111111111', 'La Barbería', 'labarberia', 'America/Bogota'),
  ('22222222-2222-4222-8222-222222222222', 'El Corte', 'elcorte', 'America/Bogota');

insert into public.profiles (user_id, role, barbershop_id) values
  ('00000000-0000-4000-8000-000000000001', 'super_admin', null),
  ('00000000-0000-4000-8000-000000000002', 'admin', '11111111-1111-4111-8111-111111111111'),
  ('00000000-0000-4000-8000-000000000003', 'admin', '22222222-2222-4222-8222-222222222222');

-- ---------------------------------------------------------------------------
-- Barberos (2 por barbería)
-- ---------------------------------------------------------------------------
insert into public.barbers (id, barbershop_id, name) values
  ('11111111-0000-4000-8000-0000000000b1', '11111111-1111-4111-8111-111111111111', 'Andrés'),
  ('11111111-0000-4000-8000-0000000000b2', '11111111-1111-4111-8111-111111111111', 'Camilo'),
  ('22222222-0000-4000-8000-0000000000b1', '22222222-2222-4222-8222-222222222222', 'Julián'),
  ('22222222-0000-4000-8000-0000000000b2', '22222222-2222-4222-8222-222222222222', 'Mateo');

-- ---------------------------------------------------------------------------
-- Servicios (3 por barbería, precios en COP)
-- ---------------------------------------------------------------------------
insert into public.services (id, barbershop_id, name, duration_minutes, price) values
  ('11111111-0000-4000-8000-0000000000c1', '11111111-1111-4111-8111-111111111111', 'Corte clásico', 30, 25000),
  ('11111111-0000-4000-8000-0000000000c2', '11111111-1111-4111-8111-111111111111', 'Barba', 20, 15000),
  ('11111111-0000-4000-8000-0000000000c3', '11111111-1111-4111-8111-111111111111', 'Corte y barba', 50, 35000),
  ('22222222-0000-4000-8000-0000000000c1', '22222222-2222-4222-8222-222222222222', 'Corte', 30, 22000),
  ('22222222-0000-4000-8000-0000000000c2', '22222222-2222-4222-8222-222222222222', 'Perfilado de barba', 15, 12000),
  ('22222222-0000-4000-8000-0000000000c3', '22222222-2222-4222-8222-222222222222', 'Corte infantil', 25, 18000);

-- ---------------------------------------------------------------------------
-- Horario semanal: lunes (1) a sábado (6), dos tramos en hora local
-- (09:00–13:00 y 14:00–19:00) para cada barbero.
-- ---------------------------------------------------------------------------
insert into public.barber_schedules (barbershop_id, barber_id, weekday, start_time, end_time)
select b.barbershop_id, b.id, d.weekday, t.start_time, t.end_time
from public.barbers b
cross join generate_series(1, 6) as d (weekday)
cross join (values
  (time '09:00', time '13:00'),
  (time '14:00', time '19:00')
) as t (start_time, end_time);

-- ---------------------------------------------------------------------------
-- Un bloqueo por barbería (horas locales de Bogotá convertidas a UTC)
-- ---------------------------------------------------------------------------
insert into public.barber_blocks (barbershop_id, barber_id, starts_at, ends_at, reason) values
  ('11111111-1111-4111-8111-111111111111', '11111111-0000-4000-8000-0000000000b2',
   timestamp '2026-10-19 00:00' at time zone 'America/Bogota',
   timestamp '2026-10-24 00:00' at time zone 'America/Bogota', 'Vacaciones'),
  ('22222222-2222-4222-8222-222222222222', '22222222-0000-4000-8000-0000000000b1',
   timestamp '2026-10-14 14:00' at time zone 'America/Bogota',
   timestamp '2026-10-14 16:00' at time zone 'America/Bogota', 'Cita médica');

-- ---------------------------------------------------------------------------
-- Citas: 3 por barbería, una cancelada. Duración y precio copiados del servicio.
-- ---------------------------------------------------------------------------
insert into public.appointments (
  barbershop_id, barber_id, service_id, starts_at, ends_at,
  service_duration_minutes, service_price, status, cancelled_at,
  customer_name, customer_phone, customer_email, data_consent_at
)
select
  s.barbershop_id, a.barber_id, s.id,
  a.local_start at time zone 'America/Bogota',
  a.local_start at time zone 'America/Bogota' + s.duration_minutes * interval '1 minute',
  s.duration_minutes, s.price, a.status::public.appointment_status,
  case when a.status = 'cancelled' then now() end,
  a.customer_name, a.customer_phone, a.customer_email, now()
from (values
  ('11111111-0000-4000-8000-0000000000b1'::uuid, '11111111-0000-4000-8000-0000000000c1'::uuid,
   timestamp '2026-10-13 10:00', 'active', 'Carlos Pérez', '+573001112233', 'carlos@example.com'),
  ('11111111-0000-4000-8000-0000000000b2'::uuid, '11111111-0000-4000-8000-0000000000c3'::uuid,
   timestamp '2026-10-13 15:00', 'active', 'Luis Gómez', '+573004445566', 'luis@example.com'),
  ('11111111-0000-4000-8000-0000000000b1'::uuid, '11111111-0000-4000-8000-0000000000c2'::uuid,
   timestamp '2026-10-13 11:00', 'cancelled', 'Diego Ruiz', '+573007778899', 'diego@example.com'),
  ('22222222-0000-4000-8000-0000000000b1'::uuid, '22222222-0000-4000-8000-0000000000c1'::uuid,
   timestamp '2026-10-13 09:30', 'active', 'Andrea Torres', '+573101112233', 'andrea@example.com'),
  ('22222222-0000-4000-8000-0000000000b2'::uuid, '22222222-0000-4000-8000-0000000000c3'::uuid,
   timestamp '2026-10-13 16:00', 'active', 'Felipe Rojas', '+573104445566', 'felipe@example.com'),
  ('22222222-0000-4000-8000-0000000000b2'::uuid, '22222222-0000-4000-8000-0000000000c2'::uuid,
   timestamp '2026-10-13 17:00', 'cancelled', 'Sergio Díaz', '+573107778899', 'sergio@example.com')
) as a (barber_id, service_id, local_start, status, customer_name, customer_phone, customer_email)
join public.services s on s.id = a.service_id;
