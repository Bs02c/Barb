---
description: "Tareas de la spec 005: migración de Supabase a PostgreSQL propio (ADR-017)"
---

# Tareas: migración a PostgreSQL propio

**Entrada**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/data-access.md](contracts/data-access.md), [contracts/auth-and-ops.md](contracts/auth-and-ops.md), [quickstart.md](quickstart.md)

**Requisitos previos**:
- spec y plan aprobados;
- D1–D3 aprobadas;
- constitución 1.2.1;
- enmienda 1 del ADR-017.

**Tests**: obligatorios (FR-003, FR-020 y constitución I).

**Formato**: `- [ ] Tnnn [P?] [Historia?] Descripción [responsable]`.
- `[P]`: paralelizable (archivos distintos, sin dependencias pendientes).
- Responsables: `[principal]`, `[database]` (solo escribe en `db/` y `docker/db/`) y `[frontend]` (solo `src/app/`, `src/components/` y `tests/e2e/`).

**Reglas para todo agente**:
- Leer `AGENTS.md`: Next.js 16, así que consultar `node_modules/next/dist/docs/` antes de usar `instrumentation`, el proxy, route handlers o server actions.
- Ningún secreto en el repo. Las contraseñas de los roles van solo en `db/init/secrets/`, ignorado por git.
- No registrar datos personales, tokens ni parámetros de consultas: solo `toDbError(e)`.
- Nombres de código en inglés; textos y comentarios en español.
- Versiones exactas de [research.md §1](research.md).
- Terminar con `npm run lint` y `npm run typecheck` en verde y un reporte breve: qué se hizo, qué no y qué falló.

---

## Fase 1: preparación

- [ ] T001 [principal] Medición previa de rendimiento con Supabase local, **antes de cambiar ningún archivo de la app**:
  - crear `scripts/measure-ttfb.mjs`: 30 peticiones `fetch` secuenciales (5 de calentamiento descartadas) a `http://labarberia.localhost:3000/reservar` y a `/admin` con la cookie del admin de demostración, obtenida haciendo login antes;
  - imprimir la mediana y el p90 del tiempo hasta los primeros bytes;
  - `npm run build && npm run start`, ejecutar el script y anotar los resultados en `specs/005-migracion-postgresql/ttfb.md` (sección "Antes", con fecha, commit y máquina);
  - añadir el script `"perf:ttfb": "node scripts/measure-ttfb.mjs"` a `package.json`.
- [ ] T002 [principal] Recuento de referencia de pgTAP: ejecutar `npm run test:db` con Supabase y guardar en `specs/005-migracion-postgresql/pgtap-equivalencia.md` el número de asserts por archivo (00 dinámico, 01=131, 02=7, 03=7, 04=34, 05=8, 06=8) y la descripción de cada assert (`grep` de los mensajes).
  - Es la tabla origen de la correspondencia (FR-003).
- [ ] T003 [principal] Dependencias:
  - `npm install --save-exact better-auth@1.7.7 drizzle-orm@0.45.4 pg@8.23.1` y `npm install --save-exact -D @types/pg@8.23.1`;
  - `npm audit --omit=dev`: ningún aviso alto o crítico en producción. Si lo hay, parar e informar.
  - **No** instalar `drizzle-kit`. No quitar todavía los paquetes de Supabase (T046).
