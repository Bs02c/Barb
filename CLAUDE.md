# Proyecto: SaaS de reservas para barberías

@AGENTS.md

## Idea
Plataforma multi-tenant donde cada barbería tiene su propio espacio, identificado por subdominio (ej. `labarberia.midominio.com`). Datos y configuración de cada barbería aislados.

**Enfoque: MVP sin sobreingeniería.** Solo se construye lo necesario para que una barbería real reciba reservas online sin errores ni riesgos legales. Lo demás está en `Roadmap.md` del vault y entra cuando haya un cliente que lo pida o un problema real que lo justifique (ver `Decisiones/ADR-010`).

## Forma de trabajar
- Claude escribe todo el código; el usuario no implementa.
- Al terminar una funcionalidad, Claude explica brevemente cómo funciona y cómo se conecta con el resto, sin extenderse.
- Se trabaja según `Plan-de-ejecucion.md` del vault (8 fases). Al cerrar cada fase, Claude hace el commit (autorizado por el usuario).
- Diseño: `DESIGN.md` en la raíz es la fuente de verdad; UI UX Pro Max propone y audita dentro de él (ADR-012).
- Las reglas no negociables y los límites (Siempre / Preguntar primero / Nunca) están en `.specify/memory/constitution.md`.

## Roles (MVP)
- **Super admin (dueño de la plataforma):** da de alta barberías con `npm run barbershop:create` (sin panel en el MVP).
- **Admin de barbería:** gestiona barberos, servicios, horarios, bloqueos y citas.
- **Barbero:** existe como dato (tiene horario y citas), pero no tiene login en el MVP.
- **Cliente final:** reserva sin crear cuenta.

## Funcionalidades del MVP
**Web pública del cliente (por subdominio):**
- Elegir servicio, barbero, fecha y hora según disponibilidad.
- Dejar nombre, WhatsApp y correo, con casilla de autorización de datos; agendar.
- Recibir confirmación por correo con un enlace seguro (token) para **cancelar**.

**Panel del admin de barbería:**
- Gestionar barberos y servicios (duración y precio).
- Asignar horario semanal y bloqueos (descansos, vacaciones).
- Ver la agenda de los barberos (se actualiza al recargar) y cancelar citas.

**Fuera del MVP** (detalle, beneficio y momento en `Roadmap.md`): reagendar, recordatorios, WhatsApp, login de barberos, agenda en tiempo real, métricas, panel del super admin, colas con reintentos, Turnstile, SEO avanzado, Sentry/Umami, colores personalizados, auditoría.

## Stack del MVP
- Next.js (App Router) + TypeScript
- Tailwind CSS + shadcn/ui
- Zod (validación)
- **PostgreSQL 17 propio** (contenedor por entorno) con Row Level Security y roles propios (ADR-017): la app se conecta como `app_login` y cambia por transacción a `authenticated` (panel) o `service_role` (web pública)
- **Better Auth** para el login del admin (esquema `identity`, registro cerrado, límite de intentos en la base)
- **Drizzle ORM** solo como constructor de consultas, con el driver `pg`; esquema TS escrito a mano y comprobado por un test de deriva (ADR-017, enmienda 1)
- **dbmate** para migraciones SQL versionadas: el SQL es la única fuente de verdad del esquema
- Resend (correo, por `fetch` a su API, sin SDK ni React Email: ADR-015)
- Playwright + `@axe-core/playwright` para 3–5 tests E2E y de accesibilidad (ADR-012)
- Spec Kit para spec-driven development (ver más abajo)
- Hosting: VPS propio (4 GB) con Docker Compose y Caddy, desde las pruebas (ADR-016)

