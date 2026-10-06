# Especificación: reserva pública de citas

**Rama**: `002-reserva-publica`

**Creada**: 2026-10-06

**Estado**: Aprobada (2026-10-06) e implementada

**Entrada**: Fase 4 del plan de ejecución: un cliente final reserva una cita en la página de la barbería sin crear cuenta. Flujo y diseño aprobados en `DESIGN.md` (4 pasos, "Lo más pronto", "Número de contacto"). Incluye lo diferido de la fase 1 (la cita debe caer dentro del horario y fuera de bloqueos) y el manejo de reservas simultáneas (`40P01`).

## Escenarios de usuario y pruebas *(obligatorio)*

### Historia 1 - Reservar una cita con un barbero concreto (Prioridad: P1)

Un cliente entra en la página de la barbería desde el celular, pulsa "Reservar cita" y elige servicio, barbero, día y hora libres. Después deja su nombre, número de contacto y correo, acepta el tratamiento de datos y confirma. Ve una pantalla de confirmación con el resumen de la cita.

**Por qué esta prioridad**: es la razón de ser del producto. Sin esto no hay MVP.

**Prueba independiente**: con la barbería de demostración, completar el flujo y comprobar que la cita aparece guardada con los datos, el precio y la duración del servicio, a la hora local elegida.

**Escenarios de aceptación**:

1. **Dado** una barbería activa con servicios, barberos y horario, **cuando** el cliente completa los 4 pasos y confirma, **entonces** la cita queda registrada como activa y ve "Cita confirmada" con servicio, barbero, fecha, hora local y precio.
2. **Dado** el paso 1, **cuando** el cliente ve los servicios, **entonces** solo aparecen los activos, con su duración y precio.
3. **Dado** el paso 2, **cuando** el cliente ve los barberos, **entonces** solo aparecen los activos que atienden ese servicio en el periodo reservable.
4. **Dado** el paso 3, **cuando** el cliente elige un día, **entonces** ve solo las horas en que el barbero está en horario, sin bloqueo y sin otra cita, con espacio para la duración completa del servicio.
5. **Dado** el paso 4, **cuando** falta un dato, el teléfono no es válido o no se acepta el tratamiento de datos, **entonces** no se reserva y el error se indica junto al campo.

---

### Historia 2 - "Lo más pronto" (Prioridad: P1)

En el paso 2 el cliente elige "Lo más pronto" en lugar de un barbero. Pasa directo al paso de datos con la primera hora libre de cualquier barbero ya elegida y ve "La más pronta: [día, hora] con [barbero]". Un enlace "Prefiero elegir otra hora" lleva al calendario con las horas de cualquier barbero (cambio pedido por el usuario el 2026-10-06).

**Por qué esta prioridad**: pedido por el usuario en la revisión del diseño; a muchos clientes les importa la hora, no el barbero.

**Prueba independiente**: con dos barberos y uno ocupado a las 10:00, elegir "Lo más pronto" a las 10:00 asigna al otro.

**Escenarios de aceptación**:

1. **Dado** dos barberos libres a la misma hora, **cuando** el cliente elige esa hora con "Lo más pronto", **entonces** se le asigna uno de ellos y ve su nombre en el resumen antes de confirmar.
2. **Dado** que a las 10:00 solo un barbero está libre, **cuando** el cliente elige las 10:00, **entonces** se le asigna ese barbero.
3. **Dado** que ningún barbero tiene horas libres en el periodo reservable, **cuando** el cliente elige "Lo más pronto", **entonces** ve un mensaje claro y no puede continuar.

---

### Historia 3 - Nunca dos citas en el mismo hueco ni fuera de horario (Prioridad: P1)

Aunque el cliente haya visto una hora como libre, el sistema vuelve a comprobarlo al confirmar. Si alguien la tomó mientras tanto, si cayó un bloqueo o si ya pasó, se rechaza con un mensaje claro y el cliente vuelve a elegir hora sin perder sus datos.

**Por qué esta prioridad**: integridad del negocio (constitución, principio III); la base de datos ya impide solapamientos, pero el horario y los bloqueos se validan aquí (diferido de la fase 1).

**Prueba independiente**: dos reservas simultáneas del mismo hueco → una se confirma y la otra recibe "Ese horario ya no está disponible"; una reserva enviada directamente con una hora fuera de horario o en un bloqueo se rechaza.

**Escenarios de aceptación**:

