# Especificación: modelo de datos y aislamiento por barbería

**Rama**: `001-modelo-datos-rls`

**Creada**: 2026-10-04

**Estado**: Aprobada (2026-10-04) e implementada

**Entrada**: Fase 1 del plan de ejecución: modelo de datos del MVP (barberías, usuarios y roles, barberos, servicios, horarios, bloqueos, citas) con aislamiento por barbería. Requisito del usuario: debe existir una base de datos de prueba para que los datos de prueba no ensucien la de producción.

## Escenarios de usuario y pruebas *(obligatorio)*

### Historia 1 - Cada barbería solo ve y modifica sus propios datos (Prioridad: P1)

Un administrador de barbería entra al sistema y trabaja con sus barberos, servicios, horarios, bloqueos y citas. Nunca puede ver ni modificar nada de otra barbería, aunque conozca o adivine identificadores de otra.

**Por qué esta prioridad**: es el peor fallo posible del producto (constitución, principio I). Sin esto, nada de lo demás puede usarse con clientes reales.

**Prueba independiente**: con dos barberías de prueba y un administrador en cada una, se comprueba que cada administrador ve solo lo suyo y que todo intento de leer, crear, modificar o borrar datos de la otra se rechaza.

**Escenarios de aceptación**:

1. **Dado** dos barberías A y B con datos, **cuando** el administrador de A consulta barberos, servicios, horarios, bloqueos o citas, **entonces** solo obtiene los de A.
2. **Dado** el administrador de A, **cuando** intenta crear, modificar o borrar un registro de B (incluido usando el identificador exacto de B), **entonces** la operación se rechaza y los datos de B no cambian.
3. **Dado** el administrador de A, **cuando** intenta crear un registro asignándolo a la barbería B, **entonces** la operación se rechaza.
4. **Dado** una persona sin sesión, **cuando** intenta leer o modificar directamente cualquier dato de cualquier barbería, **entonces** la operación se rechaza.
5. **Dado** el super admin, **cuando** consulta barberías, **entonces** ve todas y puede darlas de alta.

---

### Historia 2 - Un barbero no puede tener dos citas que se solapen (Prioridad: P1)

Cuando se registra una cita para un barbero, el sistema garantiza que no choca con otra cita activa de ese mismo barbero, incluso si dos personas intentan reservar el mismo hueco al mismo tiempo.

**Por qué esta prioridad**: una doble reserva es el error que más daña la confianza de una barbería (constitución, principio III).

**Prueba independiente**: registrando citas directamente en los datos, sin interfaz, se comprueba que un solapamiento se rechaza y que una cita cancelada deja libre su horario.

**Escenarios de aceptación**:

1. **Dado** una cita activa de 10:00 a 10:30 con el barbero X, **cuando** se intenta registrar otra de 10:15 a 10:45 con X, **entonces** se rechaza.
2. **Dado** la misma cita, **cuando** se registra una de 10:30 a 11:00 con X (empieza justo cuando termina la anterior), **entonces** se acepta.
3. **Dado** la misma cita, **cuando** se registra una de 10:00 a 10:30 con el barbero Y, **entonces** se acepta.
4. **Dado** que la cita de 10:00 a 10:30 con X se cancela, **cuando** se registra otra de 10:00 a 10:30 con X, **entonces** se acepta.
5. **Dado** dos intentos simultáneos del mismo hueco con X, **cuando** ambos se procesan, **entonces** exactamente uno se acepta.

---

### Historia 3 - Las horas se guardan sin ambigüedad de zona horaria (Prioridad: P1)

Cada barbería tiene configurada su zona horaria. Todas las fechas y horas se guardan en un formato universal (UTC) y se interpretan en la hora local de la barbería solo al mostrarlas o al recibirlas.

**Por qué esta prioridad**: un error de zona horaria produce citas a horas equivocadas y es difícil de detectar (constitución, principio IV).

**Prueba independiente**: con una barbería en Bogotá (UTC−5), una cita a las 10:00 hora local se guarda como 15:00 UTC y se recupera como 10:00 hora local.

**Escenarios de aceptación**:

1. **Dado** una barbería con zona `America/Bogota`, **cuando** se registra una cita a las 10:00 hora local, **entonces** queda guardada como las 15:00 UTC.
2. **Dado** una barbería sin zona horaria válida, **cuando** se intenta crear, **entonces** se rechaza.
3. **Dado** un horario semanal de 09:00 a 18:00, **cuando** se consulta, **entonces** se entiende en la hora local de la barbería, no en UTC.

