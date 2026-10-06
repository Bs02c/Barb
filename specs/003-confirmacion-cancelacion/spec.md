# Spec: confirmación por correo y cancelación con enlace

**Rama**: `003-confirmacion-cancelacion` | **Fecha**: 2026-10-06 | **Estado**: borrador, pendiente de aprobación del usuario

**Entrada**: fase 5 del plan de ejecución. Requisito obligatorio de la revisión de la fase 4 (SEC-001): toda server action pública resuelve la barbería con el Host de la petición.

## Historias de usuario

### Historia 1 - Correo de confirmación (Prioridad: P1)

El cliente reserva una cita y recibe, en el correo que escribió, un mensaje "Cita confirmada en [barbería]". El mensaje incluye servicio, barbero, fecha y hora en la zona de la barbería, duración, precio y un botón "Cancelar cita".

**Por qué esta prioridad**: es la prueba que tiene el cliente de su reserva y la única forma de cancelar sin llamar.

**Prueba independiente**: reservar y comprobar que llega un correo con los datos de la cita y un enlace de cancelación.

**Escenarios**:
1. **Dado** una reserva confirmada, **cuando** termina, **entonces** se envía un correo al cliente con los datos de la cita y el enlace.
2. **Dado** que el envío del correo falla, **cuando** termina la reserva, **entonces** la cita sigue confirmada, el cliente ve "Cita confirmada" y el fallo queda en el log sin datos personales ni token.
3. **Dado** el honeypot relleno, **cuando** se envía, **entonces** no se envía correo.
4. **Dado** que la pantalla de confirmación ya respondió, **cuando** se envía el correo, **entonces** el envío no retrasa la respuesta al cliente.

### Historia 2 - Cancelar desde el enlace (Prioridad: P1)

El cliente abre el enlace del correo. Ve su cita (servicio, barbero, fecha y hora) y un botón "Cancelar cita". Al pulsarlo, la cita queda cancelada y el horario vuelve a estar libre para otros clientes.

**Por qué esta prioridad**: libera horas que si no se perderían, y es requisito del MVP (ADR-010).

**Prueba independiente**: con el enlace de una cita activa, cancelarla y comprobar que la hora vuelve a aparecer en `/reservar`.

**Escenarios**:
1. **Dado** una cita activa futura, **cuando** abre el enlace, **entonces** ve los datos y el botón; **la cita NO se cancela solo por abrir el enlace**. Los antivirus de correo abren los enlaces automáticamente.
2. **Dado** que pulsa "Cancelar cita", **entonces** ve "Tu cita fue cancelada" y un enlace "Reservar otra cita"; la hora vuelve a estar libre.
3. **Dado** una cita ya cancelada (por el cliente o por el admin), **cuando** abre el enlace o pulsa el botón otra vez, **entonces** ve "Esta cita ya está cancelada". No hay error ni doble cancelación.
4. **Dado** una cita cuya hora de inicio ya pasó, **cuando** abre el enlace, **entonces** ve "Esta cita ya pasó y no se puede cancelar", sin botón.
5. **Dado** un token inexistente, mal formado o de otra barbería (otro subdominio), **cuando** abre el enlace, **entonces** ve "Este enlace no es válido", sin revelar si existe la cita.
6. **Dado** dos pulsaciones simultáneas del botón, **entonces** la cita se cancela una vez y ambas respuestas son claras.

### Casos límite

- **Admin cancela antes que el cliente**: el enlace muestra "ya está cancelada" (escenario 2.3).
- **Barbero o servicio desactivado después de reservar**: la cancelación sigue funcionando. La página muestra los datos guardados en la cita, no el catálogo actual.
- **Cita creada sin token** (seed o creada antes de esta fase): no tiene enlace. Nada que hacer.
- **Correo a un tercero**: alguien reserva con el correo de otra persona, que recibe la confirmación. Riesgo conocido de la revisión de la fase 4; el destinatario puede cancelar con el enlace. Turnstile y rate limiting están en el Roadmap como obligatorios antes del primer cliente.

## Requisitos

### Funcionales

