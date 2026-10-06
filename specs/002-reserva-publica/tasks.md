---
description: "Tareas de la fase 4: reserva pública de citas"
---

# Tareas: reserva pública de citas

**Entrada**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/booking.md](contracts/booking.md)

**Tests**: obligatorios (spec FR-018, constitución III y V).

**Formato**: `[ID] [P?] [Historia] Descripción [responsable]`. `[P]` = paralelizable con otras `[P]` (archivos distintos, sin dependencias entre sí).

## Fase 1: preparación

- [x] T001 Instalar `@playwright/test` y `@axe-core/playwright` como dependencias de desarrollo, descargar Chromium (`npx playwright install chromium`), crear `playwright.config.ts` (baseURL `http://labarberia.localhost:3000`, `webServer: npm run dev`, solo Chromium) y el script `test:e2e` [frontend]

## Fase 2: base (bloquea las páginas)

- [x] T002 `src/lib/booking/availability.ts`: `computeAvailableSlots` según research §2–§3 (pura; usa `src/lib/time.ts`), con `availability.test.ts`: bordes de tramo, servicio que no cabe, bloqueos, citas contiguas y solapadas, antelación de 1 h, horizonte de 30 días, día local frente a día UTC, varios barberos y regla de reparto de "pronto" [principal]
- [x] T003 [P] `src/lib/booking/phone.ts`: `normalizePhone` (research §5) con `phone.test.ts` [principal]
- [x] T004 [P] `src/lib/booking/schemas.ts`: `bookingSchema` (data-model) con `schemas.test.ts`; `booking-state.ts` [principal]
- [x] T005 `src/lib/booking/queries.ts`: `getBookingCatalog`, `getAvailableDays` y `getAvailableSlots`, filtrando por barbería con la clave secreta [principal]

## Fase 3: historias 1, 2 y 3 — reservar, "Lo más pronto" y validación en el servidor (P1)

- [x] T006 [US1][US2][US3] `src/lib/booking/book.ts`: `bookAppointment` (research §4: catálogo de la barbería, revalidación, asignación de "pronto", copia de duración y precio, `23P01` y reintento ante `40P01`) y `actions.ts` con `createBooking` [principal]
- [x] T007 [US3] `tests/integration/booking.test.ts`: fuera de horario, en bloqueo, en el pasado, fuera del horizonte, servicio o barbero inactivo o de otra barbería → rechazo; "pronto" asigna al barbero libre; dos reservas simultáneas → exactamente una cita y un mensaje claro [principal]
- [x] T008 [P] [US1][US2] `src/app/s/[subdomain]/reservar/page.tsx` y `src/components/booking/`: pasos 1–3 en la URL, "Lo más pronto", días y horas disponibles, resumen, barra de progreso y `noindex` [frontend]
- [x] T009 [P] [US1] Paso 4 y confirmación: formulario con `createBooking`, errores por campo, `slot_taken` con vuelta al paso 3 y pantalla "Cita confirmada" [frontend]
- [x] T010 [P] [US1] Botón "Reservar cita" en `src/app/s/[subdomain]/page.tsx` y estado "sin horarios disponibles" [frontend]

## Fase 4: historia 4 — protección contra abuso (P2)

- [x] T011 [US4] Honeypot y tope de 2 citas en `book.ts`, con casos en `tests/integration/booking.test.ts` (incluido que el tope no cruza barberías) [principal]
- [x] T012 [P] [US4] Campo honeypot en el formulario del paso 4 (oculto a la vista y al lector de pantalla) [frontend]

## Fase 5: historia 5 — consentimiento y política (P1)

- [x] T013 [P] [US5] `src/app/s/[subdomain]/privacidad/page.tsx`: plantilla de política (research §7), con aviso de revisión legal en un comentario [frontend]
- [x] T014 [US5] Casilla de consentimiento obligatoria enlazada a `/privacidad` (nueva pestaña) [frontend]; `data_consent_at` comprobado en el test de integración [principal: hecho]

## Fase 6: E2E y cierre

- [x] T015 `tests/e2e/booking.spec.ts`: reserva completa en móvil (375 px) y escaneo `axe` de cada paso y de la confirmación; borra la cita creada [frontend]
- [x] T016 Integración: lint, typecheck, test, test:db, test:integration, test:e2e y build en verde; prueba manual en el navegador (incluidas dos pestañas sobre el mismo hueco) [principal]
- [x] T017 Revisión de los tres agentes revisores, correcciones e informe en `Revisiones/` del vault [principal]
- [x] T018 Vault (estado, pendientes con la revisión legal de la política, plan, bitácora), explicación breve al usuario, fusión en `main` y commit [principal]

## Dependencias

- T002, T003 y T004 → T005 → T006 → T007 y T011.
- El contrato (firmas de T005 y T006) se publica antes de lanzar al `frontend`; T008, T009, T010, T012 y T013 corren en paralelo con T006, T007 y T011.
- T001 → T015.
- Todo → T016 → T017 → T018.

