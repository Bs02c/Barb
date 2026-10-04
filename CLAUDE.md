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
- **Super admin (dueño de la plataforma):** da de alta barberías con un script o desde Supabase (sin panel en el MVP).
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
- **Supabase (nube, plan gratuito):** PostgreSQL, Supabase Auth (roles: `super_admin`, `admin`), Row Level Security
- Cliente: `@supabase/ssr` + `supabase-js`
- Resend + React Email (correo)
- Supabase CLI para desarrollo local y migraciones versionadas
- Playwright + `@axe-core/playwright` para 3–5 tests E2E y de accesibilidad (ADR-012)
- Spec Kit para spec-driven development (ver más abajo)
- Hosting: Vercel durante la fase de pruebas (ver Despliegue)

## Comandos
| Comando | Qué hace |
|---|---|
| `npm run dev` | App en `http://localhost:3000`; subdominios con `http://<barberia>.localhost:3000` |
| `npm run db:start` | Arranca Supabase local (requiere Docker en marcha) |
| `npm run db:reset` | Recrea la base local aplicando migraciones y `supabase/seed.sql` |
| `npx supabase migration new <nombre>` | Crea una migración vacía |
| `npm run lint` | ESLint |
| `npm run typecheck` | Genera los tipos de rutas de Next.js y ejecuta `tsc` |
| `npm test` | Tests unitarios (Vitest, `src/**/*.test.ts`) |
| `npm run test:db` | Tests de base de datos (pgTAP, `supabase/tests/*.sql`) |
| `npm run test:integration` | Tests contra Supabase local en marcha (Vitest, `tests/integration/`); se niegan a correr contra un entorno remoto |
| `npm run db:types` | Regenera `src/lib/database.types.ts` desde la base local; ejecutar tras cada migración |
| `npm run build` | Compilación de producción |

Antes de dar una tarea por terminada: `lint`, `typecheck`, `test` y, si se tocó la base de datos, `db:types`, `test:db` y `test:integration`.

## Entornos de base de datos (ADR-014)
- **Local** (Docker): desarrollo y todos los tests; datos de demostración en `supabase/seed.sql`.
- **Pruebas** (Supabase nube, fase 7): demostración en Vercel; solo datos de demostración.
- **Producción** (Supabase nube, con el primer cliente): solo migraciones. Nunca seed, nunca tests, nunca `--linked` con `test db` o `db reset`.

## Estructura
- `src/app/`: rutas, páginas y layouts (App Router).
- `src/components/` (`ui/` es de shadcn), `src/lib/`: utilidades, clientes de Supabase, esquemas Zod compartidos.
- `supabase/migrations/`, `supabase/seed.sql`, `supabase/tests/`: base de datos.
- `tests/e2e/`: Playwright (desde la fase 4).
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
- RLS activado en todas las tablas; políticas basadas en el `barbershop_id` y rol del usuario autenticado.
- La web pública del cliente no usa sesión: las reservas pasan por el backend de Next.js (server actions o route handlers) con la service role key, nunca expuesta al navegador.
- Resolución del tenant por subdominio en el middleware de Next.js.
- Evitar dobles reservas: validación en el servidor y restricción en Postgres (exclusion constraint sobre rango de tiempo por barbero).
- Manejo de zonas horarias por barbería (guardar en UTC).
- **Código portable:** no usar servicios exclusivos de Vercel (Vercel Cron, KV, Blob, Edge Config). La app debe poder pasar al VPS sin reescribirse.

## Despliegue
- **Fase de pruebas:** Vercel (plan Hobby) con dominio comodín `*.midominio.com`. El plan Hobby es solo para uso no comercial: sirve para desarrollar y hacer demos con datos de prueba, no para una barbería que reciba reservas reales ni para una landing que venda el servicio.
- **Con el primer cliente:** migrar al VPS propio con Docker Compose (`app` + `caddy`) y certificado comodín vía Caddy (ADR-005), o pasar a Vercel Pro si se decide en ese momento (ADR-011).
- **Antes del primer cliente que pague:** respaldos propios con `pg_dump` y plan de pago de Supabase (el gratuito se pausa tras una semana sin actividad).
- En desarrollo local, los subdominios se prueban con `*.localhost` (ej. `labarberia.localhost:3000`).
- Detalle en `Arquitectura/despliegue.md` del vault.

## Checklist de calidad del MVP
**Legal**
- Política de tratamiento de datos (Ley 1581 de 2012, Colombia) y casilla de autorización en el formulario de reserva, guardando la fecha de aceptación.
- Condiciones de reserva para clientes finales.
- Solicitud de borrado de datos por correo (proceso manual).
- Ningún secreto en el cliente (service role key solo en servidor; revisar variables `NEXT_PUBLIC_`).
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
- **`database`**: migraciones, RLS, restricciones, seed y tests pgTAP. Solo escribe en `supabase/`.
- **`frontend`**: páginas y componentes según `DESIGN.md`, accesibilidad y Playwright. Solo escribe en `src/app/`, `src/components/` y `tests/e2e/`.

El agente principal escribe spec, plan y tareas, define el contrato entre ambos, escribe las server actions y los clientes de Supabase, integra, ejecuta los tests, explica y hace el commit.

## Agentes de revisión de código
Son subagentes de Claude Code definidos en `.claude/agents/` (solo lectura: `Read`, `Grep`, `Glob`). Su fuente de verdad es la constitución, las specs, este archivo, `Decisiones/` y `Arquitectura/` del vault y las migraciones de `supabase/migrations/`; pásales siempre el diff o la lista de archivos del cambio, porque no ejecutan comandos.
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

## Primer paso
Fase 1 del plan: modelo de datos del MVP y políticas RLS, con spec (`/speckit-specify`).
