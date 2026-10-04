# Constitución del SaaS de reservas para barberías

## Principios fundamentales

### I. Aislamiento por barbería en la base de datos (NO NEGOCIABLE)
- Toda tabla con datos de una barbería DEBE tener `barbershop_id` y RLS activado, con políticas
  para cada operación (SELECT, INSERT, UPDATE, DELETE), creadas en la misma migración que la tabla.
- La barbería de una petición DEBE resolverse en el servidor a partir del subdominio. Nunca se
  acepta un `barbershop_id` enviado por el cliente.
- Todo código que use la service role key (que se salta RLS) DEBE filtrar explícitamente por el
  `barbershop_id` resuelto en el servidor.
- Toda tabla o política nueva DEBE tener un test que demuestre que un usuario de otra barbería no
  puede leerla ni modificarla.

Razón: un fallo de aislamiento expone datos de una barbería a otra; es el peor error posible del
producto. (ADR-001, ADR-002, ADR-004)

### II. Secretos solo en el servidor
- La service role key y cualquier API key (Resend, Cloudflare) NUNCA llegan al navegador: ni en
  variables `NEXT_PUBLIC_`, ni en módulos importados por componentes de cliente.
- La web pública no usa sesión: toda reserva o cancelación pasa por server actions o route
  handlers.

Razón: la service role key da acceso total a todas las barberías. (ADR-003)

### III. La base de datos es la última barrera de integridad
- Toda regla de negocio que pueda expresarse como restricción de Postgres (no solapar citas de un
  mismo barbero, claves foráneas, valores válidos) DEBE existir como restricción, además de la
  validación en la aplicación.
- La validación en la aplicación sirve para dar buenos mensajes; la restricción garantiza la
  corrección. El código DEBE capturar la violación de la restricción y responder con un error claro.
- Las citas canceladas NO bloquean el horario.

Razón: dos reservas simultáneas pueden pasar ambas la validación del servidor. (ADR-006)

### IV. Tiempo en UTC, conversión solo en los bordes
- Las fechas y horas se guardan en UTC. Cada barbería tiene su zona horaria configurada.
- La conversión a hora local ocurre solo al mostrar o al recibir datos, y DEBE hacerse en un único
  módulo compartido, no repetida en cada pantalla.

Razón: los errores de zona horaria producen citas a horas equivocadas y son difíciles de detectar.
(ADR-007)

### V. Toda entrada externa se valida en el servidor
- Toda entrada (formularios, parámetros, tokens de enlace) DEBE validarse en el servidor con un
  esquema Zod compartido con el cliente, no copiado.
- Los teléfonos se guardan en formato E.164.
- El formulario público de reserva DEBE tener honeypot y tope de citas activas por teléfono.
- Los enlaces de cancelación usan tokens aleatorios criptográficamente seguros, con expiración, y
  dejan de funcionar una vez usados.

Razón: la reserva pública es la única puerta abierta sin login. (ADR-003, ADR-010)

### VI. Datos personales mínimos y con consentimiento
- Del cliente final solo se recogen nombre, WhatsApp y correo.
- La reserva DEBE registrar la autorización de tratamiento de datos (Ley 1581 de 2012) y la fecha
  en que se dio.
- DEBE existir un mecanismo para solicitar el borrado de datos (en el MVP, por correo y manual).
- Los logs NO contienen datos personales del cliente (nombre, teléfono, correo) ni tokens.

Razón: obligación legal en Colombia y confianza de las barberías.

### VII. Simplicidad y alcance del MVP
- Solo se construye lo que está en el alcance del MVP (ADR-010). Lo que está en `Roadmap.md` del
  vault NO se implementa hasta que se cumpla su condición y el usuario lo apruebe.
- Un nuevo servicio, proceso, cola o dependencia DEBE justificarse por escrito en un ADR antes de
  añadirse.
- No se crean abstracciones para casos que aún no existen.

Razón: el objetivo es validar la idea con una barbería real; todo lo demás retrasa el lanzamiento.
El proyecto también sirve para aprender: el código debe poder entenderse en seis meses.

### VIII. Código portable entre hostings
- La app NO usa servicios exclusivos de Vercel (Vercel Cron, KV, Blob, Edge Config).
- Las tareas programadas se hacen en Supabase (`pg_cron`), no en el hosting.

Razón: la app pasa de Vercel al VPS con el primer cliente y no debe reescribirse. (ADR-011)

## Límites para el agente

**Siempre (sin pedir permiso)**
- Crear los cambios de esquema como migraciones versionadas con Supabase CLI.
- Ejecutar los tests antes de dar una tarea por terminada.
- Actualizar el vault (Estado actual, Pendientes, ADR) cuando el cambio lo requiera.
- Informar brevemente al usuario de lo que se hizo al terminar cada tarea.
- Al terminar una funcionalidad, explicar brevemente cómo funciona y cómo se conecta con el resto
  del sistema, sin extenderse. El usuario no escribe el código: lo escribe el agente.
- Hacer commit al cerrar cada fase del plan de ejecución.

**Preguntar primero** (explicando brevemente el motivo y las opciones al preguntar)
- Modificar el esquema de la base de datos o una política RLS.
- Añadir una dependencia o un servicio nuevo.
- Contradecir o cambiar un ADR vigente.
- Implementar algo que esté en `Roadmap.md`.
- Tocar la configuración del hosting, el DNS o el despliegue.

**Nunca**
- Subir secretos o API keys al repositorio.
- Desactivar RLS en una tabla, aunque sea temporalmente.
- Usar la service role key en código de cliente.
- Editar una migración ya aplicada; se crea una nueva.
- Cambiar el esquema a mano desde la consola de Supabase.

## Flujo de desarrollo y calidad

- Las funcionalidades delicadas (modelo de datos y RLS, reserva pública, confirmación y
  cancelación con token) siguen el flujo de Spec Kit: spec → plan → tareas → implementación →
  convergencia. No se implementan sin spec aprobada por el usuario. Las piezas sencillas no
  necesitan spec.
- Pasan por los tres agentes de revisión (seguridad, rendimiento, mantenibilidad) los hitos de
  modelo de datos y RLS, reserva pública, confirmación y cancelación, y el despliegue de pruebas.
  El informe consolidado se guarda en `Revisiones/` del vault.
- Un aspecto no se da por revisado si algún agente lo reportó como no revisado. Un punto ciego de
  seguridad bloquea el cambio.
- Comandos, framework de tests (Vitest y pgTAP; Playwright desde la fase 4), estructura de
  carpetas, estilo de código y flujo de git están en `CLAUDE.md`. Ninguna tarea se da por
  terminada sin pasar `lint`, `typecheck`, `test` y, si toca la base de datos, `test:db`.

## Gobernanza

- Esta constitución prevalece sobre specs, planes y tareas. Si un plan la contradice, se corrige el
  plan o se enmienda la constitución; nunca se ignora.
- `CLAUDE.md` describe el contexto y el stack; los ADR del vault explican el porqué de cada
  decisión; esta constitución fija las reglas que no se negocian.
- Una enmienda la propone el agente o el usuario, la aprueba el usuario, sube la versión (MAJOR:
  quitar o redefinir un principio; MINOR: añadir uno; PATCH: redacción) y, si es una decisión de
  arquitectura, se registra como ADR.
- Los agentes de revisión verifican el cumplimiento de esta constitución en los hitos que revisan.

**Versión**: 1.0.3 | **Ratificada**: 2026-10-04 | **Última enmienda**: 2026-10-04