## Corrección posterior: tope por número atómico (2026-10-06)

**Motivo**: el tope de 2 citas activas por número (FR-013) se comprueba en `book.ts` contando y después insertando, en dos pasos. N reservas simultáneas del mismo número con horas distintas pasan todas el conteo (ven 0 citas) y se guardan todas. Un script puede llenar la agenda con un solo número. Sin Turnstile ni rate limiting (Roadmap), el tope es la única defensa del MVP. Se revisa research §4 ("límite conocido") por decisión del usuario.

**Solución**: un trigger `BEFORE INSERT` en `appointments`. Se pone en fila por (barbería, número) con un candado de transacción, cuenta las citas activas futuras y rechaza la tercera. El conteo de `book.ts` se mantiene: da el mensaje rápido en el caso normal, y el trigger garantiza la regla con concurrencia (constitución III).

**Rama**: `main` (corrección pequeña, sin spec nueva). Commit `fix:`. Sin revisión de los tres agentes: entra en la revisión del hito de la fase 5.

- [ ] T019 [database] Migración nueva `npx supabase migration new appointments_phone_limit` (no editar migraciones aplicadas):
  - Función `private.appointments_enforce_phone_limit()`, `language plpgsql`, `set search_path = ''`. Debe ser **VOLATILE**, el valor por defecto: así el `select count` toma una instantánea nueva después del candado y ve las citas que la otra transacción acaba de confirmar. No marcarla `stable`.
  - Lógica: si `new.status = 'active' and new.starts_at > now()`:
    1. `perform pg_advisory_xact_lock(hashtextextended(new.barbershop_id::text || ':' || new.customer_phone, 0));`
    2. Contar en `public.appointments` las filas con el mismo `barbershop_id` y `customer_phone`, `status = 'active'` y `starts_at > now()`.
    3. Si el conteo es `>= 2`, lanzar `raise exception 'tope de citas activas por número (appointments_phone_limit)' using errcode = 'check_violation', constraint = 'appointments_phone_limit';`.
  - `return new;`.
  - `revoke execute ... from public, anon;`, igual que `appointments_prevent_reactivation` en `20261004155222_appointments.sql`.
  - Trigger `appointments_phone_limit`: `before insert on public.appointments for each row`.
  - Comentario en la migración: el 2 debe coincidir con `MAX_ACTIVE_PER_PHONE` en `src/lib/booking/book.ts`; motivo (concurrencia, research §4 revisado); el candado se libera al terminar la transacción.
- [ ] T020 [database] pgTAP `supabase/tests/05_phone_limit.test.sql` (`begin; … rollback;`, estilo de `04_constraints.test.sql`, comprobando código y mensaje):
  - (a) 2 citas activas futuras del mismo número → la 3.ª falla con `23514` y el mensaje exacto;
  - (b) las canceladas no cuentan;
  - (c) las pasadas no cuentan: insertar con `starts_at` en el pasado;
  - (d) el mismo número en otra barbería no cuenta;
  - (e) otro número en la misma barbería no cuenta;
  - (f) insertar una cita ya cancelada no se ve limitada.

  **Revisar los tests existentes** (`01`–`04`): si insertan 3 o más citas activas futuras con el mismo número en la misma barbería, variar el número. Un cambio de test no es editar una migración. Ejecutar `npm run db:reset`, comprobar que el seed carga, y `npm run test:db` en verde. Luego `npm run db:types`.
- [ ] T021 [principal] `src/lib/booking/book.ts`, función `fromDatabase`: si `error.code === "23514"` y `error.message` contiene `appointments_phone_limit` → `{ result: LIMIT_REACHED }`. Comentario junto a `MAX_ACTIVE_PER_PHONE`: "el trigger appointments_phone_limit aplica el mismo tope en la base de datos; cambiar ambos a la vez". Actualizar research §4 ("Límite conocido" → "Tope atómico por trigger, 2026-10-06") y la tabla "Seguimiento de complejidad" de `plan.md`.
- [ ] T022 [principal] `tests/integration/booking.test.ts`, test nuevo: 5 `bookAppointment` simultáneos (`Promise.all`) con el mismo número y 5 horas libres distintas de un día propio. Ningún otro test debe usar ese día: elegir uno libre, p. ej. `2030-01-16` (miércoles; el 15 ya lo usan los tests de submitBooking), y repartir entre Andrés y Camilo de 9:00 a 11:00. Comprobar:
  - exactamente 2 `ok`;
  - 3 con `code: "limit_reached"`, nunca `server_error`;
  - 2 filas activas con ese número en la base.

  Después `npm run lint`, `typecheck`, `test`, `test:db`, `test:integration`, `test:e2e`, y commit `fix: tope de citas por número atómico en la base de datos` en `main`.