1. **Dado** dos clientes que confirman el mismo hueco a la vez, **cuando** se procesan, **entonces** uno obtiene la cita y el otro ve "Ese horario ya no está disponible" y puede elegir otra hora.
2. **Dado** una petición de reserva fuera del horario del barbero, dentro de un bloqueo, en el pasado o fuera del periodo reservable, **cuando** llega al servidor, **entonces** se rechaza aunque la interfaz no la hubiera ofrecido.
3. **Dado** un barbero o servicio desactivado después de que el cliente lo eligiera, **cuando** confirma, **entonces** se rechaza con un mensaje claro.

---

### Historia 4 - Protección básica contra abuso (Prioridad: P2)

El formulario incluye una trampa invisible para bots (honeypot) y un tope de citas activas futuras por número de contacto en cada barbería, para que nadie acapare la agenda.

**Por qué esta prioridad**: la reserva es la única puerta abierta sin login (constitución, principio V). P2 porque el flujo funciona sin ello, pero no se puede publicar sin ello.

**Prueba independiente**: un envío con el campo trampa relleno no crea cita; un número que ya tiene el máximo de citas activas futuras no puede reservar otra.

**Escenarios de aceptación**:

1. **Dado** un envío con el campo trampa relleno, **cuando** llega al servidor, **entonces** no se crea la cita y se responde como si nada hubiera pasado (sin dar pistas al bot).
2. **Dado** un número con el máximo de citas activas futuras en esa barbería, **cuando** intenta reservar otra, **entonces** ve "Ya tienes [N] citas pendientes en esta barbería" y no se crea.
3. **Dado** ese mismo número en otra barbería, **cuando** reserva, **entonces** el tope de la primera no le afecta.

---

### Historia 5 - Consentimiento y política de datos (Prioridad: P1)

Antes de confirmar, el cliente marca una casilla de autorización de tratamiento de datos que enlaza a la política de la plataforma. La cita guarda la fecha y hora de esa aceptación.

**Por qué esta prioridad**: obligación legal (Ley 1581 de 2012; constitución, principio VI).

**Prueba independiente**: sin marcar la casilla no se puede reservar; con la casilla marcada, la cita guarda la fecha de aceptación; el enlace abre la política.

**Escenarios de aceptación**:

1. **Dado** el paso 4 sin la casilla marcada, **cuando** el cliente confirma, **entonces** se rechaza y se indica junto a la casilla.
2. **Dado** la casilla marcada, **cuando** se confirma la cita, **entonces** queda guardada la fecha de aceptación.
3. **Dado** el enlace a la política, **cuando** el cliente lo abre, **entonces** ve la política de tratamiento de datos sin perder el progreso de la reserva.

### Casos límite

- Barbería sin servicios activos, sin barberos activos o sin horario: la página lo dice ("Esta barbería aún no tiene horarios disponibles") en lugar de un flujo vacío.
- Un servicio que no cabe en ningún tramo (por ejemplo, 120 min y tramos de 90 min): no aparecen horas para él.
- Un tramo que termina antes de que acabe el servicio: esa hora no se ofrece (la cita completa debe caber).
- Cambio de día en UTC: una hora local de la noche (por ejemplo, 19:30 en Bogotá = 00:30 UTC del día siguiente) se muestra en el día local correcto.
- El cliente vuelve atrás en el flujo: conserva lo ya elegido en los pasos anteriores. Con el botón "Atrás" la opción del paso al que se vuelve no aparece marcada (se vuelve a elegir); con el botón del navegador se conserva todo (aclaración tras la revisión, MAINT-005).
- Número de contacto escrito con espacios o sin prefijo: se normaliza a formato internacional (+57 por defecto) antes de validar.
- Doble clic en "Reservar cita": no crea dos citas.
- Reserva simultánea que provoca el bloqueo mutuo de Postgres (`40P01`): se reintenta una vez y el resultado final es "confirmada" u "horario no disponible", nunca un error genérico.

## Requisitos *(obligatorio)*

### Requisitos funcionales

