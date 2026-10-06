---
description: "Tareas de la fase 6: agenda del admin"
---

# Tareas: agenda del admin

**Entrada**: [plan.md](plan.md). Leerlo entero antes de empezar: tiene las decisiones, el contrato y el reparto.

**Formato**: `[ID] [P?] Descripción [responsable]`. `[P]` = paralelizable.

**Reglas para todo agente** (Sonnet 5.5):
- Leer `AGENTS.md` y, antes de usar una API de Next.js 16 (`searchParams`, `PageProps`, server actions, `revalidatePath`), su guía en `node_modules/next/dist/docs/`.
- Leer `CLAUDE.md` (estructura, estilo, comandos) y `DESIGN.md` (sección "Panel del admin" y "Agenda").
- Nombres de código en inglés; textos y comentarios en español.
- Nunca la clave secreta en el panel: se usa la sesión del admin (`createClient` de `src/lib/supabase/server.ts`).
- Sin dependencias nuevas.
- No tocar `supabase/` (no hay cambios de base de datos).
- Terminar con `npm run lint` y `npm run typecheck` sin errores y un **reporte breve**: archivos, decisiones, lo que no se pudo hacer.
- Añadir archivos a git **por nombre**, nunca con `git add -A`, mientras haya agentes trabajando.

## Principal

- [ ] T001 `git switch -c 004-agenda-admin` desde `main`; commit de `specs/004-agenda-admin/` (`docs:`).
- [ ] T002 **Contrato** (desbloquea al frontend; commit `feat:` en cuanto compile):
  - `agendaParamsSchema` en `src/lib/admin/schemas.ts`. Cada campo es opcional; un valor inválido se convierte en `undefined` con `.catch(undefined)`. Para `dia`, validar además que la fecha exista (por ejemplo `2026-02-30` no vale).
  - `src/lib/admin/agenda.ts` con `dayRangeUtc` (usa `localDateTimeToUtc` y `addDaysToLocalDate` de `src/lib/time.ts`).
  - Tipo `AgendaAppointment` y firma de `listAppointmentsForDay` en `queries.ts`.
  - Firma de `adminCancelAppointment` en `actions.ts`.

  Las funciones pueden quedar con un cuerpo provisional que lance `"pendiente: T003"`, como se hizo en la fase 5.
- [ ] T003 [P] Implementar:
  - `listAppointmentsForDay`: sesión del admin; `.gte("starts_at", start).lt("starts_at", end)`; `.eq("barber_id", barberId)` si viene; `select("id, starts_at, ends_at, status, customer_name, customer_phone, barbers(name), services(name)")`; orden por `starts_at` y luego por estado (activas primero). Mapear al tipo `AgendaAppointment`. Hay un ejemplo de join embebido en `src/lib/cancellation/queries.ts`.
  - `adminCancelAppointment`: `requireAdmin` → `idSchema` → `update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", id).eq("status", "active").gt("starts_at", new Date().toISOString()).select("id")`.
    - Error → `fromDatabase`.
    - 0 filas → `{ ok: false, message: "Esta cita ya no se puede cancelar." }`.
    - Si va bien → `refresh(subdomain)` y `{ ok: true, message: "Cita cancelada." }`.
- [ ] T004 [P] Tests unitarios:
  - **`src/lib/admin/agenda.test.ts`**:
    - `dayRangeUtc("2026-10-13", "America/Bogota")` → `2026-10-13T05:00:00.000Z` a `2026-10-14T05:00:00.000Z`;
    - una cita a las 23:30 locales cae dentro del día local y no del siguiente.
  - **`agendaParamsSchema`**, en `src/lib/admin/schemas.test.ts`, que ya existe:
    - acepta fecha y uuid válidos;
    - convierte en `undefined` `"2026-02-30"`, `"mañana"`, `"<script>"` y un uuid inválido.

  Después `npm test`.

## frontend

