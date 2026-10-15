# Spec: reserva mejorada (fase A)

**Rama**: `007-reserva-mejorada` | **Fecha**: 2026-10-14 | **Estado**: aprobada por el usuario (2026-10-14)

**Entrada**: fase A del plan aprobado por el usuario el 2026-10-14, a partir de la comparación con Booksy, Fresha y AgendaPro (artifact "Reservas: Booksy, Fresha y AgendaPro"). Sin cambios en la base de datos.

**Fuera de alcance**:
- Cambiar de barbero desde el paso de fecha (lo descartó el usuario: el barbero se elige en el paso 2).
- Fotos (fase B).
- Varios servicios por cita (fase C).

## Historias de usuario

### Historia 1 - Ver la cita completa antes de dar los datos (Prioridad: P1)

En el paso de fecha y hora, el cliente toca una hora y se queda en la misma pantalla: la hora queda marcada y abajo aparece una barra fija con el servicio, la hora de inicio y de fin, el precio y el botón "Continuar". Puede cambiar de hora, de franja o de fecha antes de seguir. En el paso de datos, la misma barra muestra el resumen y el botón "Confirmar reserva".

**Por qué esta prioridad**: hoy, al tocar una hora se salta directamente al formulario y el cliente no ve a qué hora termina la cita. Las tres plataformas comparadas resumen la cita en una barra fija antes de pedir datos.

**Prueba independiente**: elegir servicio, barbero, fecha y hora, y comprobar que la barra muestra "Corte clásico · $ 25.000" y "10:00 a. m. – 10:30 a. m."; cambiar de hora y ver la barra actualizada; "Continuar" lleva al paso de datos con la barra y "Confirmar reserva".

**Escenarios**:
1. **Dado** el paso 3 sin hora elegida, **cuando** se muestra, **entonces** no hay barra inferior.
2. **Dado** el paso 3, **cuando** el cliente toca una hora, **entonces** sigue en el paso 3, la hora queda marcada como elegida y aparece la barra con servicio, "inicio – fin", precio y "Continuar".
3. **Dado** una hora elegida, **cuando** el cliente toca otra hora, otra franja o otra fecha, **entonces** la barra se actualiza (o desaparece si la nueva fecha o franja no incluye la hora elegida).
4. **Dado** una hora elegida, **cuando** pulsa "Continuar", **entonces** llega al paso de datos con la misma hora.
5. **Dado** el paso de datos, **cuando** se muestra, **entonces** la barra fija lleva el resumen y el botón de envío "Confirmar reserva", y el formulario no queda tapado por la barra en ningún tamaño de pantalla.
6. **Dado** "Lo más pronto", **cuando** el cliente lo elige, **entonces** llega directamente al paso de datos con la primera hora libre, como hoy, y con la barra.
7. **Dado** una hora elegida que deja de estar libre antes de pulsar "Continuar" (otro cliente la reservó), **cuando** el cliente vuelve a cargar el paso 3 o pasa al de datos, **entonces** ve el paso 3 sin hora elegida y el aviso "Ese horario ya no está disponible. Elige otra hora.".

---

### Historia 2 - Ir a la primera fecha con horas (Prioridad: P2)

Antes de elegir fecha, encima del carrusel hay un botón "Primera fecha con horas: vie 16 oct" que abre esa fecha directamente.

**Por qué esta prioridad**: si el barbero tiene la semana llena, hoy el cliente tiene que deslizar el carrusel buscando una fecha que no esté en gris.

**Prueba independiente**: con un barbero sin horas los primeros días, abrir el paso 3 y pulsar el botón.

**Escenarios**:
1. **Dado** el paso 3 sin fecha elegida, **cuando** se muestra, **entonces** aparece el botón con la primera fecha que tiene horas ("hoy" si es hoy).
2. **Dado** el botón, **cuando** se pulsa, **entonces** se abre esa fecha con su primera franja con horas, igual que al tocarla en el carrusel.
3. **Dado** que ya hay una fecha elegida, **cuando** se muestra el paso 3, **entonces** el botón no aparece.

---

### Historia 3 - Aviso de "quedan pocas horas" (Prioridad: P3)

Las fechas del carrusel con pocas horas libres llevan un punto cobre, para que el cliente sepa que se pueden agotar.

**Por qué esta prioridad**: da algo de urgencia y ayuda a decidir, como el indicador de Booksy, pero la reserva funciona igual sin él.

**Escenarios**:
1. **Dado** una fecha con 1, 2 o 3 horas libres, **cuando** se muestra en el carrusel, **entonces** lleva un punto cobre y, para lectores de pantalla, el texto "quedan pocas horas" en su nombre accesible.
2. **Dado** una fecha con 4 horas libres o más, o sin horas, **cuando** se muestra, **entonces** no lleva el punto.
3. **Dado** el punto, **cuando** se mira, **entonces** no es la única señal: el texto accesible lo acompaña y no cambia el estado de la fecha (sigue siendo elegible).

---

### Historia 4 - Confirmación útil (Prioridad: P2)

En la pantalla "Cita confirmada", el cliente puede añadir la cita a su calendario y abrir cómo llegar.

> **Cambio del usuario (2026-10-14), tras probarlo:**
> - El calendario se añade con un enlace a Google Calendar (botón principal) porque en Android y en el computador el archivo `.ics` solo se descarga. El archivo queda como segunda opción para el iPhone y Outlook.
> - Se quita "Compartir por WhatsApp": probándolo, el cliente se envía el mensaje a sí mismo, y no aporta. "Escribir a la barbería por WhatsApp" queda como idea para más adelante (necesita el número de la barbería).

**Por qué esta prioridad**: añadir la cita al calendario reduce los olvidos (todavía no hay recordatorios, que están en el Roadmap), y "Cómo llegar" ayuda a quien no conoce el local.

