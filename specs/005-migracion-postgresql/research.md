# Investigación: migración a PostgreSQL propio (spec 005)

Resuelve los POR VERIFICAR del ADR-017. Verificado el 2026-10-13:
- leyendo el código de los paquetes instalados en una carpeta temporal;
- ejecutando `drizzle-kit pull` contra la base local actual;
- haciendo una prueba de roles en un contenedor `postgres:17`.

## 1. Versiones y avisos de seguridad

| Paquete | Versión fijada | Avisos conocidos | Uso |
|---|---|---|---|
| `better-auth` | 1.7.7 | GHSA-xg6x-h9c9-2m83 (<1.4.9, 2FA), GHSA-p6v2-xcpg-h6xw (<1.4.17, rotación IPv6 en el límite), CVE-2026-45337 y CVE-2026-53515 (<1.6.11, plugins device y SSO). Ninguno afecta a 1.7.7 ni a la configuración sin plugins | login |
| `drizzle-orm` | 0.45.4 | CVE-2026-39356 / GHSA-gpj5-g38j-94v9 (<0.45.2, inyección en `sql.identifier()`/`.as()`). Corregido | constructor de consultas |
| `pg` | 8.23.1 | Ninguno reciente (el último es de 2017, <7.1.2) | driver único (app y Better Auth) |
| `@types/pg` | 8.23.1 | — | tipos |
| `dbmate` | 2.36.0 (imagen `ghcr.io/amacneil/dbmate:2.36.0`) | Ninguno conocido | migraciones |
| `drizzle-kit` | **no se instala** (ver §3) | 4 avisos moderados de `esbuild` vía `@esbuild-kit` (solo desarrollo) | — |

**Decisión:** versiones exactas (sin `^`) en `package.json`. Se ejecuta `npm audit --omit=dev` al instalar; cualquier aviso alto en dependencias de producción bloquea la tarea.
**Por qué:** son los últimos estables con todos los avisos corregidos.
**Alternativas:**
- `postgres` (postgres.js) 3.4.9: se descarta, porque Better Auth usa `pg` y así hay un solo driver.
- Drizzle 1.0 beta: se descarta por no ser estable.

## 2. Better Auth: configuración mínima