- [ ] T004 [P] [principal] `.gitignore`: añadir `/db/init/secrets/`.
  - `.env.example`: nuevas variables de [contracts/auth-and-ops.md](contracts/auth-and-ops.md#variables-de-entorno), con comentarios y sin valores:
    - `DATABASE_URL` (`app_login`, `127.0.0.1:54329/barberias`);
    - `AUTH_DATABASE_URL`;
    - `DATABASE_OWNER_URL` (comentario: "solo scripts locales y tests; nunca en el contenedor app");
    - `BETTER_AUTH_SECRET` ("≥ 32 caracteres, `openssl rand -base64 32`");
    - `AUTH_SIGNIN_MAX_ATTEMPTS=50` ("5 en servidores").
  - Las variables de Supabase se quitan en T046.

---

## Fase 2: fundamentos (bloquea todas las historias)

### 2a. Base de datos (agente `database`; T005–T013 en secuencia salvo `[P]`)

- [ ] T005 [P] [database] `docker/db/Dockerfile`:
  - `FROM postgres:17`;
  - `apt-get update && apt-get install -y --no-install-recommends postgresql-17-pgtap libtap-parser-sourcehandler-pgtap-perl && rm -rf /var/lib/apt/lists/*`;
  - comprobar que `pg_prove --version` funciona en la imagen.
  - Si el paquete de `pg_prove` no existe con ese nombre, buscar el correcto en Debian y documentarlo en el reporte.
- [ ] T006 [P] [database] `db/postgresql.conf`, con los valores de [data-model.md §Configuración](data-model.md#configuración-de-postgresql-vps-de-4-gb-local-igual-salvo-memoria):
  - `listen_addresses='*'`;
  - `shared_buffers` parametrizable (local 128MB);
  - `log_error_verbosity = terse`, `log_parameter_max_length_on_error = 0`, `log_statement = none`, `log_min_error_statement = panic`;
  - `shared_preload_libraries = 'pg_stat_statements'`, `password_encryption = scram-sha-256`, `timezone = 'UTC'`.

  `db/pg_hba.conf` exactamente:
  - `local all postgres peer`;
  - `local all all scram-sha-256`;
  - `host all all 0.0.0.0/0 scram-sha-256` y `host all all ::/0 scram-sha-256`. La red ya la limita Docker; en el VPS, la red interna;
  - **ninguna** línea `trust` (research §4).
- [ ] T007 [database] `db/init/roles.sh` (bash, `set -euo pipefail`), ejecutado por `docker-entrypoint-initdb.d` como `postgres` y reejecutable a mano:
  - roles y atributos **exactos** de [data-model.md §Roles](data-model.md#roles-globales-del-cluster-dbinitrolessh), idempotente (`DO $$ … if not exists … create role …; $$`, luego `ALTER ROLE … PASSWORD` con contraseñas leídas de `/run/secrets/<rol>_password` y pasadas con `psql -v` y `:'var'`, nunca interpoladas en el texto del SQL);
  - `GRANT authenticated, service_role TO app_login WITH INHERIT FALSE, SET TRUE`;
  - `GRANT pg_read_all_data TO db_backup`;
  - `ALTER ROLE app_login|auth_login SET statement_timeout='8s', lock_timeout='5s', idle_in_transaction_session_timeout='10s', timezone='UTC'` y `ALTER ROLE auth_login SET search_path = identity`;
  - `ALTER DATABASE barberias OWNER TO db_owner`;
  - `CREATE EXTENSION IF NOT EXISTS pg_stat_statements` como superusuario.

  `db/init/secrets.example/README.md` con los nombres de archivo esperados (`db_owner_password`, `app_login_password`, `auth_login_password`, `db_backup_password`, `postgres_password`) y cómo generarlos. Sin valores.
- [ ] T008 [database] `db/migrations/0001_baseline.sql` (dbmate: `-- migrate:up` / `-- migrate:down`), traducción de las 6 migraciones de `supabase/migrations/` con estos cambios ([data-model.md](data-model.md)):
  - **Sin** `auth.*`, `anon`, `extensions` de Supabase ni dependencias de Supabase.
  - `create schema extensions; create extension btree_gist with schema extensions;`. Esquemas `private` e `identity` propiedad de `db_owner`. `REVOKE ALL ON SCHEMA public FROM PUBLIC`.
  - `GRANT USAGE` según la tabla de esquemas de data-model.md.
  - `REVOKE CONNECT ON DATABASE barberias FROM PUBLIC` y `GRANT CONNECT` a `app_login`, `auth_login`, `db_owner` y `db_backup`.
  - `ALTER DEFAULT PRIVILEGES FOR ROLE db_owner REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`.
  - `private.current_user_id()` exactamente como en data-model.md §Identidad. `current_barbershop_id()` e `is_super_admin()` cambian `auth.uid()` por `(select private.current_user_id())`.
  - Tablas de `identity` exactamente como en data-model.md §Esquema identity: tipos `uuid`, `default gen_random_uuid()`, FK `on delete cascade`, índices en `session("userId")`, `session("expiresAt")`, `account("userId")` y `verification(identifier)`, `unique ("providerId","accountId")`. RLS activado sin políticas, `REVOKE ALL … FROM PUBLIC, authenticated, service_role` y `GRANT SELECT, INSERT, UPDATE, DELETE … TO auth_login`.
  - `public.profiles.user_id uuid primary key references identity."user"(id) on delete cascade`.
  - Tablas de negocio, `check`, FK compuestas, exclusiones, índices, triggers y comentarios **idénticos** a las migraciones actuales, también el `0001` de `cancel_token_hash` y el trigger `appointments_phone_limit`.
  - Políticas: las actuales salvo `barbershops_insert/update/delete`, que **se eliminan** (data-model.md §Privilegios), con un comentario que explique por qué.
  - `GRANT` **exactos** de la tabla de privilegios de data-model.md (UPDATE por columna donde se indica). Ningún `GRANT ALL`, `TRUNCATE`, `TRIGGER` ni `REFERENCES`.
  - `EXECUTE` de funciones según data-model.md.
  - Comentario de cabecera: "Excepción única de la constitución 1.2.0: sustituye a las 6 migraciones de Supabase, aplicadas solo en local".
  - `-- migrate:down`: `drop schema … cascade` de lo creado (solo para local).
- [ ] T009 [database] `db/seed.sql`, traducción de `supabase/seed.sql`:
  - mismos ids, barberías, barberos, servicios, horarios, bloqueos y citas;
  - usuarios en `identity."user"` (`name` = correo, `"emailVerified" true`) y `identity.account` (`"providerId" 'credential'`, `"accountId"` = id del usuario, `password` = hash scrypt **precalculado** de `Demo-Barberia-2026`, generado con `node -e "import('better-auth/crypto').then(async m => console.log(await m.hashPassword('Demo-Barberia-2026')))"` y pegado como literal);
  - cabecera: "SOLO local".
  - Antes de insertar, `DO $$ … if current_database() <> 'barberias' or current_setting('app.env', true) is distinct from 'local' then raise exception … $$`. `scripts/db-reset.mts` fija `set app.env = 'local'` antes de cargarlo (FR-008).
- [ ] T010 [database] Reescribir `supabase/tests/00–06` como `db/tests/00_structure.test.sql` … `06_cancel_token.test.sql` (`begin; create schema tap; create extension pgtap with schema tap; set search_path = tap, public; … rollback;`):
  - sesión simulada: `set local role authenticated; select set_config('app.user_id', '<uuid>', true);` en vez de `request.jwt.claims`;
  - usuarios de prueba en `identity."user"`;
  - en 00, los asserts de `anon` se sustituyen por la comprobación de privilegios **exactos** por rol y tabla (`table_privs_are` y `column_privs_are` para `authenticated` y `service_role` con la lista de data-model.md);
  - en 01, los asserts del super admin que escribe barberías pasan a esperar `42501`;
  - mantener **todos** los demás asserts con el mismo significado.
- [ ] T011 [database] `db/tests/07_roles.test.sql` (test obligatorio 1 y parte del 5):
  - atributos de cada rol de la matriz (`rolsuper`, `rolbypassrls`, `rolcanlogin`, `rolinherit`);
  - `app_login` no es dueño de ningún objeto (`pg_class`, `pg_proc`, `pg_namespace`, `pg_type`) y no tiene privilegios directos en ninguna tabla de `public`, `private` ni `identity`;
  - membresías de `app_login` con `inherit_option = false` y `set_option = true` (`pg_auth_members`);
  - `db_backup` sin INSERT, UPDATE ni DELETE en ninguna tabla;
  - `has_database_privilege('public'…)`: `CONNECT` revocado a PUBLIC;
  - `pg_hba_file_rules` sin `auth_method = 'trust'`;
  - `authenticated` y `service_role` sin ningún privilegio en `identity.*`;
  - usuario sin perfil y admin de barbería desactivada: 0 filas en todas las tablas de negocio (test 5).
- [ ] T012 [database] Completar `specs/005-migracion-postgresql/pgtap-equivalencia.md` (creado en T002) con la correspondencia assert a assert, origen → destino, y la justificación de los que cambian de significado (super admin y `anon`).
  - Total nuevo ≥ 224 + asserts de 07 (FR-003, test 6).
- [ ] T013 [database] Verificación de la fase con `docker compose -f compose.dev.yml` (de T014):
  - `up -d db`, `run --rm migrate up`, carga del seed y `pg_prove` de todos los tests en verde;
  - reporte con el recuento de asserts por archivo.

### 2b. Infraestructura local y capa de datos (principal; puede empezar en paralelo con 2a usando data-model.md)

- [ ] T014 [principal] `compose.dev.yml`:
  - servicio `db`:
    - `build: docker/db`, `POSTGRES_DB=barberias`;
    - `POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password` y `secrets` desde `db/init/secrets/*`;
    - monta `db/postgresql.conf`, `db/pg_hba.conf` (`command: postgres -c config_file=… -c hba_file=…`), `db/init/roles.sh` en `/docker-entrypoint-initdb.d/` y `db/tests` en `/tests` (solo lectura);
    - volumen `db-data`;
    - `ports: ["127.0.0.1:54329:5432"]`, con un comentario que cite la constitución 1.2.1 / D2: "solo en desarrollo local";
    - healthcheck `pg_isready`.
  - Servicio `migrate`:
    - `image: ghcr.io/amacneil/dbmate:2.36.0`, `profiles: ["tools"]`;
    - `DATABASE_URL=postgres://db_owner:<de secreto>@db:5432/barberias?sslmode=disable&search_path=dbmate,public`;
    - `DBMATE_MIGRATIONS_DIR=/db/migrations`, `DBMATE_NO_DUMP_SCHEMA=true`, `--wait`;
    - la contraseña se lee de un secreto (un `entrypoint` de shell que exporta la URL desde `/run/secrets/db_owner_password`; ninguna contraseña en el YAML).
  - Scripts de `package.json`, con las definiciones de [contracts/auth-and-ops.md §Comandos](contracts/auth-and-ops.md#comandos-packagejson): `db:start`, `db:stop`, `db:migrate` y `test:db` (`docker compose -f compose.dev.yml exec -u postgres db pg_prove -d barberias /tests/`).
- [ ] T015 [principal] `scripts/db-reset.mts` (Node 24, `pg`, `DATABASE_OWNER_URL`):
  - se niega si el host no es `127.0.0.1` o `localhost` o si el puerto no es 54329;
  - como superusuario vía `docker compose exec -u postgres db psql`: `drop database if exists barberias with (force)`, `create database barberias owner db_owner` y `revoke connect … from public`; o alternativa equivalente documentada;
  - `npm run db:migrate`;
  - carga `db/seed.sql` como `db_owner` con `set app.env = 'local'`.
  - Script `"db:reset"`.
  - Crear `.env.local` local siguiendo `.env.example` (no versionado) y secretos locales en `db/init/secrets/` con valores aleatorios (`node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`).
- [ ] T016 [P] [principal] `src/lib/db/errors.ts` + `errors.test.ts` (test obligatorio 10):
  - `toDbError(e)` desenvuelve `cause` (incluido `DrizzleQueryError`) y devuelve `{ code, constraint }` o `null`;
  - nunca `message`, `detail`, `query` ni `params`;
  - tests con errores simulados de pg para `23P01`, `40P01`, `23505`, `23503`, `23514` + `appointments_phone_limit`, y `42501`;
  - un error envuelto por Drizzle cuyo mensaje contiene un teléfono no deja rastro del teléfono en el resultado;
  - un error que no es de la base da `null`.

  Actualizar `src/lib/log.ts`: `logSafeError(context, error)` acepta `unknown`, pero si es error de base usa `toDbError`, y si no, solo `name` y `code`. Comentario sobre el mensaje de Drizzle con parámetros (research §8).
- [ ] T017 [P] [principal] `src/lib/db/schema.ts` escrito a mano (D1, research §3): `pgTable` de `barbershops`, `profiles`, `barbers`, `services`, `barber_schedules`, `barber_blocks` y `appointments`, solo columnas, con:
  - `timestamp(..., { withTimezone: true, mode: "date" })`;
  - `numeric(…, { precision: 12, scale: 2 })`;
  - `time`, `smallint`, `uuid`, `text`, `boolean`;
  - `pgEnum` `user_role` y `appointment_status`;
  - `customType` `bytea` → `Buffer` para `cancel_token_hash`.

  Comentario de cabecera: "Escrito a mano (ADR-017 enmienda 1). El SQL de db/migrations es la fuente de verdad; tests/integration/schema-drift.test.ts falla si difieren. Sin FK, check, índices ni políticas a propósito".
- [ ] T018 [principal] `src/lib/db/pool.ts` y `src/lib/db/client.ts` según [contracts/data-access.md](contracts/data-access.md):
  - pool en `globalThis` (máx. 10, `connectionTimeoutMillis` 5000) desde `DATABASE_URL` o `DATABASE_URL_FILE`;
  - `drizzle(pool, { schema })`;
  - `withAdmin(session: VerifiedSession, fn)` y `withService(fn)` con `db.transaction(async tx => { await tx.execute(sql\`select set_config('role', 'authenticated', true), set_config('app.user_id', ${session.userId}, true)\`); return fn(tx); })`, y la versión `service_role` sin identidad;
  - tipo `Tx`;
  - `import "server-only"` en todos.
- [ ] T019 [principal] `src/lib/db/startup-check.ts` + `src/instrumentation.ts` (research §10):
  - leer `node_modules/next/dist/docs/01-app/02-guides/instrumentation.md` antes;
  - `register()`: si `process.env.NEXT_RUNTIME === "nodejs"` y `NEXT_PHASE !== "phase-production-build"`, importar y ejecutar `assertSafeRoles()`;
  - consultas con el pool de app y el de auth:
    - `select rolsuper, rolbypassrls from pg_roles where rolname = current_user`;
    - existe algún objeto en `pg_class` cuyo dueño es `current_user`;
    - `select inherit_option from pg_auth_members where member = current_user::regrole` (todas `false`);
    - `current_user` del pool de auth = `auth_login`;
  - ante cualquier fallo, incluido un error de conexión: `console.error("La app no arranca: <motivo>")`, sin URL ni contraseña, y `process.exit(1)`.
  - Verificar a mano que con `DATABASE_URL` de `db_owner` el servidor no arranca.
- [ ] T020 [principal] `eslint.config.mjs`: `no-restricted-imports` según [contracts/data-access.md §Reglas](contracts/data-access.md#withadmin--withservice):
  - `withService` de `@/lib/db/client` prohibido en `src/lib/admin/**`, `src/app/**/admin/**` y `src/components/admin/**`;
  - `@/lib/db/pool` prohibido fuera de `src/lib/db/`;
  - `pg` y `drizzle-orm/node-postgres` prohibidos fuera de `src/lib/db/` y `src/lib/auth/`.

  Probar que una importación prohibida falla el lint (temporalmente) y revertir.
- [ ] T021 [principal] `src/lib/auth/auth.ts` según [contracts/auth-and-ops.md](contracts/auth-and-ops.md):
  - pool `auth_login` (máx. 3) desde `AUTH_DATABASE_URL` o `AUTH_DATABASE_URL_FILE`;
  - `baseURL` dinámico con `allowedHosts` y `trustedOrigins` a partir de `NEXT_PUBLIC_ROOT_DOMAIN` (en local `*.localhost:3000`, `http`);
  - `disableSignUp`, `disabledPaths` (enumerar los endpoints de 1.7.7 en `node_modules/better-auth/dist/api/routes/` y dejar solo `/sign-in/email`, `/sign-out` y `/get-session`), `session.expiresIn` 7 días, `rateLimit` en la base con `AUTH_SIGNIN_MAX_ATTEMPTS`, `generateId: "uuid"`, `ipAddressHeaders: ["x-real-ip"]`, cookies solo del host y `nextCookies()`;
  - `secret` desde `BETTER_AUTH_SECRET` o `*_FILE`; error claro si falta o mide menos de 32 caracteres.
  - `src/app/api/auth/[...all]/route.ts` con `toNextJsHandler(auth)`.
  - `src/lib/auth/session.ts`:
    - `getVerifiedSession(): Promise<VerifiedSession | null>`, que usa `auth.api.getSession({ headers: await headers() })`;
    - tipo marcado `VerifiedSession` (`unique symbol`); es el único lugar que lo fabrica.
- [ ] T022 [principal] `src/proxy.ts`:
  - en subdominio de barbería, `pathname.startsWith("/api/auth/")` → `NextResponse.next()` sin reescribir;
  - en el dominio raíz, `/api/auth/*` → 404;
  - quitar `refreshSession` y la importación de `@/lib/supabase/proxy`;
  - actualizar el comentario;
  - test unitario de `src/lib/tenant.ts` o del proxy si la lógica nueva es pura.
- [ ] T023 [principal] `tests/integration/schema-drift.test.ts`: por cada tabla de `src/lib/db/schema.ts` (`getTableConfig`), comparar nombre, tipo SQL y nulabilidad de cada columna con `information_schema.columns` de la base local, en ambos sentidos.
  - Cualquier diferencia falla, con un mensaje que diga qué columna.
  - Conexión con `DATABASE_OWNER_URL` (local).
- [ ] T024 [principal] Helper de tests de integración `tests/integration/helpers/db.ts`:
  - `ownerDb` (`DATABASE_OWNER_URL`) para preparar y borrar datos;
  - guardia: lanza error si el host no es local (ADR-014);
  - funciones `createTestBarbershop()` y `createTestAdmin(barbershopId)`, que insertan en `identity."user"`, `identity.account` con `hashPassword` y `profiles`.
  - `vitest.integration.config.mts`: comentario actualizado (ya no Supabase).

**Punto de control**: base local con `npm run db:reset`, `npm run test:db` en verde, la app arranca con `app_login` y no arranca con `db_owner`. A partir de aquí, las historias.

---

## Fase 3: Historia 1, nada cambia para el cliente final (P1) 🎯 MVP

**Objetivo**: reserva, confirmación y cancelación pública sobre la base nueva, con `withService`.
**Prueba independiente**: `npm run test:integration` (booking, cancellation, concurrencia, barbershops) y `npm run test:e2e` (booking y cancellation) sin cambiar lo que comprueban.

- [ ] T025 [P] [US1] [principal] `src/lib/barbershops.ts`: `getPublicBarbershop` con `withService` + Drizzle (`select id, name, subdomain, timezone … where subdomain = $1 and is_active`). Mismo tipo `PublicBarbershop` y `cache`.
- [ ] T026 [P] [US1] [principal] `src/lib/cancellation/token.ts`: `hashToken` devuelve `Buffer` (32 bytes, SHA-256).
  - Actualizar `token.test.ts`: `Buffer` de 32 bytes, determinista, distinto para tokens distintos.
  - Quitar el comentario sobre el formato de PostgREST.
- [ ] T027 [US1] [principal] `src/lib/booking/queries.ts`: `getBookingCatalog` y `loadSlots` con `withService` (una transacción por función; las tres lecturas en la misma `tx`, en secuencia, **o** tres `withService` en paralelo como hoy: elegir tres en paralelo para conservar la latencia y documentarlo).
  - Mismos filtros, incluido el límite inferior `appointmentsFrom` (PERF-003).
  - `price` → `Number()`; `starts_at` y `ends_at` → `Date` directamente para `toRange`.
  - Mismos tipos públicos.
- [ ] T028 [US1] [principal] `src/lib/booking/book.ts`:
  - conteo por teléfono con `withService` (`select count(*)::int`);
  - `insert` con `withService`, `cancel_token_hash: hashToken(token)` (`Buffer`), fechas como `Date` y precio como string;
  - `fromDatabase` usa `toDbError`: `constraint === "appointments_phone_limit"` → límite; `23P01` y `40P01` como hoy; si no, se relanza el original sin registrarlo aquí;
  - quitar el import de `PostgrestError`.
- [ ] T029 [US1] [principal] `src/lib/cancellation/queries.ts` y `cancel.ts`:
  - `findByToken`: `leftJoin` de `services` y `barbers` en una sentencia, filtrando por `barbershop_id` y `cancel_token_hash`;
  - `submitCancellation`: un solo `update … where barbershop_id and cancel_token_hash and status='active' and starts_at > now returning id` con `withService`;
  - mismos mensajes y estados;
  - `logSafeError` con el error original (lo sanea `log.ts`, T016).
- [ ] T030 [US1] [principal] Reescribir `tests/integration/{booking,cancellation,appointments-concurrency,barbershops}.test.ts`:
  - preparar datos con `ownerDb` (T024), en lugar de `createServiceClient`;
  - las expectativas **no cambian**;
  - en `cancellation`, comparar el hash como `Buffer`.
- [ ] T031 [US1] [principal] `tests/integration/formats.test.ts` (test obligatorio 9). Con datos creados por `ownerDb` y leídos por las funciones públicas:
  - `startsAt`/`endsAt` en ISO con `Z` y ordenables con `localeCompare`;
  - `price` como `number` con decimales correctos (25000.5);
  - `start_time` `"HH:MM:SS"`;
  - `cancel_token_hash` leído como `Buffer` de 32 bytes que coincide con `hashToken`.
- [ ] T032 [US1] [principal] `tests/integration/lock-timeout.test.ts` (test obligatorio 7):
  - una conexión `ownerDb` abre una transacción y toma `pg_advisory_xact_lock(hashtextextended('<shop>:<phone>', 0))`;
  - una reserva del mismo teléfono con `bookAppointment` falla en menos de 6 s (`lock_timeout` de 5 s), con resultado de error del servidor y sin quedarse colgada;
  - liberar el candado al final.
- [ ] T033 [US1] [frontend] `tests/e2e/booking.spec.ts` y `cancellation.spec.ts`: sustituir el cliente de Supabase por un helper `tests/e2e/helpers/db.ts` (`pg` con `DATABASE_OWNER_URL` y guardia local) para preparar y limpiar datos.
  - Mismas comprobaciones y escaneo `axe`.
  - Coordinarse con el principal si el helper debe compartirse con T024 (se puede reutilizar `tests/integration/helpers/db.ts`).

**Punto de control**: historia 1 completa. `test:integration` (sin auth) y E2E de reserva y cancelación en verde.

---

## Fase 4: Historia 2, el admin entra y gestiona igual que hoy (P1)

**Objetivo**: login con Better Auth y panel sobre `withAdmin`.
**Prueba independiente**: E2E de la agenda e integración de auth.

- [ ] T034 [US2] [principal] `src/lib/admin/session.ts`: `getAdminContext(subdomain)`:
  - `getVerifiedSession()`; si no hay sesión, `anonymous`;
  - `withAdmin(session, tx => select de profiles leftJoin barbershops)` en **una** consulta;
  - misma lógica de estados (`forbidden`, `inactive`, `ok`) y mismo tipo `AdminContext`;
  - `email` sale de la sesión de Better Auth;
  - `cache` se mantiene.
- [ ] T035 [US2] [principal] `src/lib/admin/queries.ts`: las 5 lecturas con `withAdmin`.
  - `listAppointmentsForDay` con `leftJoin` de barbers y services, el mismo orden y conversión a ISO.
  - Los tipos exportados (`Barber`, `Service`, `ScheduleSlot`, `Block`, `AgendaAppointment`) se declaran explícitos, para no depender de `ReturnType` de Drizzle y que los componentes no cambien.
  - Las funciones reciben la `VerifiedSession` o la obtienen con `getVerifiedSession()` (elegir una forma y aplicarla en todas).
- [ ] T036 [US2] [principal] `src/lib/admin/actions.ts`:
  - todas las acciones con `withAdmin`;
  - `fromDatabase` con `toDbError` (mismos mensajes; `default` → `logSafeError`);
  - quitar `signIn`;
  - nueva `confirmPanelAccess(subdomain)`: `getAdminContext`; si no es `ok`, `auth.api.signOut({ headers: await headers() })` y devuelve el mismo mensaje de hoy según `inactive` o `forbidden`; si es `ok`, `redirect("/admin")`;
  - `signOut()` con `auth.api.signOut` + redirección;
  - quitar los imports de Supabase.
- [ ] T037 [US2] [frontend] `src/components/admin/login-form.tsx` (D3, [contracts/auth-and-ops.md §Rutas](contracts/auth-and-ops.md#rutas-y-flujo)):
  - validar con `loginSchema` en el cliente como hoy;
  - `fetch("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }), credentials: "same-origin" })`;
  - 401/400 → "Correo o contraseña incorrectos.";
  - 429 → "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.";
  - otro error → "No se pudo iniciar sesión. Inténtalo de nuevo.";
  - si va bien, llamar a la server action `confirmPanelAccess(subdomain)` y mostrar su mensaje si devuelve error;
  - mismos campos, etiquetas, `autoComplete`, foco al error, estado `pending` ("Entrando…") y accesibilidad (`DESIGN.md`).
  - No usar `better-auth/client` (no hace falta).
- [ ] T038 [US2] [principal] `tests/integration/auth.test.ts` (test obligatorio 8 y FR-016–FR-019), contra `auth.handler` con `new Request(...)` y `host` de barbería:
  - (a) `POST /api/auth/sign-up/email` → 4xx;
  - (b) `/forget-password`, `/request-password-reset`, `/update-user` y `/delete-user` → 4xx;
  - (c) un login correcto con un admin de prueba (T024) devuelve una cookie `HttpOnly`, `SameSite=Lax`, **sin** atributo `Domain`;
  - (d) credenciales erróneas → 401 con un mensaje que no distingue correo inexistente;
  - (e) con `AUTH_SIGNIN_MAX_ATTEMPTS=2` y `x-real-ip` fijo, el 3.er intento → 429, y otra IP no queda bloqueada;
  - (f) tras sign-out, la cookie ya no da sesión (`getSession` null);
  - (g) usuario borrado → la sesión deja de valer (cascade).
- [ ] T039 [US2] [frontend] `tests/e2e/admin-agenda.spec.ts`:
  - helper `pg` de T033 en lugar de Supabase;
  - el login sigue usando la interfaz (correo y contraseña de demostración del seed);
  - mismas comprobaciones de agenda y cancelación, y `axe`;
  - añadir un caso: admin de `labarberia` en `elcorte.localhost:3000/admin/login` ve "Esta cuenta no tiene acceso al panel de esta barbería.".

**Punto de control**: historias 1 y 2 completas. Todos los E2E en verde.

---

## Fase 5: Historia 3, una barbería nunca ve datos de otra (P1)

**Objetivo**: demostrar el aislamiento con la conexión real de la app.
**Prueba independiente**: los tests de esta fase.

- [ ] T040 [US3] [principal] `tests/integration/isolation-app-login.test.ts` (test obligatorio 2), con dos barberías y sus admins (T024) y una sesión verificada simulada **solo en el test** (un helper de test que fabrica `VerifiedSession` a partir de una sesión real de Better Auth creada con login):
  - por cada una de las **15 operaciones** de [contracts/data-access.md](contracts/data-access.md#las-15-operaciones-del-panel-aislamiento-solo-con-rls-test-2), invocar la función real del panel como admin de A con ids o `barbershop_id` de B;
  - esperar 0 filas, 0 afectadas o el mensaje de permiso, y comprobar con `ownerDb` que los datos de B no cambiaron.
- [ ] T041 [US3] [principal] `tests/integration/pool.test.ts` (tests obligatorios 3 y 4) con el pool real de `app_login`:
  - (a) tras `withAdmin(A)`, la misma conexión (forzar `max: 1` en un pool de test con la misma URL) ve `current_user = app_login` y `current_setting('app.user_id', true)` vacío;
  - (b) `withAdmin(A)` y `withAdmin(B)` seguidas en `max: 1` no comparten identidad;
  - (c) una consulta directa sin envoltorio (`pool.query('select * from public.barbers')`) da error `42501`;
  - (d) un `withService` tras un `withAdmin` no conserva `app.user_id`;
  - (e) `git grep -nE "set_config\([^)]*false\)|\bSET (LOCAL )?(ROLE|app\.)" src` vacío, como assert del test.
- [ ] T042 [US3] [principal] Revisar que `npm run lint` rechaza `withService` en el panel (T020) y dejar constancia en el reporte.

**Punto de control**: tests obligatorios 1–10 en verde (1, 5 y 6 en pgTAP; 2, 3, 4, 7, 8, 9 y 10 en Vitest).

---

## Fase 6: Historia 4, el dueño de la plataforma opera la base (P2)

**Objetivo**: alta de barberías, seed y protección de entornos.
**Prueba independiente**: quickstart §1 y §3 (filas de la historia 4).

- [ ] T043 [US4] [principal] `scripts/create-barbershop.mts`:
  - `pg` con `DATABASE_OWNER_URL`;
  - **una transacción**: `insert barbershops` → `identity."user"` (`name` = correo, `"emailVerified" true`) → `identity.account` (`credential`, `hashPassword` de `better-auth/crypto` con contraseña aleatoria de 24 caracteres) → `profiles`; `rollback` ante cualquier error;
  - mismos mensajes para `23505` y `23514` (vía `toDbError`), misma salida y misma guardia `--confirm-remote` (host no local);
  - script `"barbershop:create": "node --env-file=.env.local scripts/create-barbershop.mts"`.
- [ ] T044 [US4] [principal] `tests/integration/create-barbershop.test.ts`:
  - ejecutar el script con `node` (child process) contra la base local;
  - comprobar que la barbería, el usuario, la cuenta y el perfil existen y que el login con la contraseña impresa funciona (`auth.handler`);
  - un subdominio repetido no deja filas a medias;
  - limpiar al final.
- [ ] T045 [US4] [principal] Comprobar a mano y anotar en el reporte:
  - `npm run db:reset` con `DATABASE_OWNER_URL` apuntando a un host no local se niega;
  - cargar `db/seed.sql` sin `app.env=local` falla;
  - `npm run test:integration` con `DATABASE_URL` no local se niega.

---

## Fase 7: limpieza, documentación y cierre

- [ ] T046 [principal] Quitar Supabase:
  - `npm uninstall @supabase/ssr @supabase/supabase-js supabase`;
  - borrar `supabase/`, `src/lib/supabase/` y `src/lib/database.types.ts`;
  - quitar las variables de Supabase de `.env.example`;
  - quitar el script `db:types`;
  - `git grep -i supabase -- ':!specs/00[1-4]*' ':!*.md'` vacío (SC-007).
  - `npx supabase stop` antes, si sigue en marcha.
- [ ] T047 [principal] Verificación completa: `npm run lint`, `typecheck`, `test`, `db:reset`, `test:db`, `test:integration`, `test:e2e` y `build`. Todo en verde; anotar los recuentos (unitarios, asserts pgTAP, integración, E2E).
- [ ] T048 [principal] Medición posterior: `npm run build && npm run start` y `npm run perf:ttfb`.
  - Anotar en `ttfb.md` la sección "Después" y la comparación.
  - Si empeora más de un 10 % (SC-005), investigar antes de cerrar (p. ej. `withService` en paralelo o tamaño del pool).
- [ ] T049 [P] [principal] `CLAUDE.md`: reescribir stack, comandos, entornos (ADR-017 §7), estructura (`db/`, `src/lib/db/`, `src/lib/auth/`, `compose.dev.yml`), variables y "Antes de dar una tarea por terminada" (sin `db:types`).
  - Sin rastro de Supabase salvo en la historia.
- [ ] T050 [P] [principal] Vault:
  - ADR-001/002/003/005/007/008/011/013/014/016 con estado "modificado por ADR-017";
  - `Arquitectura/modelo-de-datos.md` y `despliegue.md` (roles, esquemas, Compose);
  - `Roadmap.md` (recordatorios sin `pg_cron` de Supabase);
  - `Plan-de-ejecucion.md` (fase 7 sin Supabase en la nube: contenedor `db` en el VPS, secretos, respaldos);
  - `Estado-actual.md` y `Pendientes.md`.
- [ ] T051 [principal] Revisión de los **tres agentes revisores** en paralelo sobre el diff `main...005-migracion-postgresql` (hito de modelo de datos y RLS):
  - `security-reviewer` con el modelo por defecto;
  - `performance-reviewer` y `maintainability-reviewer`;
  - consolidar el informe en `Revisiones/` del vault (coincidencias, contradicciones y puntos ciegos);
  - corregir los Critical y High antes de fusionar.
- [ ] T052 [principal] Commit de cierre (`feat: migración a PostgreSQL propio (ADR-017)`), añadiendo archivos por nombre. Fusionar en `main` y subir con `git push`.

---

## Dependencias y orden

- **Fase 1 → Fase 2.** T001 y T002 **antes** de tocar código: miden y cuentan el estado de Supabase.
- **2a (database) y 2b (principal) en paralelo.** T014 (compose) es necesario para T013. T018 necesita T017. T021 necesita T008 aplicado (tablas `identity`). T023 y T024 necesitan la base migrada.
- **Fase 3 (US1)** necesita la fase 2 completa. T025–T026 son `[P]`; T027 → T028; T029 es independiente de T027/T028; T030–T032 después; T033 (frontend) en paralelo con T030.
- **Fase 4 (US2)** necesita T021 y T024. T037 (frontend) en paralelo con T034–T036 una vez publicada la firma de `confirmPanelAccess`.
- **Fase 5 (US3)** necesita las fases 3 y 4 (usa las funciones reales).
- **Fase 6 (US4)** necesita la fase 2; puede ir en paralelo con las fases 3–5.
- **Fase 7** al final. T046 solo cuando todo lo anterior pasa.

## Paralelismo sugerido

```text
Agente database:  T005, T006 → T007 → T008 → T009 → T010, T011 → T012 → T013
Principal:        T001 → T002 → T003, T004 → T014 → T016, T017 → T018 → T019 → T020 → T021 → T022 → T015 → T023 → T024
                  → T025, T026 → T027 → T028 → T029 → T030 → T031 → T032 → T034 → T035 → T036 → T038 → T040 → T041 → T042 → T043 → T044 → T045 → T046 … T052
Agente frontend:  T033 (tras T024) ; T037 + T039 (tras T036)
```

## Estrategia

- **MVP de la migración = fases 1–3**: la reserva pública funciona sobre PostgreSQL propio. Pero no se fusiona nada en `main` hasta cerrar la fase 7: la rama solo se fusiona completa.
- Cada punto de control se valida con los comandos de [quickstart.md](quickstart.md).
- Sesión principal: Opus o Sonnet, a elección del usuario. Agentes `database` y `frontend`: Sonnet (ADR-013).