## Comandos
| Comando | Qué hace |
|---|---|
| `npm run dev` | App en `http://localhost:3000`; subdominios con `http://<barberia>.localhost:3000` |
| `npm run db:start` / `db:stop` | Arranca o detiene la base local (`compose.dev.yml`, requiere Docker; solo en `127.0.0.1:54329`) |
| `npm run db:reset` | Recrea la base local: borra `barberias`, aplica migraciones (dbmate) y carga `db/seed.sql`. Se niega fuera de local |
| `npm run db:migrate` | Aplica las migraciones pendientes (dbmate como `db_owner`) |
| `docker compose -f compose.dev.yml run --rm migrate new <nombre>` | Crea una migración vacía en `db/migrations/` (formato `-- migrate:up` / `-- migrate:down`) |
| `npm run lint` | ESLint (incluye las reglas que impiden saltarse `src/lib/db/`) |
| `npm run typecheck` | Genera los tipos de rutas de Next.js y ejecuta `tsc` |
| `npm test` | Tests unitarios (Vitest, `src/**/*.test.ts`) |
| `npm run test:db` | Tests de base de datos (pgTAP con `pg_prove` dentro del contenedor, `db/tests/*.test.sql`) |
| `npm run test:integration` | Tests contra la base local (Vitest, `tests/integration/`), con la conexión real de la app; se niegan a correr contra un host no local |
| `npm run test:e2e` | Tests E2E con Playwright y escaneo de accesibilidad `axe` (`tests/e2e/`); arranca `npm run dev` si no está en marcha. Sin el Chromium de Playwright: `PLAYWRIGHT_CHANNEL=msedge npm run test:e2e` |
| `npm run barbershop:create -- --name "…" --subdomain … --admin-email …` | Alta de barbería + admin + perfil en una transacción (super admin, como `db_owner`). Muestra la contraseña una sola vez. Contra un destino no local exige `--confirm-remote` |
| `npm run perf:ttfb` | Mide el TTFB de `/reservar` y `/admin` contra `npm run start` |
| `npm run build` | Compilación de producción |

Si `npm run build` falla con `EPERM ... unlink '.next\...'`, detener cualquier `next start` y borrar `.next` (el proyecto está en OneDrive, que bloquea archivos de esa carpeta).

Antes de dar una tarea por terminada: `lint`, `typecheck`, `test` y, si se tocó la base de datos, `test:db` y `test:integration` (si cambió una tabla, actualizar `src/lib/db/schema.ts`: lo vigila `schema-drift.test.ts`); si se tocó la reserva pública o el login, también `test:e2e`.

## Entornos de base de datos (ADR-014, modificado por ADR-017 §7)
- **Local** (`compose.dev.yml`): desarrollo y todos los tests; datos de demostración en `db/seed.sql` (contraseña de demostración versionada, solo local).
- **Pruebas** (contenedor `db` propio en el VPS, fase 7): nunca `db/seed.sql` (se niega a cargarse fuera de local); usuarios con el script y contraseña aleatoria.
- **Producción** (contenedor `db` propio en el VPS, con el primer cliente): solo migraciones. Nunca seed, nunca tests. Nunca el mismo PostgreSQL que pruebas.
- Roles (matriz en `data-model.md` de la spec 005): `app_login` (app, sin privilegios propios), `auth_login` (Better Auth), `db_owner` (migraciones, script de alta, seed), `db_backup` (solo lectura). Contraseñas en `db/init/secrets/` (local, ignorado por git) o Docker secrets; nunca en el repo ni en el entorno del contenedor `app` las de `postgres` o `db_owner`.