- **FR-001**: Al confirmar una reserva, el sistema DEBE enviar un correo al cliente con:
  - nombre de la barbería, servicio, barbero, fecha y hora local, duración y precio;
  - el enlace de cancelación.
- **FR-002**: El envío DEBE ocurrir después de responder al cliente. Un fallo de envío NO deshace la cita y se registra solo con código y mensaje del error.
- **FR-003**: Cada cita reservada desde la web DEBE tener un token de cancelación:
  - aleatorio de 256 bits;
  - en la base solo se guarda su hash SHA-256;
  - el token en claro solo existe en el correo.
- **FR-004**: El enlace DEBE ser `https://<subdominio>.<dominio raíz>/cancelar/<token>`, con `http` en local. Se construye con el subdominio de la barbería y `NEXT_PUBLIC_ROOT_DOMAIN`, nunca con el Host de la petición.
- **FR-005**: Abrir el enlace (GET) NO DEBE modificar nada; solo el botón (POST, server action) cancela.
- **FR-006**: El token DEBE validarse en el servidor:
  - con Zod (formato);
  - contra la barbería resuelta del **Host** de la petición (constitución I, SEC-001).

  Un token de otra barbería se trata como inválido.
- **FR-007**: El token caduca a la hora de inicio de la cita y deja de funcionar una vez usado: la cita queda cancelada y una cancelada no se reactiva (constitución V).
- **FR-008**: La cancelación DEBE ser una sola sentencia atómica:
  - **condiciones**: barbería, hash, estado activo e inicio futuro;
  - **cambios**: `status = 'cancelled'` y `cancelled_at = now()`.

  Dos pulsaciones simultáneas cancelan una sola vez.
- **FR-009**: Plazo para cancelar: **hasta la hora de inicio de la cita**. *Decisión por defecto, a confirmar por el usuario.*
- **FR-010**: La página de cancelación DEBE tener `noindex` y `Referrer-Policy: no-referrer`, para que el token no salga hacia otros sitios. Tampoco muestra teléfono ni correo del cliente.
- **FR-011**: Los logs NO DEBEN contener el token, el correo, el nombre ni el teléfono del cliente (constitución VI).
- **FR-012**: En desarrollo y en los tests, el correo NO se envía por internet: se escribe en una carpeta local ignorada por git (`.outbox/`). En producción, sin configuración de envío, la app DEBE fallar al enviar (error en el log), nunca escribir a disco.
- **FR-013**: Textos en español de Colombia, mobile-first, accesibles (axe sin violaciones), según `DESIGN.md`.

### Entidades

- **Cita** (`appointments`): nueva columna `cancel_token_hash` (hash SHA-256 del token, 32 bytes, única, opcional).

## Criterios de éxito

- **SC-001**: Al reservar en local se genera un correo en `.outbox/` con los datos correctos y un enlace que funciona.
- **SC-002**: El enlace cancela una vez y la hora vuelve a ofrecerse en `/reservar` (E2E).
- **SC-003**: Abrir el enlace sin pulsar el botón no cambia la cita (E2E e integración).
- **SC-004**: Ningún token en claro en la base, en los logs ni en la respuesta de `createBooking` al navegador (integración y revisión).
- **SC-005**: Revisión de los tres agentes sin hallazgos de severidad alta abiertos.

## Fuera de alcance

- Reagendar (Roadmap, obligatorio antes del primer cliente).
- Correo al admin por reserva o cancelación.
- Correo al cliente cuando cancela el admin.
- Recordatorios (versión 1.1).
- Colas con reintentos (Roadmap).
- WhatsApp.
- Mostrar el enlace de cancelación en la pantalla de confirmación.
- Plazo de cancelación configurable por barbería.

## Supuestos

- En la fase 5 el envío real usa la cuenta de Resend del usuario con el remitente de pruebas (`onboarding@resend.dev`). Resend solo entrega al correo del dueño de la cuenta hasta verificar un dominio, lo que ocurre en la fase 7.
- La API key va en `.env.local` y la pone el usuario; nunca pasa por el chat.
