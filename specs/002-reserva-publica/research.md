# Investigación: reserva pública de citas

Decisiones técnicas de la fase 4. Datos de demostración comprobados el 2026-10-06: dos barberías con 2 barberos activos y 3 servicios (15–50 min), horario lunes a sábado en dos tramos (9:00–13:00 y 14:00–19:00), citas el 2026-10-13.

## 1. Dónde se calcula la disponibilidad

- **Decisión**: función pura de TypeScript `computeAvailableSlots` en `src/lib/booking/availability.ts`. Recibe tramos del horario, bloqueos, citas activas, duración del servicio, zona horaria, "ahora" y el rango de días, y devuelve las horas de inicio libres. Las conversiones de hora local a UTC las hace `src/lib/time.ts` (constitución IV: un único módulo).
- **Por qué**: es fácil de probar con tests unitarios sin base de datos, cubriendo bordes, cambio de día en UTC y servicios que no caben. La misma función sirve para mostrar horas y para volver a validar al confirmar (FR-008), así que la regla vive en un solo sitio.
- **Datos**: tres lecturas por petición, todas filtradas por la barbería del subdominio y con índice (fase 1): tramos de los barberos activos, bloqueos que se cruzan con la ventana (`barbershop_id, starts_at`) y citas activas de la ventana (`barbershop_id, starts_at`).
- **Volumen**: 30 días × 2 tramos × ~16 inicios por tramo × pocos barberos son unos miles de comprobaciones en memoria, muy por debajo de un milisegundo.
- **Alternativa descartada**: una función SQL (RPC) que calcule los huecos. Es una sola consulta, pero duplicaría la conversión de zona horaria fuera de `time.ts`, sería más difícil de probar y hoy no hace falta por rendimiento.

## 2. Regla de un hueco libre (FR-005, FR-006, FR-007)

Para cada día local entre hoy y hoy + 30, para cada tramo del barbero ese día de la semana (ISO), se prueban inicios cada 15 min desde el inicio del tramo. Un inicio `t` es válido si se cumple todo lo siguiente:
- `t + duración ≤ fin del tramo`;
- `t ≥ ahora + 1 h`;
- `t < hoy local + 30 días`;
- `[t, t + duración)` no se cruza con ningún bloqueo del barbero ni con ninguna cita activa del barbero.

Los intervalos son semiabiertos `[inicio, fin)`, igual que la restricción de la base de datos: una cita puede empezar justo cuando termina otra.

## 3. "Lo más pronto" (FR-004)

- Para mostrar horas: unión de los inicios libres de todos los barberos activos; cada hora lleva el barbero que se asignaría.
- **Regla de asignación**: entre los barberos libres a esa hora, el que tenga menos citas activas ese día local; a igualdad, por nombre.
- Al confirmar se recalcula. Si el barbero mostrado ya no está libre pero otro sí, se reserva con el otro y la confirmación muestra el barbero real. Si nadie está libre, se responde "Ese horario ya no está disponible".

## 4. Escritura de la cita (FR-008 a FR-014)

Server action `createBooking`, con la clave secreta y siempre con el `barbershop_id` resuelto del subdominio (`getPublicBarbershop`), nunca uno enviado por el cliente. Orden:
1. **Honeypot** relleno → respuesta de éxito falsa sin escribir nada (no dar pistas al bot).
2. **Validación** con Zod: servicio, barbero o "pronto", inicio en ISO UTC, nombre, número de contacto, correo y consentimiento.
3. Leer el servicio activo y los barberos activos **de esa barbería** (un id de otra barbería devuelve "no encontrado").
4. Volver a calcular la disponibilidad del día con datos actuales y comprobar el inicio pedido; con "pronto", asignar barbero según §3.
5. **Tope**: contar las citas activas futuras de ese número en la barbería; si hay 2 o más, rechazar.
6. Insertar la cita copiando duración y precio, con `data_consent_at = now()`.
7. Errores: `23P01` → "Ese horario ya no está disponible"; `40P01` → reintentar una vez desde el paso 4 y, si vuelve a fallar, el mismo mensaje.

**Límite conocido**: el tope no es atómico. Dos reservas simultáneas del mismo número podrían dejar 3 citas. Se acepta porque es antiabuso blando; no se usa un bloqueo o trigger por esto (constitución VII).

## 5. Número de contacto

- Normalización sin dependencias: se quitan espacios, guiones, puntos y paréntesis. Si empieza por `+` se deja; si son 10 dígitos que empiezan por `3` (celular colombiano), se antepone `+57`; si empieza por `57` y tiene 12 dígitos, se antepone `+`. Después se valida con la regla E.164 de la base de datos.
- **Alternativa descartada**: `libphonenumber-js`. Valida mejor números internacionales, pero añade una dependencia para un MVP centrado en Colombia. Va al Roadmap si llegan barberías de otros países.

## 6. Estado del flujo entre pasos (FR-002)

