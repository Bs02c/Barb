---
description: "Tareas de la spec 007: reserva mejorada (fase A)"
---

# Tareas: reserva mejorada (fase A)

**Formato**: `- [ ] Tnnn [P?] [Historia] Descripción [responsable]`. Responsables: `[principal]` (src/lib, tests de integración) y `[frontend]` (src/app, src/components, tests/e2e). Sin cambios en `db/`.

## Fase 1: lógica (principal)

- [X] T001 [P] [US3] `src/lib/booking/calendar.ts`: `bookingCalendar(today, slotCounts)` con `few` (1–3 horas, `FEW_SLOTS = 3`) y `firstAvailableDay(calendar)`. Tests en `calendar.test.ts`. `getAvailability` pasa los recuentos por día [principal]
- [X] T002 [P] [US1] `src/lib/time.ts`: `formatTimeRange(startIso, endIso, tz)` → "10:00 – 10:30 a. m." (o con a. m. y p. m. si cruza el mediodía), con test [principal]
- [X] T003 [P] [US4] `src/lib/booking/share.ts` + `share.test.ts`: `BookingShare`, `buildIcs`, `icsFileName`, `whatsappShareUrl`. Tests: UTC con `Z`, CRLF, escape de `,;\` y saltos, sin token ni datos del cliente [principal]
- [X] T004 [US4] `book.ts` y `booking-state.ts`: el resultado `ok` gana `share` (null con honeypot); `submit.ts` lo pasa. Test de integración en `booking.test.ts`: `share` presente, sin token ni datos personales [principal]

## Fase 2: interfaz (frontend)

- [X] T005 [US1] Paso 3: hora marcada sin saltar de paso; barra fija `BookingBar` (servicio, `formatTimeRange`, precio, "Continuar" → `datos=1`); hora no válida → aviso; espacio reservado al final de la página [frontend]
- [X] T006 [US1] Paso 4 solo con `datos=1` (o el atajo de "Lo más pronto"); barra fija con resumen y "Confirmar reserva" como botón de envío; "volver" quita `datos` [frontend]
- [X] T007 [P] [US2] Botón "Primera fecha con horas: <fecha>" sin `dia` elegido [frontend]
- [X] T008 [P] [US3] Punto cobre en las fechas `few`, con texto `sr-only` "quedan pocas horas" [frontend]
- [X] T009 [US4] Confirmación: "Añadir a mi calendario" (Blob), "Compartir por WhatsApp" y "Cómo llegar" si hay dirección; nada con honeypot [frontend]
- [X] T010 [frontend] DESIGN.md: barra fija y botones de la confirmación
- [X] T011 [frontend] E2E: actualizar booking, booking-calendar y cancellation; nuevos casos para la barra, la primera fecha, pocas horas y la confirmación (descarga del `.ics` y su contenido), con `axe`

## Fase 3: cierre (principal)

- [ ] T012 Verificación completa: lint, typecheck, test, test:integration, test:e2e y build
- [ ] T013 Revisión de los tres agentes (hito de reserva pública); consolidar en `Revisiones/` y corregir los Critical y High
- [ ] T014 Vault (Estado, Pendientes, Plan-de-ejecucion con las fases A, B y C, bitácora) y `CLAUDE.md` si cambia la estructura
- [ ] T015 Commit de cierre, fusión en `main` y push