---

### Historia 4 - Cada cita registra el consentimiento de datos del cliente (Prioridad: P2)

Cuando un cliente final reserva, la cita guarda sus datos de contacto (nombre, WhatsApp, correo) y la fecha en que aceptó el tratamiento de datos. No se puede guardar una cita sin esa aceptación.

**Por qué esta prioridad**: obligación legal (Ley 1581 de 2012; constitución, principio VI). Es P2 porque la reserva pública llega en la fase 4, pero el dato debe existir desde el modelo.

**Prueba independiente**: intentar registrar una cita sin fecha de aceptación se rechaza; con fecha, se acepta.

**Escenarios de aceptación**:

1. **Dado** una cita sin fecha de aceptación de datos, **cuando** se intenta registrar, **entonces** se rechaza.
2. **Dado** una cita con un teléfono que no está en formato internacional E.164, **cuando** se intenta registrar, **entonces** se rechaza.
3. **Dado** una solicitud de borrado de un cliente, **cuando** el administrador la atiende, **entonces** puede localizar todas las citas de ese teléfono o correo en su barbería.

---

### Historia 5 - Los datos de prueba nunca llegan a producción (Prioridad: P1)

El desarrollo y las pruebas usan una base de datos local y desechable, con dos barberías de demostración. La base de datos de producción solo recibe la estructura (migraciones), nunca datos de prueba ni ejecuciones de tests.

**Por qué esta prioridad**: requisito explícito del usuario. Datos de prueba en producción confunden a las barberías, ensucian las métricas futuras y pueden mezclarse con datos personales reales.

**Prueba independiente**: recrear la base local deja exactamente las dos barberías de demostración; la configuración del proyecto no permite ejecutar los tests ni cargar los datos de demostración contra un entorno remoto por defecto.

**Escenarios de aceptación**:

1. **Dado** la base local, **cuando** se recrea, **entonces** queda solo la estructura más las dos barberías de demostración con sus datos de ejemplo.
2. **Dado** los tests de base de datos, **cuando** se ejecutan, **entonces** no dejan datos residuales (cada test deshace sus cambios).
3. **Dado** el entorno de producción, **cuando** se le aplican cambios de estructura, **entonces** no se cargan datos de demostración.

---

### Casos límite

- Una cita cuyo fin es anterior o igual a su inicio se rechaza.
- Un servicio con duración de 0 minutos o negativa, o precio negativo, se rechaza.
- Un horario semanal con hora de fin anterior o igual a la de inicio se rechaza; un barbero puede tener varios tramos el mismo día (por ejemplo, mañana y tarde).
- Un bloqueo con fin anterior o igual a su inicio se rechaza.
- Dos barberías no pueden tener el mismo subdominio; el subdominio solo admite minúsculas, números y guiones.
- Si se desactiva un barbero o un servicio con citas futuras, las citas siguen existiendo; el sistema no las borra en cascada.
- Si se borra una barbería, sus datos no quedan huérfanos ni accesibles para otra.
- Un administrador pertenece a una sola barbería; un usuario sin barbería asignada (y que no es super admin) no ve ningún dato.

## Requisitos *(obligatorio)*

### Requisitos funcionales