- **FR-001**: La página pública de la barbería DEBE mostrar un botón "Reservar cita" que inicia el flujo.
- **FR-002**: El flujo DEBE tener 4 pasos (servicio → barbero → fecha y hora → datos) y una confirmación, conservando lo elegido al ir y volver.
- **FR-003**: Solo se ofrecen servicios y barberos activos de esa barbería.
- **FR-004**: El paso 2 DEBE ofrecer "Lo más pronto" como primera opción. Al elegirlo se salta el calendario: el paso de datos muestra la primera hora libre de cualquier barbero con el barbero asignado, y un enlace "Prefiero elegir otra hora" abre el calendario. Al confirmar, el servidor revalida y puede asignar otro barbero libre (cambio del usuario, 2026-10-06).
- **FR-005**: Las horas ofrecidas DEBEN cumplir a la vez: dentro de un tramo del horario semanal del barbero (con la duración completa del servicio), fuera de bloqueos, sin solaparse con citas activas, posteriores a la antelación mínima y dentro del periodo reservable.
- **FR-006**: Las horas de inicio se prueban cada 15 minutos (9:00, 9:15, 9:30…) y solo se ofrecen las que dejan caber la duración completa del servicio (aclarado por el usuario, 2026-10-06).
- **FR-007**: El periodo reservable DEBE ser de hasta 30 días hacia adelante, con una antelación mínima de 1 hora (aclarado por el usuario, 2026-10-06).
- **FR-008**: Al confirmar, el servidor DEBE volver a validar todo lo del FR-005 con datos actuales; nunca confía en lo que mostró la interfaz.
- **FR-009**: Una cita solapada (`23P01`) DEBE responder "Ese horario ya no está disponible"; un bloqueo mutuo (`40P01`) DEBE reintentarse una vez antes de responder.
- **FR-010**: El paso 4 DEBE pedir nombre, número de contacto (celular) y correo, y la casilla de autorización de datos con enlace a la política. El número se guarda en E.164.
- **FR-011**: La cita DEBE guardar la duración y el precio del servicio en ese momento, la fecha de aceptación de datos y el barbero asignado.
- **FR-012**: El formulario DEBE incluir un honeypot; un envío que lo rellene no crea cita y responde sin revelar el motivo.
- **FR-013**: Un número de contacto no puede tener más de 2 citas activas futuras en la misma barbería (aclarado por el usuario, 2026-10-06).
- **FR-014**: La reserva se procesa en el servidor con la clave secreta, filtrando siempre por la barbería resuelta del subdominio (constitución I y II); el navegador nunca escribe en la base de datos.
- **FR-015**: Debe existir una página de política de tratamiento de datos accesible desde el formulario.
- **FR-016**: Las páginas del flujo de reserva DEBEN llevar `noindex`; la página de la barbería sigue siendo indexable.
- **FR-017**: Fechas y horas se muestran en la hora local de la barbería y en formato `es-CO`.
- **FR-018**: Un test E2E (Playwright) DEBE completar la reserva en vista móvil y un escaneo de accesibilidad (`axe`) del flujo no debe dar violaciones.

### Entidades clave

- **Hueco disponible**: una hora de inicio en la que un barbero (o, con "Lo más pronto", alguno) puede atender el servicio completo. Se calcula; no se guarda.
- **Cita**: ya existe (fase 1). Esta fase la crea desde la web pública.
- **Política de tratamiento de datos**: texto de la plataforma al que enlaza la casilla de consentimiento.

## Criterios de éxito *(obligatorio)*

### Resultados medibles

- **SC-001**: Un cliente completa una reserva desde el celular en menos de 2 minutos.
- **SC-002**: El 100 % de las horas ofrecidas son realmente reservables en ese momento (dentro de horario, fuera de bloqueos y sin solapes).
- **SC-003**: El 100 % de las reservas fuera de horario, en bloqueo, en el pasado, solapadas o sin consentimiento se rechazan en el servidor.
- **SC-004**: Ante dos reservas simultáneas del mismo hueco, siempre se confirma exactamente una y la otra recibe un mensaje claro (nunca un error genérico).
- **SC-005**: Una hora elegida en hora local se confirma y se muestra exactamente a esa hora local.
- **SC-006**: El escaneo de accesibilidad del flujo no reporta violaciones.

## Supuestos

- La confirmación por correo y el enlace de cancelación son la fase 5; aquí la confirmación es solo en pantalla.
- Reagendar está fuera del MVP (Roadmap).
- "Lo más pronto", si varios barberos están libres a la misma hora, asigna al que tenga menos citas ese día (reparto equilibrado); a igualdad, por orden alfabético. Es interno y revisable.
- Prefijo por defecto del número de contacto: +57 (Colombia); se acepta otro si el cliente lo escribe con `+`.
- La política de tratamiento de datos se redacta como **plantilla** basada en la Ley 1581 y queda marcada para revisión legal antes del primer cliente real; no sustituye asesoría jurídica.
- Turnstile y rate limiting por IP siguen fuera del MVP (ADR-010); el honeypot y el tope por número cubren el abuso básico.
