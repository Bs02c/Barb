-- Datos de demostración. SOLO local (`npm run db:reset`).
-- Nunca se cargan en el entorno de pruebas ni en producción: allí los usuarios se crean con
-- `npm run barbershop:create` y contraseña aleatoria (ADR-017 §7).
-- Se carga como db_owner (scripts/db-reset.mts) y exige la marca app.env = 'local' que db/init/roles.sh
-- pone solo en la base local. La forma de la cuenta de Better Auth (user + account 'credential') es la
-- misma que en scripts/lib/admin-user.ts: si cambia allí, cambia aquí.
--
-- Usuarios de demostración (contraseña común, solo existe en local): Demo-Barberia-2026
--   superadmin@example.com            super_admin
--   admin@labarberia.example.com      admin de "La Barbería"  (subdominio labarberia)
--   admin@elcorte.example.com         admin de "El Corte"     (subdominio elcorte)
--
-- UUIDs fijos para que el conjunto de datos sea siempre el mismo.

-- Guardia (FR-008): se niega fuera de la base local o sin la marca de entorno.
do $$
begin
  if current_database() <> 'barberias'
     or current_setting('app.env', true) is distinct from 'local' then
    raise exception 'db/seed.sql es solo para la base local: la base no tiene la marca app.env = ''local'' o no es barberias';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Usuarios de Better Auth (esquema identity). La contraseña es el hash scrypt de Better Auth
-- de "Demo-Barberia-2026", calculado de antemano con better-auth/crypto (formato salt:clave).
-- ---------------------------------------------------------------------------
insert into identity."user" (id, name, email, "emailVerified") values
  ('00000000-0000-4000-8000-000000000001', 'superadmin@example.com', 'superadmin@example.com', true),
  ('00000000-0000-4000-8000-000000000002', 'admin@labarberia.example.com', 'admin@labarberia.example.com', true),
  ('00000000-0000-4000-8000-000000000003', 'admin@elcorte.example.com', 'admin@elcorte.example.com', true);

insert into identity.account ("accountId", "providerId", "userId", password)
select u.id::text, 'credential', u.id,
  'df10c2f0c6f7be81aa57dbc5232e0d67:fdd47128961c23bd9c123422919b5d4dccbb8d7b93cd0e7fca7145dd028b7abe9fb19bf5681e060dbd1c0ce7366dc7fcaf98e9b10ece16bb0c76856590780796'
from identity."user" u
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