## Estructura
- `src/proxy.ts`: lo que antes era middleware (Next.js 16). Reescribe `<barberia>.dominio/x` a `/s/<barberia>/x`; las rutas `/s/...` solo se alcanzan por subdominio. La lógica pura está en `src/lib/tenant.ts`.
- `src/app/s/[subdomain]/`: páginas de cada barbería; comprueban que exista y esté activa (`getPublicBarbershop`) o responden "Barbería no encontrada" (404).
- `src/app/`: resto de rutas, páginas y layouts (App Router).
- `src/lib/db/`: única puerta a la base (`server-only`). `client.ts`: `withAdmin(session, fn)` (transacción como `authenticated` con la identidad verificada) y `withService(fn)` (como `service_role`, se salta RLS: solo web pública y siempre filtrando por la barbería del Host). `pool.ts` (pools de `app_login` y `auth_login`; no se importa fuera de `src/lib/db/` y `src/lib/auth/`), `schema.ts` (Drizzle, escrito a mano), `errors.ts` (`toDbError`: código y restricción, nunca el mensaje), `startup-check.ts` (la app no arranca si su rol puede saltarse RLS; lo llama `src/instrumentation.ts`).
- `src/lib/auth/`: Better Auth (`auth.ts`, `getAuth()`), `session.ts` (`getVerifiedSession`: el único que fabrica `VerifiedSession`). Ruta `src/app/api/auth/[...all]/route.ts`: solo `/sign-in/email`, `/sign-out` y `/get-session`; el proxy la deja pasar solo desde un subdominio de barbería.
- `src/lib/admin/`: capa de servidor del panel (agente principal): `session.ts` (quién es y si es admin de esta barbería), `actions.ts` (server actions, incluido `confirmPanelAccess`, segundo paso del login), `queries.ts`, `schemas.ts` (Zod compartido), `action-state.ts`.
- `src/lib/time.ts`: único módulo de zona horaria y formatos `es-CO` (constitución IV); `createZoneConverter` para cálculos masivos.
- `src/lib/booking/`: reserva pública (agente principal): `availability.ts` (cálculo puro de huecos), `queries.ts`, `book.ts`, `submit.ts` (resuelve la barbería del **Host**, nunca de un dato del navegador), `actions.ts`, `schemas.ts`, `phone.ts`, `messages.ts`.
- `src/lib/cancellation/`: cancelación con enlace (agente principal): `token.ts` (token de 256 bits, hash SHA-256, URL del enlace), `queries.ts` (lectura; abrir el enlace nunca cancela), `cancel.ts` (`submitCancellation`: resuelve la barbería del **Host** y cancela con una sola sentencia atómica), `actions.ts`, `schemas.ts`, `messages.ts`, `cancellation-state.ts`.
- `src/lib/email/`: `send.ts` (transporte `outbox` en desarrollo y tests, escribe en `.outbox/`; `resend` en producción; el outbox está prohibido en producción), `confirmation.ts` (plantilla HTML con `escapeHtml`; `sendConfirmation` nunca lanza), `escape.ts`. Variables: `EMAIL_TRANSPORT`, `EMAIL_FROM`, `RESEND_API_KEY`.
- `src/lib/log.ts`: `logSafeError`, la única forma de registrar errores (sin datos personales ni tokens; de un error de la base, solo código y restricción: el mensaje de Drizzle lleva los parámetros).
- `src/lib/validation.ts`: `toFieldErrors`, conversión única de errores de Zod.
- `src/app/s/[subdomain]/reservar/` (flujo en 4 pasos guardado en la URL; "Lo más pronto" salta al paso de datos), `cancelar/[token]/` (el GET muestra, el botón cancela) y `privacidad/` (plantilla pendiente de revisión legal).
- `src/components/forms/`: campos de formulario compartidos por el panel y la reserva.
- `src/app/s/[subdomain]/admin/`: panel (`login/` y el grupo `(panel)/` protegido). `/admin` es la **agenda** (día y barbero por `?dia=&barbero=`; `src/lib/admin/agenda.ts` y `src/components/admin/agenda-table.tsx`).
- `scripts/`: herramientas del super admin (`create-barbershop.mts`), `db-reset.mts` y `measure-ttfb.mjs`.
- `src/components/` (`ui/` es de shadcn), `src/lib/`: utilidades, capa de datos, login, esquemas Zod compartidos.
- `db/`: base de datos. `migrations/` (dbmate; `0001_baseline.sql` sustituyó a las migraciones de Supabase), `seed.sql` (solo local), `tests/` (pgTAP), `init/roles.sh` (roles, idempotente), `postgresql.conf` y `pg_hba.conf` (sin `trust`). `docker/db/Dockerfile`: PostgreSQL 17 + pgTAP. `compose.dev.yml`: base local y servicio `migrate`.
- `tests/integration/`: Vitest contra la base local; `helpers/db.ts` prepara datos como `db_owner` (nunca para comprobar lo que ve la app).
- `tests/e2e/`: Playwright (reserva, cancelación con enlace y agenda); `global-setup.ts` vacía `.outbox/` antes de cada ejecución.
- `specs/<nnn-nombre>/`: specs de Spec Kit; `.specify/`: constitución y plantillas.
- Variables de entorno: `.env.example` (plantilla, versionada) y `.env.local` (valores reales, no versionado).

