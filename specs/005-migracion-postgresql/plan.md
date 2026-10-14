# Plan de implementación: migración de Supabase a PostgreSQL propio

**Rama**: `005-migracion-postgresql` | **Fecha**: 2026-10-13 | **Spec**: [spec.md](spec.md) (aprobada)

**Entrada**: ADR-017 (vigente), constitución 1.2.0 y la spec 005. Investigación en [research.md](research.md); modelo en [data-model.md](data-model.md); contratos en [contracts/data-access.md](contracts/data-access.md) y [contracts/auth-and-ops.md](contracts/auth-and-ops.md); validación en [quickstart.md](quickstart.md).

## Resumen

- **Base:**
  - PostgreSQL 17 en un contenedor propio (imagen `postgres:17` con pgTAP), con `pg_hba` sin `trust` y logs sin datos;
  - roles de la matriz del ADR-017, creados por `db/init/roles.sh`;
  - una migración base de dbmate con permisos exactos por tabla y columna.
- **App:**
  - `src/lib/db/` (pool `pg` + Drizzle con esquema escrito a mano) con `withAdmin`/`withService`, normalizador de errores y comprobación de roles al arrancar;
  - Better Auth en `/api/auth/*` con su propio pool `auth_login`, registro cerrado y límite de intentos en la base.
- **Paridad:** los tipos que devuelven las consultas no cambian, así que páginas y componentes quedan igual. Solo cambia el formulario de login, que pasa a `fetch` a la ruta de Better Auth.
- **Pruebas:** reescritura de pgTAP (≥ 224 asserts) e integración, y los 10 tests obligatorios del ADR-017.
- **Medición:** TTFB antes y después.

## Contexto técnico

**Lenguaje/Versión**: TypeScript 5, Next.js 16.3.8 (App Router, `instrumentation.ts`, proxy), React 19.2, Node 24

**Dependencias nuevas** (versiones exactas, research §1): `better-auth@1.7.7`, `drizzle-orm@0.45.4`, `pg@8.23.1`, `@types/pg@8.23.1` (dev). dbmate 2.36.0 como imagen Docker.
**Se eliminan**: `@supabase/ssr`, `@supabase/supabase-js`, `supabase` (CLI), la carpeta `supabase/` y `src/lib/supabase/`.

**Almacenamiento**: PostgreSQL 17, esquemas `public`, `private`, `identity`, `extensions` y `dbmate`.

**Testing**: Vitest (unitarios e integración), pgTAP con `pg_prove` en el contenedor, Playwright + axe

**Plataforma**: desarrollo en Windows con Docker Desktop; destino en un VPS Ubuntu 24 con 4 GB (fase 7)

**Objetivos de rendimiento**: TTFB de `/reservar` y `/admin` en local ≤ +10 % frente a la medición previa (SC-005)

**Restricciones**:
- sin `trust`;
- logs de la base sin valores;
- transacciones solo con SQL;
- pool de 10 + 3 conexiones de un máximo de 40.

**Escala**: la del MVP (decenas de barberías, cientos de citas al mes).

## Decisiones aprobadas por el usuario (2026-10-13)

| # | Decisión | Por qué | Qué cambia |
|---|---|---|---|
| **D1** | El esquema TS de Drizzle se **escribe a mano** (solo columnas), con un test de deriva contra `information_schema`, en vez de `drizzle-kit pull` | Probado: `pull` genera un archivo que no compila (`bytea`), cruza las columnas de las FK compuestas y estropea políticas y `check` (research §3) | Enmienda del ADR-017 §2 (redacción). `drizzle-kit` no se instala; `db:types` desaparece |
| **D2** | En **desarrollo local**, `compose.dev.yml` publica la base solo en `127.0.0.1:54329`. En el VPS, nunca `ports:` | La app corre en el host con `npm run dev` y necesita llegar a la base. Meter la app en Docker en Windows sobre OneDrive sería lento | Enmienda **PATCH** de la constitución (1.2.1): "Publicar el puerto de PostgreSQL (`ports:`) **en un servidor**; en desarrollo local solo en `127.0.0.1`" |
| **D3** | El login usa la ruta HTTP de Better Auth (`fetch` desde el formulario) y no `auth.api` desde una server action. Se usa `nextCookies()` | El límite de intentos de Better Auth solo se aplica en su manejador HTTP (research §2). `nextCookies` es una ayuda de integración, no un plugin de funcionalidad | Aclaración del ADR-017 §5 ("sin plugins" = sin plugins de funcionalidad). El formulario de login pasa a ser de cliente; textos y comportamiento iguales |

Aplicadas: constitución 1.2.1 (D2) y enmienda 1 del ADR-017 (D1, D3).

## Verificación de la constitución (1.2.0)