- [ ] T005 [P] Página de la agenda en `src/app/s/[subdomain]/admin/(panel)/page.tsx`. Sustituye el inicio actual y conserva el patrón de `getPanelContext`.
  - Leer `searchParams` → `agendaParamsSchema`. Día por defecto: `toLocalDate(new Date(), barbershop.timezone)`.
  - En paralelo: `listAppointmentsForDay`, `listBarbers` (para el filtro) y `listServices` (para el aviso).
  - **Encabezado**: "Agenda" + fecha legible (`formatLocalDate`).
  - **Navegación del día**: "Día anterior" / "Hoy" / "Día siguiente" (enlaces que conservan `barbero`) y `<form method="get">` con `<input type="date" name="dia">` y `<select name="barbero">` ("Todos los barberos" + barberos) y botón "Ver".
  - **Aviso existente** si no hay barbero o servicio activo.
  - **Día vacío**: estado vacío "No hay citas este día".
  - `metadata`: título "Agenda".
- [ ] T006 [P] Componente `src/components/admin/agenda-table.tsx` ("use client" solo si hace falta para el diálogo) y navegación:
  - **Columnas** del plan, decisión 3: Hora `formatTime(inicio)–formatTime(fin)` en la zona de la barbería (pasar la zona como prop o formatear en el servidor), Barbero, Cliente (nombre + `<a href="tel:+57…">`), Servicio, Estado (insignia; las canceladas atenuadas) y acción.
  - **Acción "Cancelar"**: solo si `status === "active"` y `startsAt > ahora`. Reutilizar el patrón de `src/components/admin/confirm-delete.tsx` y `use-admin-form.ts` con `adminCancelAppointment`. Título "¿Cancelar la cita de {nombre} a las {hora}?", descripción "El horario quedará libre para otras reservas. Avisa al cliente por teléfono." y botón destructivo "Cancelar cita".
  - **Móvil (< md)**: una tarjeta por cita en lugar de tabla. Filas o tarjetas de al menos 44 px; los mensajes del resultado van en `role="status"` o `role="alert"`, como el resto del panel.
  - **Navegación** en `src/components/admin/admin-nav.tsx`: el ítem `{ segment: null, href: "/admin" }` pasa a llamarse "Agenda" con el icono `CalendarDays`; `BottomNav` sigue en `grid-cols-6`.
- [ ] T007 E2E `tests/e2e/admin-agenda.spec.ts` (375 px y escritorio), con el encabezado de seguridad de `booking.spec.ts` (solo local, `.env.local`):
  1. **Preparar**, en `beforeAll` y con el cliente de servicio: crear para **mañana**, a una hora dentro del horario del seed, una cita activa en `labarberia` con un correo único `e2e-agenda-…@example.com`. Calcular la hora con `localDateTimeToUtc` y la zona `America/Bogota`, y elegir un hueco libre de un barbero del seed (consultar `barber_schedules` del seed). Insertarla con todos los campos obligatorios (ver `book.ts`).
  2. **Login** en `/admin/login` con `admin@labarberia.example.com` y la contraseña de demostración de `supabase/seed.sql`, que es solo local. No escribirla en el reporte.
  3. **Ver la cita**: ir a `/admin?dia=<mañana>`; la cita aparece con hora, barbero y nombre; escaneo axe.
  4. **Cancelar**: pulsar "Cancelar" → diálogo → "Cancelar cita" → aparece "Cancelada" y desaparece el botón; escaneo axe.
  5. **Hora liberada**: en `/reservar` con ese servicio y barbero, la hora vuelve a ofrecerse. Opcional si complica el test; en ese caso comprobar en la base que `status = 'cancelled'`.
  6. **Parámetro inválido**: `/admin?dia=basura` muestra la agenda de hoy sin error.

  En `afterAll`, borrar la cita por correo. No ejecutar hasta que T003 esté hecho; antes, solo `lint` y `typecheck`.

## Principal (cierre)

- [ ] T008 Integración: `npm run lint`, `typecheck`, `test`, `test:db`, `test:integration`, `test:e2e` y `build` en verde. Prueba manual en el navegador: `labarberia.localhost:3000/admin` en móvil y escritorio, cambiar de día y de barbero, cancelar.
- [ ] T009 Vault (Estado actual, Pendientes, Plan de ejecución con la fase 6 terminada, Bitácora), explicación breve al usuario, fusión en `main` (`git merge --no-ff`) y commit `feat: fase 6, agenda del admin`.

## Dependencias

- T001 → T002 → (T003, T004) y (T005, T006) en paralelo.
- T003 + T005 + T006 → T007 → T008 → T009.
