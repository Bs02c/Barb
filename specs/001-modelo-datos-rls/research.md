# Investigación: modelo de datos y aislamiento por barbería

Decisiones técnicas de la fase 1. Comprobado contra Supabase local (Postgres 17.11) el 2026-10-04.

## 1. Cómo sabe RLS a qué barbería y rol pertenece el usuario

- **Decisión**: tabla `public.profiles` (`user_id`, `role`, `barbershop_id`) y dos funciones auxiliares en un schema `private` no expuesto por la API: `private.current_barbershop_id()` y `private.is_super_admin()`. Son `security definer`, `stable`, con `search_path = ''`. Las políticas las llaman envueltas en `(select ...)` para que Postgres las evalúe una vez por consulta y no por fila.
- **Por qué**: es lo más simple de entender y de probar. Cambiar el rol o la barbería de alguien tiene efecto inmediato.
- **Alternativas descartadas**: guardar rol y barbería en el JWT con un *Custom Access Token Hook*. Es más rápido, pero añade un hook que configurar, y los cambios no se aplican hasta que se renueva el token. Se puede migrar si el rendimiento lo pide.

## 2. Permisos por defecto de Supabase

- **Hallazgo**: en `public`, Supabase concede por defecto todos los privilegios de tablas a `anon` y `authenticated`, y `execute` de funciones a ambos. RLS es lo único que los frena.
- **Decisión**:
  - RLS activado en todas las tablas.
  - `revoke all ... from anon` en cada tabla, como defensa adicional: el cliente final no tiene sesión y la reserva pública pasa por el servidor con la clave secreta.
  - Las funciones auxiliares van en `private`, con `execute` solo para `authenticated`.
- **Alternativa descartada**: confiar solo en RLS. Un error en una política dejaría la tabla abierta a cualquiera sin sesión.

## 3. Datos de otra barbería por referencia cruzada

- **Riesgo**: una cita de la barbería A que apunte a un barbero de la barbería B pasaría el filtro por `barbershop_id` y mezclaría datos.
- **Decisión**: claves foráneas compuestas. `barbers` y `services` tienen `unique (id, barbershop_id)`, y las tablas hijas referencian `(barber_id, barbershop_id)` y `(service_id, barbershop_id)`. La base de datos rechaza cualquier referencia a otra barbería.
- **Alternativa descartada**: comprobarlo con triggers o solo en la aplicación (constitución, principio III).

## 4. Citas sin solapamiento

- **Decisión**: restricción de exclusión `exclude using gist (barber_id with =, tstzrange(starts_at, ends_at, '[)') with &&) where (status = 'active')`, con la extensión `btree_gist`. El rango `[)` permite que una cita empiece justo cuando termina otra. El `where` hace que las canceladas no bloqueen.
- **Concurrencia**: la restricción se apoya en un índice y Postgres la garantiza aunque dos transacciones inserten a la vez: solo una se confirma. Si las dos se solapan de verdad, cada una espera a la otra para comprobar la exclusión y Postgres aborta una con `40P01` (deadlock) en lugar de `23P01` (observado en el test de integración el 2026-10-05). La reserva de la fase 4 debe reintentar una vez ante `40P01`. Como un test pgTAP corre en una sola sesión, la simultaneidad (SC-002) se prueba con un test de integración en Vitest que lanza dos inserciones en paralelo contra la base local.
- **Alternativa descartada**: comprobar disponibilidad y luego insertar en la aplicación (condición de carrera).

## 5. Coherencia de cada cita

- `ends_at = starts_at + service_duration_minutes`: restricción `check`. El fin no puede contradecir la duración guardada.
- `status = 'cancelled'` si y solo si `cancelled_at` no es nulo.
- La duración y el precio del servicio se copian en la cita al reservar (FR-012).
- **Diferido a la fase 4**: que la cita caiga dentro del horario del barbero y fuera de sus bloqueos. Expresarlo como restricción exigiría triggers complejos; lo valida la función de reserva de la fase 4 y lo cubren sus tests.

## 6. Zona horaria válida

