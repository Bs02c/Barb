# Plan de implementación: reserva mejorada (fase A)

**Rama**: `007-reserva-mejorada` | **Fecha**: 2026-10-14 | **Spec**: [spec.md](spec.md) (aprobada el 2026-10-14)

## Resumen

Cuatro mejoras de interfaz en la reserva pública, sin cambios en la base de datos ni en las reglas de la reserva:
1. **Hora elegida sin saltar de paso.** El paso 3 marca la hora elegida (`?hora=`) y muestra una barra fija con el resumen y "Continuar". El paso de datos pasa a depender de un parámetro nuevo, `datos=1`, que pone "Continuar".
2. **"Primera fecha con horas".** Sale del calendario que ya calcula `getAvailability`.
3. **Aviso de pocas horas.** `CalendarDay` gana `few` (de 1 a 3 horas libres).
4. **Confirmación.**
   - Archivo `.ics` generado en el navegador.
   - Enlace a Google Calendar (`calendar.google.com/calendar/render?action=TEMPLATE`); el botón de WhatsApp se quitó por decisión del usuario (2026-10-14).
   - "Cómo llegar" con `mapsSearchUrl`.
   - Los datos llegan en un campo nuevo `share` del resultado de la reserva, así que `BookingSummary` (que también usan el correo y la cancelación) no cambia.

## Contexto técnico

Next.js 16 (App Router) y TypeScript estricto. **Sin dependencias nuevas:** el `.ics` se escribe a mano (RFC 5545: `VCALENDAR`/`VEVENT`, `DTSTART`/`DTEND` en UTC con `Z`, escape de `,` `;` `\` y saltos de línea, líneas con CRLF). Tests con Vitest para la lógica pura y Playwright con `axe` para el flujo.

## Comprobación de la constitución

| Principio | Cumplimiento |
|---|---|
| I. Aislamiento | Sin consultas nuevas: todo sale de `getAvailability` y del resultado de `bookAppointment`, que ya filtran por la barbería del Host |
| II. Secretos | Nada nuevo llega al navegador salvo datos públicos de la cita (servicio, barbería, dirección, horas) |
| III. La base, última barrera | Sin cambios en la reserva ni en las restricciones |
| IV. UTC y zona | Fin = inicio + duración en UTC; textos con `src/lib/time.ts`; el `.ics` va en UTC |
| V. Validación | `hora`, `dia`, `franja` y `datos` se siguen validando contra la disponibilidad del servidor |
| V/VI. Token y datos personales | `share` no lleva el token de cancelación ni datos del cliente; lo comprueba un test (FR-009) |
| VII. Simplicidad | Sin dependencias ni servicios nuevos |

Hito de **reserva pública**: revisión de los tres agentes antes de fusionar.

## Diseño

### Lógica (`src/lib/booking/`, agente principal)

- **`calendar.ts`:**
  - `bookingCalendar(today, slotCounts: Map<string, number>)` añade `few: count >= 1 && count <= FEW_SLOTS (3)`;
  - `firstAvailableDay(calendar)` devuelve el primer día con `available`.
- **`share.ts` (nuevo, puro, sin `server-only`):**
  - tipo `BookingShare = { serviceName, barberName, barbershopName, address: string | null, startsAt, endsAt, localDate }`, con las fechas en ISO UTC;
  - `buildIcs(share, { uid, now })`: texto `.ics` (escape RFC 5545; cualquier salto o control se neutraliza, SEC-001);
  - `googleCalendarUrl(share)`: `calendar.google.com/calendar/render?action=TEMPLATE…` (sustituye al enlace de WhatsApp, quitado por el usuario el 2026-10-14);
  - `icsFileName(share)`.
- **`book.ts`:** el resultado `ok` gana `share: BookingShare` (null con honeypot).
- **`time.ts`:** `formatTimeRange(start, end, tz)` → "10:00 a. m. – 10:30 a. m." (las dos horas completas: el "a" de Intl se confundía con "a. m."). El fin sale de `AvailableSlot.endsAt` (revisión, MAINT-001).

### Página y componentes (agente `frontend`)

- **Paso 3**, en `reservar/page.tsx`:
  - con `hora` válida: chip marcado (`aria-current="true"`) y **barra fija** `BookingBar` con el resumen y el enlace "Continuar" (misma URL + `datos=1`);
  - con `hora` no válida: aviso `MESSAGES.slotTaken`, sin barra;
  - sin `dia`: botón "Primera fecha con horas: …";
  - fechas con `few`: punto cobre y texto `sr-only`.
- **Paso 4:** solo con `datos=1` (o con el atajo de "Lo más pronto"). Barra fija con el resumen y el botón de envío "Confirmar reserva". El enlace "volver" quita `datos`.
- **Confirmación** (`booking-form.tsx`), con `share`:
  - "iPhone u Outlook": `Blob` + descarga del `.ics`, desde un botón secundario;
  - "Añadir a Google Calendar": enlace en una pestaña nueva (botón principal; el `.ics` pasa a "iPhone u Outlook");
  - "Cómo llegar", si hay dirección.
- **DESIGN.md:** barra fija de la reserva y botones de la confirmación.

### Tests

- **Unitarios:**
  - `few` y `firstAvailableDay`;
  - `buildIcs` (UTC, escape, CRLF, sin token);
  - `googleCalendarUrl` (parámetros, fechas UTC, sin token ni datos del cliente);
  - `formatTimeRange`.
- **Integración:** `bookAppointment` devuelve `share` sin token ni datos personales.
- **E2E:**
  - hora → barra → Continuar → datos con barra → confirmar → botones de la confirmación;
  - "Primera fecha con horas";
  - punto de pocas;
  - `axe`.
