# Modelo de datos: migración a PostgreSQL propio (spec 005)

Las tablas de negocio **no cambian** de columnas, restricciones ni índices. Cambian:
- quién es dueño;
- quién tiene qué privilegio;
- de dónde sale la identidad;
- dónde viven los usuarios.

Todo entra en `db/migrations/0001_baseline.sql` (dbmate) y en `db/init/roles.sh`.

## Roles (globales del cluster, `db/init/roles.sh`)

| Rol | Atributos | Membresías | Uso |
|---|---|---|---|
| `postgres` | SUPERUSER | — | Solo inicialización y tests pgTAP (`docker exec -u postgres`, autenticación `peer`) |
| `db_owner` | LOGIN NOSUPERUSER NOBYPASSRLS | — | Dueño de la base, de los esquemas y de todos los objetos. Usado por dbmate, el script de alta, el seed local y los preparativos de los tests de integración |
| `db_backup` | LOGIN BYPASSRLS | `pg_read_all_data` | `pg_dump` (fase 7). Sin escritura |
| `app_login` | LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE | `authenticated` y `service_role` `WITH INHERIT FALSE, SET TRUE` | Pool de Next.js. Sin privilegios propios |
| `authenticated` | NOLOGIN | — | Panel; identidad en `app.user_id` |
| `service_role` | NOLOGIN BYPASSRLS | — | Reserva, cancelación y lecturas públicas |
| `auth_login` | LOGIN NOSUPERUSER NOBYPASSRLS | — | Pool de Better Auth; `search_path=identity` |

- `app_login` y `auth_login` tienen `SET statement_timeout='8s'`, `lock_timeout='5s'`, `idle_in_transaction_session_timeout='10s'` y `timezone='UTC'`.
- Las contraseñas se leen de `/run/secrets/<rol>_password` (o de `*_FILE`).
- `roles.sh` es idempotente: crea el rol si falta y luego `ALTER ROLE … PASSWORD`.
- Desaparece `anon`.

## Base y esquemas

- La base `barberias` es propiedad de `db_owner`, con `REVOKE CONNECT … FROM PUBLIC` y `GRANT CONNECT` solo a `app_login`, `auth_login`, `db_owner` y `db_backup`.
- `ALTER DEFAULT PRIVILEGES FOR ROLE db_owner REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` (estrecha, no amplía).

| Esquema | Dueño | `USAGE` para | Contenido |
|---|---|---|---|
| `public` | `db_owner` | `authenticated`, `service_role` | Tablas de negocio y tipos (`user_role`, `appointment_status`) |
| `private` | `db_owner` | `authenticated`, `service_role` | Funciones auxiliares, `timerange` y triggers |
| `extensions` | `db_owner` | — | `btree_gist` |
| `identity` | `db_owner` | `auth_login` | Tablas de Better Auth |
| `dbmate` | `db_owner` | — | `schema_migrations` |

`REVOKE ALL ON SCHEMA public FROM PUBLIC`. `pg_stat_statements` se crea como superusuario en la inicialización.

## Identidad

```sql
-- sustituye a auth.uid()
create function private.current_user_id() returns uuid
  language sql stable set search_path = ''
  as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;
revoke execute … from public;  grant execute … to authenticated;
```

- `private.current_barbershop_id()` y `private.is_super_admin()` siguen igual (`SECURITY DEFINER`, propiedad de `db_owner`), pero leen `private.current_user_id()`.
- `profiles_select` usa `(select private.current_user_id())`.

## Privilegios exactos (los comprueba `00_structure` y `07_roles`)

| Tabla | `authenticated` (panel) | `service_role` (público) |
|---|---|---|
| `barbershops` | SELECT | SELECT |
| `profiles` | SELECT | — (ninguno) |
| `barbers` | SELECT, INSERT, UPDATE (`name`, `is_active`), DELETE | SELECT |
| `services` | SELECT, INSERT, UPDATE (`name`, `duration_minutes`, `price`, `is_active`), DELETE | SELECT |
| `barber_schedules` | SELECT, INSERT, DELETE | SELECT |
| `barber_blocks` | SELECT, INSERT, DELETE | SELECT |
| `appointments` | SELECT, UPDATE (`status`, `cancelled_at`) | SELECT, INSERT, UPDATE (`status`, `cancelled_at`) |

- Ningún `TRUNCATE`, `TRIGGER` ni `REFERENCES`.
- `EXECUTE` en `private.*`: `authenticated` solo `current_user_id`, `current_barbershop_id` e `is_super_admin`.
- `is_valid_timezone` sin `EXECUTE` para los roles de la app: el `check` de `barbershops` solo se evalúa al escribir, y las barberías solo las escribe `db_owner`.
- Las funciones de trigger no necesitan `EXECUTE` en tiempo de ejecución.