| Principio / límite | Cumplimiento |
|---|---|
| I. Aislamiento | RLS en todas las tablas, también `identity`. Los roles siguen la matriz. `app_login` no tiene privilegios propios y su membresía es `INHERIT FALSE`. La identidad se fija con `set_config(…, true)` parametrizado y solo desde `withAdmin(VerifiedSession)`. Privilegios exactos con test. Aislamiento probado con la conexión real de `app_login` (test 2) ✅ |
| II. Secretos | Credenciales de la base y `BETTER_AUTH_SECRET` solo en módulos `server-only`. `DATABASE_OWNER_URL` nunca en el contenedor `app`. Variables `*_FILE` para el VPS ✅ |
| III. Integridad | Las restricciones, exclusiones y triggers actuales se trasladan sin cambios (02–06 de pgTAP). El normalizador de errores conserva los mensajes ✅ |
| IV. UTC | `timezone=UTC` en el servidor y en los roles; `time.ts` sin cambios ✅ |
| V. Validación | Zod sin cambios. Better Auth valida el correo. El honeypot y el tope por teléfono siguen ✅ |
| VI. Datos personales | Logs de PostgreSQL `terse`, sin parámetros y sin sentencia en el error. `toDbError` elimina `message` y `detail` (el mensaje de Drizzle incluye los parámetros) ✅ |
| VII. Simplicidad | 3 dependencias nuevas a cambio de 3 eliminadas, justificadas en el ADR-017. Sin servicios permanentes nuevos: `migrate` es bajo demanda ✅ |
| VIII. Portabilidad | Todo en Compose. Limpieza de sesiones en el cron de respaldos, sin `pg_cron` ✅ |
| Nunca: `ports:` en un servidor | Solo en el Compose de desarrollo y en `127.0.0.1` (D2, constitución 1.2.1) ✅ |
| Nunca: cambiar el esquema fuera de SQL | dbmate como única vía; `drizzle-kit` ni se instala ✅ |
| Nunca: editar migraciones aplicadas | Excepción única: `0001_baseline.sql` sustituye a las 6 de Supabase ✅ |
| Nunca: `trust` | `pg_hba.conf` propio y test ✅ |
| Nunca: logs con valores | `postgresql.conf` (data-model.md) ✅ |
| Preguntar primero | Dependencias y esquema: aprobados en el ADR-017. D1–D3 se preguntan con este plan ✅ |

**Resultado**: pasa (D1–D3 aprobadas; constitución 1.2.1).

## Estructura del código

### Documentación

```text
specs/005-migracion-postgresql/
├── spec.md, plan.md, research.md, data-model.md, quickstart.md
├── contracts/data-access.md, contracts/auth-and-ops.md
├── ttfb.md            # mediciones antes/después
└── tasks.md           # /speckit-tasks
```

### Código fuente

```text
compose.dev.yml                                  # principal
docker/db/Dockerfile                             # database
db/                                              # database
├── postgresql.conf, pg_hba.conf
├── init/roles.sh, init/secrets.example/
├── migrations/0001_baseline.sql
├── seed.sql
├── tests/00_structure … 07_roles.test.sql
└── maintenance/cleanup.sql
src/instrumentation.ts                           # principal
src/lib/db/{pool,client,schema,errors,startup-check}.ts (+ errors.test.ts)   # principal
src/lib/auth/{auth,session}.ts                   # principal
src/app/api/auth/[...all]/route.ts               # principal
src/proxy.ts                                     # principal (deja pasar /api/auth; sin refresco de sesión)
src/lib/admin/{session,queries,actions}.ts       # principal (withAdmin)
src/lib/barbershops.ts, src/lib/booking/{queries,book}.ts,
src/lib/cancellation/{queries,cancel,token}.ts   # principal (withService, Buffer)
src/app/s/[subdomain]/admin/login/ + componente del formulario   # frontend (fetch + confirmPanelAccess)
scripts/{create-barbershop,db-reset}.mts, scripts/measure-ttfb.mjs   # principal
tests/integration/*.test.ts (reescritos y nuevos: schema-drift, isolation-app-login, pool, auth, formats)  # principal
tests/e2e/*                                      # frontend (solo preparación de datos y login)
eslint.config.mjs (no-restricted-imports), package.json, .env.example, .gitignore   # principal
CLAUDE.md, vault (ADR, Arquitectura, Roadmap, Plan)   # principal
```

Se borran `supabase/`, `src/lib/supabase/` y `src/lib/database.types.ts`.

## Fases y ejecución por agentes

1. **Medición previa** (principal): TTFB con Supabase local, **antes de cambiar nada**.
2. **Base** (agente `database`, Sonnet):
   - Dockerfile, configuración, `roles.sh`, `0001_baseline.sql`, `seed.sql`;
   - pgTAP 00–07 con la tabla de correspondencia de asserts.
   - Contrato de salida: roles, privilegios y nombres de restricción ([data-model.md](data-model.md)).
3. **Capa de datos y login** (principal): `compose.dev.yml`, scripts npm, `src/lib/db/`, Better Auth, ruta, proxy, `instrumentation.ts`, ESLint. Puede empezar en paralelo con la fase 2 usando el contrato.
4. **Reescritura de consultas** (principal): admin, reserva, cancelación y script de alta.
5. **Formulario de login** (agente `frontend`, Sonnet), en paralelo con la fase 4: `fetch` + `confirmPanelAccess`, mismos textos y foco; ajuste de los E2E.
6. **Tests** (principal): integración reescrita y tests obligatorios 2, 3, 4, 7, 8, 9 y 10. El 1, 5 y 6 van en pgTAP.
7. **Limpieza y cierre** (principal):
   - quitar Supabase;
   - medición posterior;
   - `CLAUDE.md` y vault;
   - revisión de los **tres agentes revisores** (hito de modelo de datos y RLS), con `security-reviewer` en el modelo por defecto;
   - commit y fusión en `main`.

**Riesgo de calendario:** el ADR estima el esfuerzo en dos fases del plan.

## Seguimiento de complejidad

| Desviación | Por qué hace falta | Alternativa más simple descartada porque |
|---|---|---|
| Puerto local `127.0.0.1:54329` (D2) | La app de desarrollo corre en el host | App en contenedor: lenta en Windows/OneDrive y cambia el flujo de `npm run dev` |
| Esquema Drizzle a mano + test de deriva (D1) | `drizzle-kit pull` no produce un archivo válido | Retocar la salida de `pull` rompe "no editar lo generado" y se repite en cada cambio |
| Imagen propia de la base (Dockerfile) | pgTAP y `pg_prove` no vienen en `postgres:17` | Instalarlos en cada arranque: lento y no reproducible |