## Estilo de código
- TypeScript estricto; alias `@/` para `src/`.
- Server Components por defecto; `"use client"` solo cuando haga falta interacción.
- Acceso a datos y secretos solo en server actions, route handlers o módulos de servidor.
- Nombres de código en inglés; textos de la interfaz y comentarios en español.
- Next.js 16 tiene cambios respecto a versiones anteriores: consultar `node_modules/next/dist/docs/` (ver `AGENTS.md`).

## Flujo de git
- Rama `main`. Commit al cerrar cada fase del plan, con mensajes en español al estilo Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`).
- Las fases con spec usan la rama que crea Spec Kit (`NNN-nombre`) y se fusionan en `main` al cerrarlas.
- Los agentes de desarrollo que trabajan en paralelo usan cada uno su git worktree.

## Decisiones técnicas
- Multi-tenancy: una sola base de datos, cada tabla con `barbershop_id`.
- RLS activado en todas las tablas; políticas basadas en el `barbershop_id` y la identidad del admin (`private.current_user_id()`, fijada solo por `withAdmin` dentro de cada transacción). Permisos exactos por rol, tabla y columna (ADR-017).
- La web pública del cliente no usa sesión: las reservas pasan por el backend de Next.js (server actions o route handlers) con `withService` (rol `service_role`), nunca expuesto al navegador.
- Resolución del tenant por subdominio en el proxy de Next.js (`src/proxy.ts`).
- Evitar dobles reservas: validación en el servidor y restricción en Postgres (exclusion constraint sobre rango de tiempo por barbero).
- Manejo de zonas horarias por barbería (guardar en UTC).
- **Código portable:** sin servicios exclusivos de un hosting (Vercel Cron, KV, Blob, Edge Config). Todo corre en el Compose del VPS.

## Despliegue
- **Desde la fase 7 (ADR-016, 2026-10-08):** VPS propio (Contabo, Alemania, Ubuntu 24 LTS) con Docker Compose (`app`, `caddy` y `db` por entorno; `migrate` bajo demanda), dominio comprado en Cloudflare y certificado comodín `*.dominio` vía Caddy con desafío DNS de Cloudflare (ADR-005). Sin Vercel (ADR-011 queda superado en este punto).
- **Con el primer cliente:** el mismo VPS pasa a producción, con su propio contenedor de PostgreSQL (ADR-017).
- **Antes del primer cliente que pague:** respaldos con `pg_dump` como `db_backup`, cifrados con `age` antes de salir del VPS, y restauración probada (ADR-017 §6).
- En desarrollo local, los subdominios se prueban con `*.localhost` (ej. `labarberia.localhost:3000`).
- Detalle en `Arquitectura/despliegue.md` del vault.

## Checklist de calidad del MVP
**Legal**
- Política de tratamiento de datos (Ley 1581 de 2012, Colombia) y casilla de autorización en el formulario de reserva, guardando la fecha de aceptación.
- Condiciones de reserva para clientes finales.
- Solicitud de borrado de datos por correo (proceso manual).
- Ningún secreto en el cliente (credenciales de la base y `BETTER_AUTH_SECRET` solo en servidor; revisar variables `NEXT_PUBLIC_`).
- HTTPS forzado (lo da el hosting).
- Sin cookies no esenciales, así que sin banner de cookies.

**SEO y usabilidad**
- Título y metadescripción en la página de cada barbería; `noindex` en paneles, flujo de reserva y enlaces de cancelación.
- Favicon y texto ALT en imágenes.
- Diseño mobile-first.
- Página 404 y página de "barbería no encontrada" para subdominios inexistentes.

**Robustez**
- Validación con Zod en cliente y servidor; teléfonos en formato E.164.
- Antispam: honeypot y tope de citas activas por teléfono.
- Tests de aislamiento entre barberías, dobles reservas y zona horaria.
- CTA: "Reservar cita".

## Spec-driven development (Spec Kit)
- Constitución del proyecto: `.specify/memory/constitution.md`. Prevalece sobre specs, planes y tareas.
- Flujo: `/speckit-specify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement` → `/speckit-converge`. Opcionales: `/speckit-clarify`, `/speckit-analyze`, `/speckit-checklist`.
- Las specs se usan solo en funcionalidades delicadas (reserva, políticas RLS, cancelación con token). Las piezas sencillas no necesitan spec.
- Ver `Decisiones/ADR-009`.

## Agentes de desarrollo
Subagentes en `.claude/agents/` que implementan en paralelo las tareas `[P]` de `tasks.md` y entregan un reporte (ADR-013):
- **`database`** (modelo Sonnet): migraciones (dbmate), RLS, permisos por rol, restricciones, seed y tests pgTAP. Solo escribe en `db/` (ADR-017).
- **`frontend`** (modelo Sonnet): páginas y componentes según `DESIGN.md`, accesibilidad y Playwright. Solo escribe en `src/app/`, `src/components/` y `tests/e2e/`.

El agente principal escribe spec, plan y tareas, define el contrato entre ambos, escribe las server actions y la capa de datos (`src/lib/db/`, `src/lib/auth/`), integra, ejecuta los tests, explica y hace el commit. Con agentes escribiendo en paralelo, añade archivos a git por nombre, no con `git add -A`.

## Agentes de revisión de código
Son subagentes de Claude Code definidos en `.claude/agents/` (solo lectura: `Read`, `Grep`, `Glob`). Su fuente de verdad es la constitución, las specs, este archivo, `Decisiones/` y `Arquitectura/` del vault y las migraciones de `db/migrations/`; pásales siempre el diff o la lista de archivos del cambio, porque no ejecutan comandos.
1. **Seguridad** (`security-reviewer`): exposición de datos, validación de entradas, accesos indebidos (incluye aislamiento entre barberías y políticas RLS).
2. **Rendimiento** (`performance-reviewer`): consultas repetidas, operaciones innecesarias, qué se rompe cuando la app crece.
3. **Mantenibilidad** (`maintainability-reviewer`): si el código se entiende en seis meses y si los tests protegen lo importante.

Se usan solo en los hitos de modelo de datos y RLS, reserva pública, confirmación y cancelación, y despliegue de pruebas. Su esquema de reporte común está en `Revisiones/esquema-de-reporte.md` del vault. No hay agente orquestador (ver `Decisiones/ADR-008`): la comparación la hace el agente principal.

Cada agente revisa el mismo cambio de forma independiente y reporta siempre:
- Qué comprobó.
- Qué encontró (con severidad y ubicación).
- Qué no pudo revisar y por qué.

El agente principal compara los tres informes, señala hallazgos coincidentes y contradictorios, y no da por revisado un aspecto que algún agente reportó como no revisado.

## Documentación de arquitectura (opcional)
- Usar Archify tras definir el modelo de datos: diagrama de arquitectura y de secuencia del flujo de reserva.

## Memoria del proyecto (Obsidian)
Vault: C:/Users/Bsrid/OneDrive/Escritorio/Obsidian/Barbería

@C:/Users/Bsrid/OneDrive/Escritorio/Obsidian/Barbería/Estado-actual.md
@C:/Users/Bsrid/OneDrive/Escritorio/Obsidian/Barbería/Pendientes.md

**Al empezar una sesión:** el estado actual y los pendientes ya están cargados arriba. Antes de proponer un cambio de arquitectura, revisa las notas en `Decisiones/`. Antes de añadir una funcionalidad, comprueba si está en `Roadmap.md` (fuera del MVP).

**Al terminar una sesión (o cuando el usuario diga "cerrar sesión"):**
1. Reescribe `Estado-actual.md` con el estado real (máximo una pantalla).
2. Actualiza `Pendientes.md`.
3. Crea la nota del día en `Bitacora/` usando `Plantillas/plantilla-bitacora.md`.
4. Si se tomó una decisión de arquitectura, crea un ADR en `Decisiones/`.
5. Si hubo revisión de los agentes, guarda el informe consolidado en `Revisiones/`.

## Siguiente paso
**Migración a PostgreSQL propio terminada (spec 005, ADR-017, constitución 1.2.1):** implementada, revisada por los tres agentes (dos pasadas) y fusionada en `main`. Siguiente: la **fase 7: despliegue de pruebas en el VPS**, cumpliendo los requisitos del informe `Revisiones/2026-10-13-spec-005-migracion-postgresql.md` del vault. Detalle en `Decisiones/ADR-017`, `Migracion-PostgreSQL/` y `Pendientes.md` del vault. Repositorio: `https://github.com/Bs02c/Barb.git` (`origin`).
