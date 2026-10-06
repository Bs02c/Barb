---
description: "Tareas de la fase 5: confirmación por correo y cancelación con enlace"
---

# Tareas: confirmación y cancelación

**Entrada**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/cancellation.md](contracts/cancellation.md)

**Requisitos previos**:
- spec aprobada por el usuario;
- corrección del tope atómico (spec 002, T019–T022) fusionada en `main`.

**Tests**: obligatorios (constitución III y V).

**Formato**: `[ID] [P?] [Historia] Descripción [responsable]`. `[P]` = paralelizable.

**Reglas para todo agente**:
- Leer `AGENTS.md` (Next.js 16: consultar `node_modules/next/dist/docs/` antes de usar `after`, Metadata o server actions).
- No registrar en logs tokens ni datos del cliente.
- No editar migraciones aplicadas.
- Nombres de código en inglés; textos y comentarios en español.
- Terminar con `npm run lint` y `npm run typecheck` en verde y un reporte breve: qué hizo, qué no, qué falló.

## Fase 1: preparación

- [x] T001 [principal] Crear la rama `git switch -c 003-confirmacion-cancelacion` desde `main` y hacer commit de `specs/003-confirmacion-cancelacion/` (`docs:`).
  - Añadir `/.outbox/` a `.gitignore`.
  - En `.env.example`: `EMAIL_TRANSPORT=` (comentario: `outbox` en desarrollo, `resend` en producción) y `EMAIL_FROM=` (comentario: `Reservas <onboarding@resend.dev>` en pruebas).
  - Crear `Decisiones/ADR-015-envio-de-correo.md` en el vault con la decisión de research §4–§5:
    - `after()` sin cola;
    - `fetch` a Resend sin SDK;
    - plantilla sin React Email;
    - transporte `outbox` en desarrollo.

## Fase 2: base de datos

- [x] T002 [database] Migración `npx supabase migration new appointments_cancel_token` con el SQL exacto de [data-model.md](data-model.md), el comentario de la columna y la nota de permisos. Luego `npm run db:reset` y `npm run db:types`.
- [x] T003 [database] pgTAP `supabase/tests/06_cancel_token.test.sql` (`begin; … rollback;`, estilo de `04_constraints.test.sql`):
  - (a) acepta un hash de 32 bytes y null;
  - (b) rechaza 31 o 33 bytes (`23514`, `appointments_cancel_token_hash_length`);
  - (c) rechaza un hash duplicado (`23505`);
  - (d) un admin autenticado de la barbería **no** puede hacer `update` de `cancel_token_hash`: error de permiso `42501`. Usar el patrón de sesión de `01_isolation.test.sql`.

  Después `npm run test:db` en verde.

## Fase 3: lógica de servidor (principal)

- [x] T004 Contrato: crear los archivos de `src/lib/cancellation/`, `schemas.ts`, `cancellation-state.ts` y `messages.ts`, con las firmas y tipos exactos de [contracts/cancellation.md](contracts/cancellation.md). **Esto desbloquea al frontend.**
- [x] T005 [P] `src/lib/cancellation/token.ts` según research §1 y §6, con `token.test.ts`:
  - el token mide 43 caracteres y cumple `cancelTokenSchema`;
  - dos tokens seguidos son distintos;
  - `hashToken` devuelve `\x` + 64 hex y es determinista;
  - `cancelUrl` da `http://labarberia.localhost:3000/cancelar/<t>` con `ROOT_DOMAIN=localhost:3000` y `https://x.midominio.com/cancelar/<t>` con `midominio.com`.

  Para el segundo caso, pasar el dominio como parámetro opcional `rootDomain = ROOT_DOMAIN` y así no depender del entorno.
- [x] T006 [P] `src/lib/email/escape.ts` + `escape.test.ts` (`& < > " '`). `src/lib/email/confirmation.ts`:
  - `confirmationEmail` produce:
    - asunto `Cita confirmada en <barbería>`;
    - un HTML con estilos en línea, todos los valores pasados por `escapeHtml` y un botón-enlace "Cancelar cita" a `cancelUrl`;
    - un texto plano equivalente.
  - `sendConfirmation` llama a `sendEmail` y captura cualquier error con `console.error("Error al enviar la confirmación", { code, message })`, sin `to` ni URL.
  - Test `confirmation.test.ts`: un nombre de barbería `<b>"X"</b>` aparece escapado en el HTML; el texto incluye fecha, hora y enlace.
- [x] T007 [P] `src/lib/email/send.ts` según research §5:
  - `outbox`: `mkdir -p .outbox` y escritura de JSON con `node:fs/promises`; lanza error si `NODE_ENV === "production"`.
  - `resend`: `fetch` a `https://api.resend.com/emails`; error sin el cuerpo completo si la respuesta no es 2xx; error si falta `RESEND_API_KEY` o `EMAIL_FROM`.
  - Sin test de red. Test unitario solo del `outbox`: escribe un archivo con los campos. Usar un directorio temporal con un parámetro opcional `outboxDir`.
- [x] T008 [US1] Reserva con token:
  - `book.ts`: `generateCancelToken()` antes del insert; `cancel_token_hash: hashToken(token)` en el insert; devolver `BookingOutcome` (contrato) con `confirmation` (`to` = correo del cliente, `barbershopName`, `summary`, `cancelUrl(barbershop.subdomain, token)`). En reintentos (40P01/23P01) generar un token nuevo en cada intento.
  - `submit.ts`: devuelve `BookingOutcome`.
  - `actions.ts`: `after(() => sendConfirmation(...))` y devolver solo `outcome.result`.
  - Ajustar `tests/integration/booking.test.ts` a la nueva forma de retorno, usando `.result` donde haga falta.
  - Casos nuevos:
    - la cita creada tiene `cancel_token_hash` igual a `hashToken` del token de `confirmation.cancelUrl`;
    - el `result` no contiene el token (`JSON.stringify(result)` sin él);
    - el honeypot no devuelve `confirmation`.