- **Decisión**: cada paso es una página del servidor en `/reservar` que lee lo elegido de la URL (`?servicio=…&barbero=…&dia=…&hora=…`). Elegir es seguir un enlace. Volver atrás (botón del navegador o "Atrás") conserva lo elegido.
- Solo el paso 4 (datos) es un formulario de cliente con `useActionState`. Al terminar, la confirmación se muestra con el resumen que devuelve la acción. No hay una ruta pública "ver cita por id": eso expondría datos personales a quien adivine o reciba un id (el enlace seguro con token es la fase 5).
- **Alternativa descartada**: una librería de estado o un asistente en el cliente. Es más JavaScript y se pierde el estado al recargar.

## 7. Política de tratamiento de datos (FR-015)

- Página `/privacidad` en el subdominio. Nombra a la barbería como responsable del tratamiento y a la plataforma como encargada. Indica la finalidad (gestionar la cita y avisos sobre ella), los derechos (conocer, actualizar, rectificar, suprimir, revocar), el canal (correo de la plataforma) y la vigencia.
- Es una **plantilla** marcada como "pendiente de revisión legal" en un comentario y en `Pendientes.md` del vault. No sustituye asesoría jurídica.

## 8. Tests

- **Unitarios (Vitest)**: `computeAvailableSlots` (bordes de tramo, servicio que no cabe, bloqueos, citas contiguas y solapadas, antelación, horizonte, cambio de día UTC, varios barberos y asignación de "pronto"), normalización del número y esquema de la reserva.
- **Integración (Vitest + Supabase local)**: `bookAppointment` rechaza fuera de horario, en bloqueo, en el pasado, servicio o barbero inactivo o de otra barbería, sin consentimiento y por tope; asigna "pronto"; dos reservas simultáneas dan exactamente una cita y la otra recibe el mensaje claro (incluido el reintento ante `40P01`). Cada test borra lo que crea.
- **E2E (Playwright + `@axe-core/playwright`)**: reserva completa en vista móvil (375 px) contra `labarberia.localhost` y escaneo `axe` de los pasos y la confirmación. El test borra la cita creada. Requiere instalar `@playwright/test` y `@axe-core/playwright` (ADR-012) y descargar Chromium para Playwright (unos 150 MB).

## 9. Sin cambios de esquema

Las tablas, índices y restricciones de la fase 1 bastan. El índice de bloqueos `(barbershop_id, starts_at)` cubre la consulta por ventana; el de PERF-002 se descarta mientras los bloqueos sean pocos. No hay tareas para el agente `database` en esta fase.

## 10. Ajustes tras la revisión de los tres agentes (2026-10-06)

Informe en `Revisiones/2026-10-06-fase-4-reserva-publica.md` del vault. Aprobados por el usuario:

- **SEC-001 (crítico): la barbería de la reserva sale del Host de la petición.** El formulario llama a la server action con el subdominio como argumento, y ese argumento lo controla el navegador. `submitBooking` resuelve la barbería con `resolveTenant(host)` y rechaza el envío si el subdominio del formulario no coincide. **Patrón obligatorio para la fase 5** (cancelación con token) y para cualquier acción pública futura.
- **PERF-001 (alto): cálculo de huecos de ~125–225 ms a ~2–3 ms** (medido):
  - formateadores `Intl` reutilizados;
  - conversor de zona con desfase constante si la ventana no cruza un cambio de horario (`createZoneConverter`, exacto si lo cruza);
  - etiquetas por hora local;
  - rangos ocupados filtrados por día y en milisegundos;
  - orden de nombres precalculado.

  Test de rendimiento en `availability.test.ts`. El objetivo "< 1 ms" del plan queda en ~2–3 ms, aceptado.
- **PERF-002**: `getAvailability` hace un solo cálculo de 30 días por petición (días + horas por día).
- **PERF-003**: la consulta de citas se acota con `starts_at >= ventana − 480 min` (duración máxima por `check`), así el índice `(barbershop_id, starts_at)` recorre solo la ventana en vez de todo el histórico. Se descarta la RPC con `tstzrange` por no duplicar la lógica fuera de TypeScript.
- **PERF-005**: con "Lo más pronto", un `23P01` también se reintenta (puede quedar otro barbero libre).
- **PERF-006**: el conteo del tope corre en paralelo con el cálculo de horas.
- **SEC-002 / MAINT-002**: los logs registran solo `code` y `message` (nunca `details`, que puede llevar datos personales); los errores inesperados devuelven `server_error`.
- **SEC-003**: el mensaje del tope es neutro y no revela cuántas citas tiene un número.
- **SEC-004**: el nombre rechaza caracteres de control y de formato.
- **MAINT-001**: `getBookingCatalog().bookable` es la única regla de "se puede reservar" (servicios activos y algún barbero activo con horario).
- **MAINT-004 / MAINT-006 / MAINT-009**: `toFieldErrors`, `toLocalDate` y `MESSAGES` en un solo sitio.
- **Punto ciego que se mantiene**: el reintento ante `40P01` no tiene test; provocar un bloqueo mutuo de forma determinista es complejo. Los tests de simultaneidad pasan de forma estable.