- **FR-001**: El sistema DEBE asociar cada barbero, servicio, horario, bloqueo y cita a exactamente una barbería.
- **FR-002**: El sistema DEBE impedir que un usuario lea, cree, modifique o borre datos de una barbería distinta de la suya, en todas las entidades del FR-001.
- **FR-003**: El sistema DEBE impedir el acceso directo a los datos a personas sin sesión; la reserva pública (fase 4) pasará por el servidor.
- **FR-004**: El sistema DEBE distinguir dos roles con sesión en el MVP: super admin (gestiona barberías) y administrador de barbería (gestiona los datos de su barbería).
- **FR-005**: El sistema DEBE identificar cada barbería por un subdominio único con formato válido.
- **FR-006**: El sistema DEBE guardar para cada barbería una zona horaria válida y guardar todas las fechas y horas en UTC.
- **FR-007**: El sistema DEBE guardar servicios con nombre, duración en minutos (mayor que 0), precio (mayor o igual que 0) y estado activo o inactivo.
- **FR-008**: El sistema DEBE guardar barberos con nombre y estado activo o inactivo.
- **FR-009**: El sistema DEBE guardar el horario semanal de cada barbero como tramos (día de la semana, hora de inicio y fin en hora local), permitiendo varios tramos por día.
- **FR-010**: El sistema DEBE guardar bloqueos de un barbero (descansos, vacaciones) como intervalos de fecha y hora con un motivo opcional.
- **FR-011**: El sistema DEBE guardar cada cita con barbero, servicio, inicio, fin, estado (activa o cancelada), nombre, teléfono E.164 y correo del cliente, y fecha de aceptación del tratamiento de datos.
- **FR-012**: El sistema DEBE conservar en la cita la duración y el precio del servicio en el momento de reservar, para que cambios posteriores del servicio no alteren citas ya hechas.
- **FR-013**: El sistema DEBE rechazar a nivel de datos dos citas activas solapadas del mismo barbero, incluso si llegan al mismo tiempo; las citas canceladas no bloquean el horario.
- **FR-014**: El sistema DEBE permitir encontrar todas las citas de un teléfono o correo dentro de una barbería (borrado de datos y tope de citas activas en la fase 4).
- **FR-015**: El sistema DEBE ofrecer una base de datos local y desechable con dos barberías de demostración (barberos, servicios, horarios, un bloqueo, citas y un administrador por barbería) para desarrollo y pruebas.
- **FR-016**: Los tests de base de datos DEBEN demostrar el aislamiento (FR-002, FR-003), la no superposición (FR-013), la zona horaria (FR-006) y las validaciones de los casos límite, sin dejar datos residuales.
- **FR-017**: El entorno de producción NO DEBE recibir datos de demostración ni ejecuciones de tests; solo cambios de estructura.

### Entidades clave

- **Barbería**: el inquilino. Nombre, subdominio único, zona horaria, estado.
- **Perfil de usuario**: vincula una cuenta de acceso con su rol (super admin o admin) y, si es admin, con su barbería.
- **Barbero**: persona que atiende; pertenece a una barbería. Sin cuenta de acceso en el MVP.
- **Servicio**: lo que se ofrece (corte, barba…); duración y precio; pertenece a una barbería.
- **Tramo de horario**: día de la semana y franja horaria local en que un barbero atiende.
- **Bloqueo**: intervalo en que un barbero no atiende (descanso, vacaciones).
- **Cita**: un servicio con un barbero en un intervalo; datos de contacto del cliente, consentimiento y estado. El cliente no tiene cuenta.

## Criterios de éxito *(obligatorio)*

### Resultados medibles

- **SC-001**: El 100 % de los intentos de acceso a datos de otra barbería, en todas las entidades y operaciones, se rechaza en los tests.
- **SC-002**: El 100 % de los intentos de cita solapada se rechaza, incluidos dos intentos simultáneos sobre el mismo hueco.
- **SC-003**: Una cita registrada a una hora local se recupera exactamente a la misma hora local.
- **SC-004**: Recrear la base de pruebas desde cero lleva menos de 2 minutos y deja siempre el mismo conjunto de datos de demostración.
- **SC-005**: Después de ejecutar todos los tests, la base de pruebas queda idéntica a como estaba antes.
- **SC-006**: Ningún dato de demostración ni de test aparece en el entorno de producción.

## Supuestos

- Una cita tiene un solo servicio y un solo barbero en el MVP.
- Los datos del cliente se guardan en la cita, sin ficha de cliente aparte; el borrado se resuelve buscando por teléfono o correo (FR-014).
- Un administrador pertenece a una sola barbería; una barbería puede tener varios administradores.
- El super admin no tiene panel en el MVP: opera con un script o desde la consola de Supabase, sin cambiar la estructura a mano.
- Los descansos recurrentes se modelan como huecos entre tramos del horario semanal; los bloqueos son para ausencias puntuales.
- La cancelación con token (fase 5), el tope de citas activas por teléfono (fase 4) y el cálculo de disponibilidad (fase 4) se especifican en sus fases; aquí solo se garantiza que el modelo los permita.
- Entornos: local (desarrollo y tests), pruebas (despliegue en Vercel, fase 7) y producción (con el primer cliente). Los dos remotos son proyectos de Supabase separados.