**Cambio respecto a hoy:** las políticas `barbershops_insert`, `barbershops_update` y `barbershops_delete` del super admin se eliminan. Sin privilegio de escritura son código muerto, y el alta va solo por script (ADR-017 §3: "solo lo que usa el código"). Los asserts correspondientes pasan a comprobar el rechazo por privilegio.

## Esquema `identity`

Tablas de Better Auth 1.7.7, con nombres de columna por defecto. RLS activado con **una sola política por tabla, `for all to auth_login using (true)`**: sin ella `auth_login` (que no es dueño ni tiene BYPASSRLS) no vería ninguna fila (corregido en la implementación, T008). Todo revocado a PUBLIC, `authenticated` y `service_role`. `auth_login` tiene SELECT, INSERT, UPDATE y DELETE en las cinco tablas.

| Tabla | Columnas |
|---|---|
| `"user"` | `id uuid pk default gen_random_uuid()`, `name text not null`, `email text not null unique`, `"emailVerified" boolean not null default false`, `image text`, `"createdAt"` y `"updatedAt" timestamptz not null default now()` |
| `session` | `id uuid pk`, `"expiresAt" timestamptz not null`, `token text not null unique`, `"createdAt"`, `"updatedAt"`, `"ipAddress" text`, `"userAgent" text`, `"userId" uuid not null references "user" on delete cascade` + índice en `"userId"` y en `"expiresAt"` (limpieza) |
| `account` | `id uuid pk`, `"accountId" text not null`, `"providerId" text not null`, `"userId" uuid not null references "user" on delete cascade` + índice, `"accessToken"`, `"refreshToken"`, `"idToken" text`, `"accessTokenExpiresAt"`, `"refreshTokenExpiresAt" timestamptz`, `scope text`, `password text`, `"createdAt"`, `"updatedAt"`; `unique ("providerId", "accountId")` |
| `verification` | `id uuid pk`, `identifier text not null` + índice, `value text not null`, `"expiresAt" timestamptz not null`, `"createdAt"`, `"updatedAt"` |
| `"rateLimit"` | `id uuid pk`, `key text not null unique`, `count integer not null`, `"lastRequest" bigint not null` |

- `public.profiles.user_id uuid primary key references identity."user"(id) on delete cascade`. Sin cambios en las demás columnas.
- **Limpieza de sesiones caducadas:** Better Auth borra las caducadas al leerlas. Además, `db/maintenance/cleanup.sql` (`delete from identity.session where "expiresAt" < now() - interval '1 day'`) se ejecuta en el mismo cron que los respaldos (fase 7). Sin `pg_cron` (constitución VIII).

## Tablas de negocio

Iguales a las migraciones actuales:
- columnas, `check`, FK compuestas, exclusiones `appointments_no_overlap` y `barber_schedules_no_overlap`, índices;
- triggers `appointments_prevent_reactivation` y `appointments_phone_limit`;
- `cancel_token_hash bytea` con índice único parcial.

Solo se eliminan los `revoke … from anon`, se añaden los `GRANT` explícitos de la tabla anterior y la propiedad pasa a `db_owner`.

## Esquema TypeScript (`src/lib/db/schema.ts`, escrito a mano; research §3)

- Solo `pgTable`/`pgSchema` con columnas y tipos de las 7 tablas de `public` que usa la app.
- `timestamp(..., { withTimezone: true, mode: "date" })`, `numeric` como `string`, `customType` `bytea` → `Buffer`, y `pgEnum` para los dos enums.
- Sin FK, `check`, índices ni políticas. Las tablas de `identity` no se modelan: solo las toca Better Auth.
- Test de deriva: `tests/integration/schema-drift.test.ts`.

## Configuración de PostgreSQL (VPS de 4 GB; local igual salvo memoria)

```text
max_connections = 40
shared_buffers = 512MB          # local: 128MB
effective_cache_size = 2GB
work_mem = 4MB
maintenance_work_mem = 64MB
shared_preload_libraries = 'pg_stat_statements'
password_encryption = scram-sha-256
timezone = 'UTC'
log_error_verbosity = terse
log_parameter_max_length_on_error = 0
log_statement = none
log_min_error_statement = panic   # no registrar la sentencia que falló
```

Presupuesto de conexiones: app 10 + auth 3 + migraciones 1 + respaldo 1 + administración 3 = 18 de 40.