**Prueba independiente**: reservar y pulsar cada botón de la confirmación.

**Escenarios**:
1. **Dado** una reserva confirmada, **cuando** el cliente pulsa "iPhone u Outlook", **entonces** descarga un archivo de calendario que los calendarios habituales (Google Calendar, el del iPhone y Outlook) abren con:
   - título "<servicio> en <barbería>";
   - inicio y fin correctos en la hora de la barbería;
   - la dirección, si la tiene;
   - el barbero en la descripción.
2. **Dado** una reserva confirmada, **cuando** pulsa "Añadir a Google Calendar", **entonces** se abre Google Calendar con el evento ya rellenado (título, inicio y fin, dirección y barbero) en una pestaña nueva.
3. **Dado** el enlace a Google Calendar y el archivo de calendario, **cuando** se revisan, **entonces** ninguno contiene el enlace de cancelación ni datos del cliente (nombre, teléfono, correo).
4. **Dado** una barbería con dirección, **cuando** se muestra la confirmación, **entonces** aparece "Cómo llegar", que abre el mapa de esa dirección en una pestaña nueva; sin dirección, no aparece.
5. **Dado** un envío descartado por el antispam (honeypot), **cuando** se muestra la confirmación genérica, **entonces** no aparecen estos botones.

---

### Casos límite

- **El cliente vuelve atrás desde el paso de datos:** la hora sigue elegida y la barra visible en el paso 3.
- **La hora de la URL no es válida** (manipulada o de otra barbería): el paso 3 sin hora elegida, sin error técnico.
- **Teclado y lector de pantalla:** la barra no tapa el foco; el botón "Continuar" es alcanzable con tabulador; la hora elegida lleva `aria-current` o equivalente; al aparecer la barra, se anuncia el resumen.
- **Pantallas pequeñas (320 px):** el resumen de la barra se recorta con puntos suspensivos sin tapar el botón; en dos líneas si hace falta.
- **Cita que cruza la medianoche o un cambio de horario** de la zona: el archivo de calendario usa instantes UTC, así que el calendario del cliente la muestra bien en su zona.

## Requisitos

### Requisitos funcionales

**Paso de fecha y hora**
- **FR-001**: Elegir una hora en el paso 3 NO DEBE llevar al formulario. La hora queda marcada y la elección se conserva en la dirección de la página (como el resto del flujo), así que "atrás" y recargar la mantienen.
- **FR-002**: Con una hora elegida, DEBE mostrarse una barra fija inferior con:
  - el nombre del servicio;
  - "inicio – fin" en hora de la barbería (fin = inicio + duración del servicio);
  - el precio;
  - el botón "Continuar".
- **FR-003**: El paso de datos DEBE mostrar la misma barra con el botón de envío "Confirmar reserva". El resumen que hoy aparece arriba del formulario puede quedarse o quitarse si la barra lo hace innecesario (decisión de diseño en el plan).
- **FR-004**: La barra NO DEBE tapar contenido: la página reserva espacio al final para ella.
- **FR-005**: Sin fecha elegida, el paso 3 DEBE ofrecer el botón "Primera fecha con horas: <fecha corta>" si existe alguna fecha con horas.
- **FR-006**: Las fechas con 1 a 3 horas libres DEBEN llevar el indicador de pocas horas, con texto accesible.

**Confirmación**
- **FR-007**: La confirmación DEBE ofrecer el botón "iPhone u Outlook" con un archivo de calendario estándar con título, inicio, fin, ubicación (si hay dirección) y descripción (barbero).
- **FR-008**: La confirmación DEBE ofrecer "Añadir a Google Calendar" como acción principal y el archivo de FR-007 como segunda opción ("iPhone u Outlook"). (Cambio del usuario del 2026-10-14: sustituye a "Compartir por WhatsApp".)
- **FR-009**: El enlace a Google Calendar y el archivo de calendario NO DEBEN contener el enlace o token de cancelación ni datos personales del cliente (constitución V y VI).
- **FR-010**: Si la barbería tiene dirección, la confirmación DEBE ofrecer "Cómo llegar", con el mismo enlace al mapa que la portada.
- **FR-011**: Nada de lo anterior DEBE cambiar las reglas de la reserva: validación en el servidor, tope por teléfono, honeypot y restricción de solapes.

**Calidad**
- **FR-012**: Todas las pantallas del flujo DEBEN pasar el escaneo de accesibilidad automático sin violaciones, en celular y escritorio.

## Criterios de éxito

### Resultados medibles

- **SC-001**: Antes de dar sus datos, el cliente ve servicio, hora de inicio y de fin y precio en una sola vista, en el 100 % de las reservas por el calendario.
- **SC-002**: Desde el paso 3 sin fecha, el cliente llega a las horas de la primera fecha disponible con un toque.
- **SC-003**: El archivo de calendario se abre sin errores en Google Calendar y en el calendario del iPhone, con la hora correcta.
- **SC-004**: Ni el enlace a Google Calendar ni el archivo de calendario contienen el enlace de cancelación ni datos personales (comprobado por tests).
- **SC-005**: 0 violaciones de accesibilidad automáticas en el flujo de reserva.

## Supuestos

- "Pocas horas" = 3 o menos en el día, para el servicio y el barbero elegidos (las horas dependen de la duración). Ajustable en el plan.
- Con "Lo más pronto" se mantiene el atajo actual al paso de datos (con la primera hora libre); la barra aparece allí.
- El archivo de calendario se genera en el navegador del cliente con los datos de la confirmación; no hace falta una ruta del servidor ni guardar nada.
- La hora de fin se calcula con la duración del servicio; no se muestra la duración por separado en la barra.
- No cambian el correo de confirmación, la cancelación con enlace ni el panel.