- **Decisión**: columna `timezone text` con `check (private.is_valid_timezone(timezone))`. La función intenta `now() at time zone tz` y devuelve falso si falla. Se declara `immutable` para poder usarla en un `check`; la lista de zonas de Postgres solo cambia con actualizaciones del sistema.
- **Alternativa descartada**: consultar `pg_timezone_names` dentro del `check`, que no se permite (subconsulta).

## 7. Horario semanal sin tramos solapados

- **Decisión**: tipo de rango propio `private.timerange` sobre `time`, y exclusión `(barber_id with =, weekday with =, private.timerange(start_time, end_time, '[)') with &&)`. Días con numeración ISO: 1 = lunes … 7 = domingo.
- **Por qué**: dos tramos solapados del mismo barbero producirían huecos duplicados en la disponibilidad (fase 4). Cuesta una línea.

## 8. Formatos

- **Teléfono E.164**: `check (customer_phone ~ '^\+[1-9][0-9]{7,14}$')`.
- **Correo**: `check (customer_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')`. La validación completa la hace Zod en el servidor.
- **Subdominio**: `check (subdomain ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$')` y no puede ser `www`, `app`, `api` ni `admin`, que quedan reservados para la plataforma.
- **Precio**: `numeric(12,2)`, mayor o igual que 0. No hay columna de moneda en el MVP (todas las barberías en COP).

## 9. Borrado

- Borrar una barbería borra en cascada todos sus datos (spec: no quedan huérfanos).
- Borrar un barbero o un servicio con citas se rechaza (`on delete no action`): se desactivan (`is_active = false`). Se usa `no action` y no `restrict` porque `restrict` se comprueba al momento y haría fallar el borrado en cascada de una barbería; `no action` se comprueba al final de la sentencia.
- Borrar un usuario de Auth borra su perfil.

## 10. Tests de base de datos

- **pgTAP** en `supabase/tests/*.test.sql`. Cada archivo usa `begin; ... select * from finish(); rollback;` y no deja datos.
- Para actuar como un usuario: `set local role authenticated` y `set local request.jwt.claims = '{"sub": "<uuid>"}'`. Comprobado: `auth.uid()` lee el `sub` de ese ajuste.
- Sin librerías de ayuda externas: dos funciones auxiliares dentro de cada test.

## 11. Datos de demostración

- `supabase/seed.sql`: dos barberías (`labarberia` y `elcorte`, en `America/Bogota`), cada una con su admin, barberos, servicios, horario, un bloqueo y citas; más un super admin.
- Los usuarios se crean en `auth.users` y `auth.identities` con contraseña cifrada (`pgcrypto`), para poder iniciar sesión en local. Las contraseñas de demostración están en el propio `seed.sql`; solo existen en local.

## 12. Ajustes tras la revisión de los tres agentes (2026-10-04)

Informe completo en `Revisiones/2026-10-04-fase-1-modelo-datos-rls.md` del vault. Aprobados por el usuario:
- El admin solo actualiza `status` y `cancelled_at` en citas (permisos por columna) y un trigger impide reactivar una cita cancelada. Así FR-012 (precio y duración inmutables) y la fecha de consentimiento quedan protegidos en la base de datos.
- `authenticated` sin TRUNCATE, TRIGGER ni REFERENCES (TRUNCATE salta RLS).
- Índice `appointments (barber_id, starts_at)`.
- Una barbería desactivada deja a sus admins sin acceso.
- Registro público de usuarios desactivado y contraseña mínima de 8 caracteres.
- Constitución 1.1.1: una operación puede denegarse por ausencia de política si está documentada y probada.
- `seed.sql` es solo local; el entorno de pruebas tendrá su propio seed sin usuarios con contraseña conocida (ADR-014).

Para la fase 4 (disponibilidad, PERF-002/003): filtrar citas con `status = 'active' and tstzrange(starts_at, ends_at, '[)') && <ventana>` para usar el índice GiST; resolver todos los barberos en una sola consulta; valorar un índice `(barber_id, starts_at)` en `barber_blocks`.

## 13. Tipos para la aplicación

- `supabase gen types typescript --local` genera `src/lib/database.types.ts` (script `npm run db:types`). Es el contrato que usarán el agente principal y el agente `frontend`.