| Punto | Hallazgo (código de 1.7.7) | Decisión |
|---|---|---|
| Registro cerrado | `sign-up.mjs` rechaza con `EMAIL_PASSWORD_SIGN_UP_DISABLED` si `emailAndPassword.disableSignUp`. El chequeo está **dentro del endpoint**, así que también vale para `auth.api.signUpEmail` desde el servidor | `disableSignUp: true` y, además, `disabledPaths` con todo lo que no sea `/sign-in/email`, `/sign-out` y `/get-session` (FR-016). Test 8: `/sign-up/email` responde 4xx |
| Alta de usuarios sin registro | `better-auth/crypto` exporta `hashPassword` (scrypt de `node:crypto`). Una cuenta de contraseña es una fila en `account` con `providerId='credential'`, `accountId=userId` y `password` = hash | `scripts/create-barbershop.mts` inserta, en **una transacción como `db_owner`**: barbería, `identity."user"`, `identity.account` y perfil. Sin API de registro. Reemplaza la compensación manual de hoy |
| Ids `uuid` | `advanced.database.generateId: "uuid"` | Columnas `uuid default gen_random_uuid()`, y `profiles.user_id uuid` con FK a `identity."user"(id) on delete cascade` |
| Token de sesión | `createSession` guarda `token: generateId(32)` **en claro** en `session.token`. La cookie lleva el token firmado con HMAC (`BETTER_AUTH_SECRET`) | Riesgo aceptado y acotado: `identity` es inaccesible para la app salvo `auth_login`; `db_backup` solo hace volcados cifrados; un token filtrado no sirve sin el secreto de firma de la cookie. Sesión de 7 días |
| Límite de intentos | Almacenamiento `"database"`, tabla `rateLimit(key unique, count, lastRequest bigint)`, con incrementos condicionados (atómico entre instancias). **Solo se aplica en el manejador HTTP** (`router.onRequest`), no en llamadas directas a `auth.api.*` | El login pasa por la ruta `/api/auth/sign-in/email` (ver §6), no por `auth.api` desde una server action. Regla propia: 5 intentos por IP cada 15 min en `/sign-in/email` |
| IP de confianza | `advanced.ipAddress.ipAddressHeaders` (por defecto `x-forwarded-for`). IPv6 por subred /64 | `ipAddressHeaders: ["x-real-ip"]`, que Caddy sobrescribe (ADR-017 §5). En local, sin Caddy, se usa un único cubo compartido (avisado en el log) |
| Multi-subdominio | `baseURL` dinámico: `{ allowedHosts: ["*.<dominio>"], protocol }`. `trustedOrigins` admite comodines | `allowedHosts` y `trustedOrigins` derivados de `NEXT_PUBLIC_ROOT_DOMAIN`. Cookies sin `domain` (solo del host), sin `crossSubDomainCookies`, `SameSite=Lax`, `Secure` fuera de local |
| Esquema propio | El adaptador Kysely incluido acepta un `pg.Pool`. La comprobación de esquema al arrancar se puede validar | Pool de `auth_login` (máx. 3) con `search_path=identity`, fijado en el rol (`ALTER ROLE auth_login SET search_path = identity`). Nombres de columna por defecto de Better Auth (camelCase entre comillas), sin mapeos |
| Tablas | `user`, `session`, `account`, `verification` y `rateLimit` (columnas en [data-model.md](data-model.md#esquema-identity)) | Entran como SQL en la línea base, revisadas. Prohibido `better-auth migrate` |
| Next.js 16 | `peerDependencies.next: ^16`. Exporta `toNextJsHandler` y `nextCookies` | Ruta `src/app/api/auth/[...all]/route.ts` con `toNextJsHandler`. `nextCookies()` (ayuda de integración, no un plugin de funcionalidad) para que `signOut` desde una server action borre la cookie |
| Verificación de sesión | `auth.api.getSession({ headers })` consulta la base si no hay caché de cookie (desactivada por defecto) | Se mantiene la verificación contra la base en cada petición del panel (FR-018) |

**Riesgos que quedan:** la caché de cookie y la renovación automática de la sesión no se usan, así que el admin vuelve a entrar a los 7 días. Es aceptable en el MVP.

## 3. Drizzle: el esquema TypeScript NO se puede generar con `drizzle-kit pull`

Prueba: `drizzle-kit pull` 0.31.11 contra la base local actual (7 tablas):
- `cancel_token_hash bytea` sale como `unknown("cancel_token_hash")` con `// TODO: failed to parse database type 'bytea'`, y **el archivo no compila**;
- las FK compuestas salen con **las columnas cruzadas** (`[barbershopId, barberId] → [barbers.id, barbers.barbershopId]`);
- las políticas de INSERT pierden su `WITH CHECK`, y un `check` sale truncado (`CHECK (private.is_valid_timezone(timezone`);
- las restricciones de exclusión no aparecen.

**Decisión (pendiente de aprobación, D1 del plan):** el esquema de Drizzle se **escribe a mano** en `src/lib/db/schema.ts`, solo con columnas y tipos (sin FK, `check`, políticas ni índices: esos viven solo en el SQL). Un **test de deriva** (integración) compara cada tabla de `schema.ts` con `information_schema.columns` (nombre, tipo, nulabilidad) y falla ante cualquier diferencia.
**Por qué:** el SQL sigue siendo la única fuente de verdad. El archivo TS no puede describir mal una restricción porque no las describe, y el test garantiza que los tipos del código coinciden con la base.
**Alternativas descartadas:**
- Usar `pull` y retocar la salida: va contra "el archivo generado no se edita", y cada regeneración volvería a romperse.
- Quitar Drizzle y usar SQL con `pg`: contradice el ADR-017 y pierde el tipado de consultas.

**Cambia el ADR-017 §2** ("el esquema TS se obtiene solo con `drizzle-kit pull`"). Se registra como enmienda del ADR al aprobar el plan. `drizzle-kit` no se instala y el script `db:types` desaparece.

## 4. Roles e identidad: prueba en `postgres:17`

Prueba realizada con `app_login` (`NOINHERIT`, miembro de `authenticated` y `service_role` `WITH INHERIT FALSE, SET TRUE`):

| Caso | Resultado |
|---|---|
| `app_login` consulta la tabla sin cambiar de rol | `ERROR: permission denied` (test 4 ✅) |
| `set_config('role','authenticated',true)` + `set_config('app.user_id','1',true)` | `current_user = authenticated` y RLS filtra por la identidad |
| Misma conexión tras `COMMIT` | `current_user = app_login`; `app.user_id` vale `''` (por eso `nullif(…, '')`) (test 3 ✅) |
| `set_config('role','service_role',true)` | Ve todas las filas (BYPASSRLS del rol activo) |
| `authenticated` sin identidad | 0 filas |
| `set_config('role','postgres',true)` | `permission denied to set role` |

**Hallazgo importante:** el `pg_hba.conf` de la imagen oficial trae **`trust`** para `local` y `127.0.0.1`. **Decisión:** `db/pg_hba.conf` propio montado en el contenedor:
- `local all postgres peer` (solo `docker exec -u postgres`);
- `local all all scram-sha-256`;
- `host all all <red interna> scram-sha-256`;
- sin ninguna línea `trust`.

Un test pgTAP (como `postgres`) comprueba que `pg_hba_file_rules` no tiene `trust`.

## 5. dbmate

- **Formato:** `-- migrate:up` y `-- migrate:down` (los dos obligatorios) y `transaction:false` opcional.
- **Versión:** los dígitos iniciales del nombre del archivo. `0001_baseline.sql` es válido, y las siguientes migraciones (`dbmate new`, con fecha y hora) ordenan después.
- **Tabla de control:** con `DATABASE_URL=…?search_path=dbmate,public`, `schema_migrations` va al esquema `dbmate`, que dbmate crea como `db_owner`. Así no cae en `public`, donde el test estructural exige RLS en toda tabla. Todas las migraciones califican los nombres (`public.…`), como hoy.
- **Ejecución:** la imagen `ghcr.io/amacneil/dbmate:2.36.0` como servicio `migrate` del Compose, bajo demanda (`docker compose run --rm migrate …`), con las credenciales de `db_owner`. `--no-dump-schema`; `dbmate wait` antes de migrar.
- **Línea base:** una sola migración `0001_baseline.sql` sustituye a las 6 de Supabase (excepción única de la constitución).

## 6. Flujo de login y rutas

- Better Auth en `src/app/api/auth/[...all]/route.ts` (fuera de `/s/...`). `src/proxy.ts` deja pasar `/api/auth/*` sin reescribir cuando llega por subdominio de barbería, y responde 404 en el dominio raíz.
- El formulario de login (componente de cliente) hace `fetch` POST a `/api/auth/sign-in/email`, que aplica el límite de intentos y fija la cookie. Después llama a la server action `confirmPanelAccess(subdomain)`, que valida la sesión, el perfil y la barbería del subdominio con la misma lógica de hoy.
  - Si no hay acceso, cierra la sesión y devuelve el mismo mensaje que hoy.
  - Si hay acceso, redirige a `/admin`.
- Los textos, el mensaje genérico ante credenciales erróneas y el comportamiento quedan iguales (FR-001).
- `signOut` sigue siendo una server action (`auth.api.signOut` + `nextCookies`).
- `src/lib/supabase/proxy.ts` (refresco de sesión) desaparece: el proxy ya no toca la sesión.

## 7. Formatos de datos (riesgo R7)

| Tipo | PostgREST hoy | `pg` + Drizzle | Decisión |
|---|---|---|---|
| `timestamptz` | ISO `2030-01-02T15:00:00+00:00` | Drizzle `mode:"date"` → `Date` | La capa de consultas devuelve los mismos tipos que hoy (ISO con `toISOString()`), para que la agenda (`localeCompare`), `time.ts` y los componentes no cambien |
| `numeric(12,2)` | número | `string` | Se convierte con `Number()` en la consulta. Los precios son pequeños, sin pérdida |
| `time` | `"HH:MM:SS"` | `"HH:MM:SS"` | Sin cambio |
| `bytea` | `"\x…"` | `Buffer` | `hashToken` devuelve `Buffer` (32 bytes); se actualiza su test unitario |

- La sesión de `app_login` fija `TimeZone=UTC` (`ALTER ROLE … SET timezone='UTC'`).
- Test 9 (formatos) en integración.

## 8. Errores (riesgo R15 y constitución VI)

- `pg` expone `code`, `constraint`, `detail` y `message`. Drizzle 0.45 envuelve los errores en `DrizzleQueryError`, cuyo **mensaje incluye la consulta y los parámetros** (datos personales).
- **Decisión:** `src/lib/db/errors.ts` → `toDbError(e): { code, constraint } | null`, que desenvuelve `cause`. Es el **único** objeto de error de base que llega a `logSafeError` o a la lógica.
- Mapeo actual conservado:
  - `23P01`, `23503` y `23514` por código;
  - el tope por teléfono, por `constraint === 'appointments_phone_limit'` (ya no por el texto);
  - `40P01` → reintento;
  - `42501` → sin permiso.
- Test 10 en unitarios.

## 9. Transacciones, pool y tiempos

- **Pool único por proceso:** `globalThis.__appPool` (máx. 10, `connectionTimeoutMillis` 5 s) para `app_login`, y otro de máx. 3 para `auth_login`.
- **`withAdmin(session, fn)` / `withService(fn)`** abren una transacción, fijan rol e identidad con `set_config(…, true)` parametrizado y ejecutan `fn(tx)`. No se exporta el pool.
- **Reserva:** hoy son llamadas sueltas, y se mantiene igual: cada `withService` es corto (lecturas de disponibilidad y luego el `insert`). El reintento ante `40P01`/`23P01` sigue fuera de la transacción.
- **Límites por rol:** `statement_timeout 8s`, `lock_timeout 5s` e `idle_in_transaction_session_timeout 10s` en `app_login` y `auth_login`. Test 7 con N = 6 s.

## 10. Comprobación al arrancar (FR-014)

- `src/instrumentation.ts` → `register()`; en `NEXT_RUNTIME === 'nodejs'` importa `src/lib/db/startup-check.ts`.
- Comprueba con `pg_roles`, `pg_auth_members` y `pg_class`:
  - `app_login` no es superusuario, no tiene BYPASSRLS y no es dueño de nada;
  - sus membresías son `inherit_option = false`;
  - `current_user` del pool de auth es `auth_login`.
- Si falla, o si la consulta falla, registra el motivo (sin secretos) y hace `process.exit(1)`.
- Se omite en `next build` (`NEXT_PHASE === 'phase-production-build'`).
- En la implementación se verifica que `register()` bloquea el arranque. Si no lo hiciera, el `process.exit(1)` lo garantiza.

## 11. Desarrollo local y puerto de la base

- `compose.dev.yml` con `db` (imagen propia: `postgres:17` + `postgresql-17-pgtap` + `pg_prove`) y `migrate`.
- La app sigue corriendo en el host (`npm run dev`), así que necesita llegar a la base: el Compose de desarrollo publica `127.0.0.1:54329:5432`, solo en local.
- **Choca con la constitución** ("Nunca: publicar el puerto de PostgreSQL"), que pensaba en el VPS. Ver D2 del plan.
- **Alternativa:** correr también la app en un contenedor en desarrollo. Se descarta por la lentitud de Docker sobre OneDrive en Windows y porque cambia `npm run dev`.

## 12. Medición de rendimiento (FR-023, SC-005)

- `scripts/measure-ttfb.mjs` hace 30 peticiones con `fetch` a `http://labarberia.localhost:3000/reservar` y `/admin` (con cookie de sesión) contra `next start`, y anota la mediana y el p90 de TTFB.
- Se mide antes de tocar nada (con Supabase local) y al final. Resultados en `specs/005-migracion-postgresql/ttfb.md`.

## 13. Equivalencia de asserts pgTAP (FR-003)

Hoy hay 224 asserts: 00 (dinámico, ~29), 01 (131), 02 (7), 03 (7), 04 (34), 05 (8) y 06 (8).

| Archivo actual | Destino | Cambios |
|---|---|---|
| 00_helpers | 00_structure | `anon` desaparece. Sus asserts se sustituyen por la matriz exacta de privilegios por rol (más asserts, no menos) |
| 01_isolation | 01_isolation | Identidad con `set_config('app.user_id')` en vez de `request.jwt.claims`; usuarios en `identity."user"`. Los asserts del super admin que inserta, edita o borra barberías pasan a "denegado por privilegio" (ya no hay escritura con sesión: el alta es solo por script) |
| 02–06 | igual nombre | Solo cambia cómo se preparan los datos |
| — | 07_roles | Nuevo: matriz de roles, `CONNECT`, `db_backup`, `pg_hba` sin `trust` y `identity` cerrada |

`tasks.md` incluye una tabla de correspondencia assert a assert, generada al reescribir.