- [x] T009 [US2] `queries.ts` (`getCancellation`) y `cancel.ts` (`submitCancellation`) según research §3 y §7.
  - Lectura: `appointments` con `starts_at, service_duration_minutes, service_price, status, services(name), barbers(name)` filtrando por `barbershop_id` y `cancel_token_hash`. Verificar en `src/lib/booking/queries.ts` cómo se hacen los joins por FK compuesta, o leer servicio y barbero por id dentro de la barbería.
  - Errores inesperados: `server_error` y log `{ code, message }`.
  - `actions.ts` con `cancelAppointment` (lee `headers().get("host")`).
- [x] T010 [US2] `tests/integration/cancellation.test.ts`, con barbería propia creada y borrada en el test, como `booking.test.ts`. Reservar con `bookAppointment`, extraer el token de `confirmation.cancelUrl` y probar:
  - (a) `getCancellation` → `active` con datos; tras leer, la cita sigue activa (SC-003);
  - (b) `submitCancellation` → `ok`; la fila queda `cancelled` con `cancelled_at`; un nuevo `bookAppointment` a la misma hora y barbero → `ok` (hora liberada);
  - (c) segunda cancelación → `already_cancelled`;
  - (d) dos `submitCancellation` simultáneos sobre otra cita → exactamente un `ok` y un `already_cancelled`;
  - (e) `now` posterior al inicio → `past` en lectura y cancelación;
  - (f) token mal formado, token válido inexistente y token de una cita de **otra barbería** con el host de la primera → `invalid`;
  - (g) host distinto del subdominio reclamado → `invalid` sin cancelar (SEC-001).

  Después `npm test` y `npm run test:integration` en verde.

## Fase 4: interfaz (frontend, en paralelo desde T004)

- [x] T011 [P] [US2] Página `src/app/s/[subdomain]/cancelar/[token]/page.tsx` y `src/components/cancellation/cancel-form.tsx` según la tabla del contrato:
  - `generateMetadata` con `noindex` y `referrer: "no-referrer"`;
  - estilo de `src/app/s/[subdomain]/reservar/` y `DESIGN.md`;
  - reutilizar `BookingSummary` y `EmptyState` de `src/components/booking/step-layout.tsx`;
  - botón destructivo con estado de envío (`useActionState`, `pending`) y `<form method="post">`;
  - mobile-first y axe sin violaciones.

  Hasta que exista T009, la página puede compilar contra las firmas del contrato.
- [x] T012 [US1][US2] `tests/e2e/cancellation.spec.ts` (375 px), con el mismo encabezado de seguridad que `booking.spec.ts` (solo local, `.env.local`):
  1. reservar con «Lo más pronto» y un correo único;
  2. leer el JSON de `.outbox/` cuyo `to` es ese correo; esperar hasta 10 s, porque se escribe tras la respuesta;
  3. extraer el enlace del `text`;
  4. abrir el enlace: ver "Cancelar cita" y escaneo axe; recargar y comprobar que sigue activa;
  5. pulsar el botón: ver "Tu cita fue cancelada" y escaneo axe;
  6. volver a abrir el enlace: "ya está cancelada";
  7. abrir `/cancelar/` + 43 `a`: "no es válido".

  En `afterAll`, borrar la cita por correo y los archivos de `.outbox/` de ese correo. Añadir a `playwright.config.ts` `webServer.env: { EMAIL_TRANSPORT: "outbox" }`.

## Fase 5: integración y cierre (principal)

- [x] T013 Integración: `lint`, `typecheck`, `test`, `test:db`, `test:integration`, `test:e2e` y `build` en verde. Prueba manual:
  - reservar en `labarberia.localhost:3000`;
  - abrir el JSON de `.outbox/` y el enlace;
  - cancelar;
  - ver la hora libre otra vez en `/reservar`.
- [ ] T014 Prueba con Resend real (requiere que el usuario ponga `EMAIL_TRANSPORT=resend`, `RESEND_API_KEY` y `EMAIL_FROM` en `.env.local`): reservar con el correo del dueño de la cuenta y comprobar que llega y que el enlace funciona. Si el usuario aún no tiene la key, dejarlo pendiente y anotarlo en el vault.
- [x] T015 Revisión de los tres agentes revisores sobre el diff de la rama:
  - `security-reviewer` con el modelo por defecto; los otros dos con `model: sonnet`;
  - correcciones;
  - informe consolidado en `Revisiones/` del vault.
- [ ] T016 Vault (Estado actual, Pendientes, Plan, Bitácora, ADR-015), explicación breve al usuario, fusión en `main` y commit `feat: fase 5, confirmación por correo y cancelación con enlace`.

## Dependencias

- T001 → T002 → T003.
- T002 → T008 y T009, que necesitan la columna y los tipos.
- T004 → T005, T006 y T007 [P] → T008 → T009 → T010.
- T004 → T011 y T012 (frontend, en paralelo con T005–T010); T012 necesita T008, T009 y T011 para pasar.
- Todo → T013 → T014 → T015 → T016.
