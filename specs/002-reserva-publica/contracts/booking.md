# Contrato: reserva pública

Entre el agente principal (lógica y servidor) y el agente `frontend` (páginas y tests E2E).

## Módulos del principal (`src/lib/booking/`)

| Módulo | Exporta | Uso |
|---|---|---|
| `availability.ts` | `computeAvailableSlots(input)`, constantes `STEP_MINUTES`, `MIN_LEAD_MINUTES`, `HORIZON_DAYS` | lógica pura |
| `queries.ts` (server-only) | Todas reciben `barbershop: PublicBarbershop` (de `getPublicBarbershop(subdomain)`; trae la zona horaria). `getBookingCatalog(barbershop)` → `{ services: { id, name, durationMinutes, price, priceLabel }[], barbers: { id, name }[] }` activos; `resolveSelection(barbershop, serviceId, barberId \| "pronto")` → `{ service, barbers }` o `null`; `getAvailableDays(barbershop, serviceId, barberId \| "pronto")` → `{ localDate, label }[]` o `null` si la selección no es válida; `getAvailableSlots(barbershop, serviceId, barberId \| "pronto", localDate)` → `(AvailableSlot & { barberName })[]` o `null` | páginas del flujo |
| `phone.ts` | `normalizePhone(raw)` → E.164 o `null` | formulario y servidor |
| `schemas.ts` | `bookingSchema` (Zod), `EARLIEST = "pronto"` | formulario y servidor |
| `book.ts` (server-only) | `bookAppointment(barbershop, input)` → `BookingResult` | lógica testeable |
| `actions.ts` ("use server") | `createBooking(subdomain, prev, formData)` → `BookingResult` | formulario del paso 4 |
| `booking-state.ts` | `type BookingResult` (`{ ok: true, summary \| null }` o `{ ok: false, code, message, fieldErrors? }`), `type BookingSummary`, `initialBookingState` (`null`) | cliente |

## Rutas del `frontend` (subdominio de la barbería)

| Ruta visible | Archivo | Contenido |
|---|---|---|
| `/` | `src/app/s/[subdomain]/page.tsx` | añadir botón "Reservar cita" → `/reservar` |
| `/reservar` | `src/app/s/[subdomain]/reservar/page.tsx` | según los parámetros: paso 1 (sin `servicio`), paso 2 (`servicio`), paso 3 (`servicio` + `barbero`, con `dia` opcional), paso 4 (+ `hora`) |
| `/privacidad` | `src/app/s/[subdomain]/privacidad/page.tsx` | política (plantilla) |

- Parámetros: `servicio` (uuid), `barbero` (uuid o `pronto`), `dia` (`YYYY-MM-DD` local), `hora` (ISO UTC). Un valor inválido o de otra barbería vuelve al paso correspondiente sin error técnico.
- `noindex` en `/reservar` (la página de la barbería y `/privacidad` sí se indexan).
- Pasos según `DESIGN.md`: barra de progreso, resumen de lo elegido arriba, chips de 44 px, "Lo más pronto" con icono de reloj, campo "Número de contacto".
- Paso 4: `<form method="post">` con `useActionState(createBooking.bind(null, subdomain))`; campos ocultos `service_id`, `barber_id`, `starts_at`; honeypot `website` oculto a la vista y al lector de pantalla (`aria-hidden`, `tabIndex={-1}`, `autoComplete="off"`); casilla `consent` enlazada a `/privacidad` (se abre en otra pestaña para no perder el progreso).
- Con `ok: true`: pantalla "Cita confirmada" con el `summary`. Con `code: "slot_taken"`: mensaje y enlace para elegir otra hora (conservando servicio y barbero). Con `fieldErrors`: errores por campo con `aria-describedby`.

## Mensajes

| Caso | Mensaje |
|---|---|
| Hueco tomado o ya no válido | "Ese horario ya no está disponible. Elige otra hora." |
| Tope | "No pudimos completar la reserva con este número. Si ya tienes citas pendientes, contacta con la barbería." (neutro, SEC-003) |
| Servicio o barbero inactivo | "Ese servicio o barbero ya no está disponible." |
| Sin consentimiento | "Debes autorizar el tratamiento de tus datos para reservar." |
| Barbería sin horarios | "Esta barbería aún no tiene horarios disponibles." |

## Cambios tras la revisión (2026-10-06)

- `queries.ts`: `getAvailableDays` y `getAvailableSlots` se sustituyen por `getAvailability(barbershop, serviceId, barberId | "pronto")` → `null` o `{ days: { localDate, label }[], slotsByDay: Map<localDate, DaySlot[]> }`, un solo cálculo por petición (PERF-002). `getBookingCatalog` devuelve además `bookable` (MAINT-001).
- `submit.ts` (server-only): `submitBooking(host, claimedSubdomain, formData, now?)` resuelve la barbería del **Host** y rechaza si no coincide con el subdominio del formulario (SEC-001). `actions.ts` solo lee el Host y llama a `submitBooking`.
- `booking-state.ts`: nuevo código `server_error` para fallos inesperados (MAINT-002).
- `messages.ts`: `MESSAGES` con los textos compartidos; el mensaje del tope es neutro (SEC-003).
- `src/lib/validation.ts`: `toFieldErrors(zodError)`, usado por cliente y servidor (MAINT-004).
- `src/lib/time.ts`: `toLocalDate` y `createZoneConverter` (MAINT-006, PERF-001).
