# Spec: portada de la barbería y estilo oscuro

**Rama**: `006-portada-barberia` | **Fecha**: 2026-10-14 | **Estado**: aprobada por el usuario (2026-10-14)

**Entrada**: el usuario compartió una página de reservas de barbería como referencia de estilo y aprobó `DESIGN.md` 0.2.0 (tema oscuro, acento cobre, portada con los servicios). Alcance elegido: estilo oscuro en toda la app + datos del local en texto (sin fotos). La descripción y la dirección las edita el admin desde su panel.

## Historias de usuario

### Historia 1 - Portada de la barbería con sus servicios (Prioridad: P1)

El cliente abre el enlace de la barbería (`<barberia>.dominio`) y ve una portada: nombre, descripción corta, si está abierta ahora y hasta qué hora, dirección con enlace "Ver mapa", un botón principal "Reservar lo más pronto", la lista de servicios (nombre, precio, duración, descripción breve y botón "Reservar") y el horario de la semana con el día de hoy resaltado. Al pulsar "Reservar" en un servicio entra a la reserva con ese servicio ya elegido.

**Por qué esta prioridad**: es lo primero que ve el cliente y lo que la barbería comparte por WhatsApp e Instagram. Hoy la portada es solo el nombre y un botón; con los servicios y el horario a la vista, el cliente decide sin entrar a la reserva y llega a elegir barbero con un toque menos.

**Prueba independiente**: con una barbería de demostración con servicios, barberos y horarios, abrir la portada y comprobar cada bloque; pulsar "Reservar" en un servicio y comprobar que se abre el paso de elegir barbero con ese servicio.

**Escenarios**:
1. **Dado** una barbería activa con servicios activos, **cuando** el cliente abre la portada, **entonces** ve todos sus servicios activos, cada uno con nombre, precio en pesos colombianos, duración y botón "Reservar"; y no ve los servicios inactivos.
2. **Dado** un servicio con descripción, **cuando** se muestra en la portada, **entonces** su descripción aparece bajo el nombre, recortada a dos líneas como máximo.
3. **Dado** que el cliente pulsa "Reservar" en un servicio, **cuando** se abre la reserva, **entonces** está en el paso 2 (elegir barbero) con ese servicio ya elegido.
4. **Dado** que el cliente pulsa "Reservar lo más pronto", **cuando** se abre la reserva, **entonces** empieza en el paso 1 (elegir servicio), como hoy.
5. **Dado** que ahora mismo está dentro del horario de hoy, **cuando** se abre la portada, **entonces** dice "Abierto ahora · hasta [hora de cierre]".
6. **Dado** que hoy hay horario pero aún no empieza, **cuando** se abre la portada, **entonces** dice "Abre hoy a las [hora de apertura]".
7. **Dado** que hoy no hay horario, o ya pasó la hora de cierre, **cuando** se abre la portada, **entonces** dice "Cerrado ahora" y, si hay otro día con horario en la semana, "Abre [día] a las [hora]".
8. **Dado** el horario de la semana, **cuando** se muestra, **entonces** tiene los siete días de lunes a domingo, con la hora de apertura y cierre de cada uno o "Cerrado", y el día de hoy (en la zona horaria de la barbería) resaltado.
9. **Dado** una barbería con dirección, **cuando** el cliente pulsa "Ver mapa", **entonces** se abre en una pestaña nueva la búsqueda de esa dirección en Google Maps.
10. **Dado** una barbería sin descripción o sin dirección, **cuando** se abre la portada, **entonces** esa línea no aparece y no queda un hueco ni un texto vacío.

---

### Historia 2 - Estilo oscuro en toda la app (Prioridad: P1)

Toda la app (portada, reserva, cancelación, política de datos, login y panel del admin) usa el tema oscuro con acento cobre de `DESIGN.md` 0.2.0.

**Por qué esta prioridad**: es el cambio visual que el usuario quiere enseñar; sin él, la portada nueva queda con un estilo distinto al resto de la app.

**Prueba independiente**: recorrer la reserva completa, la cancelación y el panel, y pasar el escaneo de accesibilidad en cada página.

**Escenarios**:
1. **Dado** cualquier página de la app, **cuando** se abre, **entonces** usa el fondo, el texto, las tarjetas y el acento cobre de `DESIGN.md` 0.2.0, sin zonas que se queden en el estilo claro anterior.
2. **Dado** un botón principal, **cuando** se muestra, **entonces** es cobre con texto oscuro.
3. **Dado** un elemento seleccionado (servicio, barbero, hora), **cuando** se muestra, **entonces** se distingue por borde cobre y marca de verificación, no solo por el color.
4. **Dado** cualquier página pública o del panel, **cuando** se pasa el escaneo de accesibilidad, **entonces** no hay violaciones de contraste ni de otro tipo.

---

### Historia 3 - "Mi barbería" en el panel (Prioridad: P2)

El admin entra a una sección nueva "Mi barbería" de su panel, escribe la descripción corta y la dirección de su barbería, guarda, y las ve en la portada al recargarla.

**Por qué esta prioridad**: sin ella, la portada no tiene descripción ni dirección (salvo en los datos de demostración). Es P2 porque la portada ya funciona sin esos datos.

**Prueba independiente**: entrar como admin, guardar descripción y dirección, abrir la portada y comprobar que aparecen; intentar lo mismo con otra barbería y comprobar que no se puede.

**Escenarios**:
1. **Dado** un admin con sesión, **cuando** abre "Mi barbería", **entonces** ve el nombre de su barbería (solo lectura) y los campos "Descripción" y "Dirección" con sus valores actuales.
2. **Dado** que el admin guarda una descripción y una dirección válidas, **cuando** recarga la portada de su barbería, **entonces** las ve.
3. **Dado** que el admin deja un campo vacío y guarda, **cuando** se abre la portada, **entonces** esa línea desaparece.
4. **Dado** un texto más largo que el límite, **cuando** el admin guarda, **entonces** ve el error junto al campo y no se guarda nada.
5. **Dado** el admin de la barbería A, **cuando** intenta modificar los datos de la barbería B por cualquier vía, **entonces** no se modifica nada.
6. **Dado** el admin de una barbería, **cuando** intenta modificar el nombre, el subdominio, la zona horaria o el estado de su barbería por cualquier vía, **entonces** no se modifica nada.

---

### Historia 4 - Descripción de los servicios (Prioridad: P3)

En el formulario de servicios del panel, el admin puede escribir una descripción corta opcional para cada servicio, que se muestra en la tarjeta del servicio en la portada.

**Por qué esta prioridad**: mejora la portada, pero un servicio sin descripción se entiende igual por su nombre.

**Prueba independiente**: crear o editar un servicio con descripción y comprobar que aparece en la portada.

**Escenarios**:
1. **Dado** el formulario de crear o editar servicio, **cuando** el admin escribe una descripción y guarda, **entonces** se guarda junto al resto del servicio.
2. **Dado** un servicio sin descripción, **cuando** se muestra en la portada, **entonces** la tarjeta no deja un hueco.
3. **Dado** una descripción más larga que el límite, **cuando** el admin guarda, **entonces** ve el error junto al campo.

---

### Casos límite

- **Sin servicios activos:** la portada muestra "Esta barbería aún no tiene servicios para reservar" en lugar de la lista, y el botón "Reservar lo más pronto" no aparece.
- **Sin barberos activos o sin horarios:** el estado dice "Cerrado ahora" y el horario de la semana muestra "Cerrado" los siete días.
- **Horarios de varios barberos el mismo día** (por ejemplo, uno de 9:00 a 12:00 y otro de 14:00 a 19:00): el horario del día va de la apertura más temprana al cierre más tardío (9:00 a. m. – 7:00 p. m.); los huecos entre medias no se muestran.
- **Un barbero con dos tramos el mismo día:** cuenta igual que el caso anterior.
- **Barbero inactivo:** sus horarios no cuentan para el horario de la barbería.
- **Bloqueos (vacaciones, descansos):** no cambian el horario de la portada; lo que sí refleja la disponibilidad real es la reserva.
- **Cambio de día:** "hoy" y "ahora" se calculan en la zona horaria de la barbería, no en la del servidor ni en la del cliente.
- **Servicio que se desactiva entre que el cliente ve la portada y pulsa "Reservar":** la reserva lo trata como hoy un servicio inválido en la URL (vuelve al paso 1 sin error técnico).
- **Texto con caracteres especiales o etiquetas HTML** en la descripción o la dirección: se muestra como texto, nunca se interpreta.
- **Dirección con tildes, eñes y "#"** (por ejemplo "Calle 45 # 12-30, Bogotá"): el enlace "Ver mapa" la busca correctamente.
- **Espacios al principio o al final, o un campo solo con espacios:** se recortan; solo espacios cuenta como vacío.
- **Barbería desactivada o subdominio inexistente:** "Barbería no encontrada", como hoy.

## Requisitos

### Requisitos funcionales

**Portada (web pública)**
- **FR-001**: La página principal de cada barbería DEBE mostrar, en este orden: portada (etiqueta "Barbería", nombre, descripción, estado de apertura, dirección con "Ver mapa"), botón principal "Reservar lo más pronto", lista de servicios activos y horario de la semana.
- **FR-002**: Cada servicio DEBE mostrar nombre, precio en formato de pesos colombianos, duración, descripción (si tiene, recortada a dos líneas) y un botón "Reservar" que abre la reserva en el paso 2 con ese servicio elegido.
- **FR-003**: El horario de cada día de la semana DEBE calcularse con los horarios semanales de los barberos activos de la barbería: apertura = inicio más temprano, cierre = fin más tardío; un día sin tramos es "Cerrado".
- **FR-004**: El estado de apertura DEBE seguir los escenarios 5–7 de la historia 1, calculado con la hora actual en la zona horaria de la barbería.
- **FR-005**: El enlace "Ver mapa" DEBE construirse a partir de la dirección guardada, abrir en una pestaña nueva y no guardar ninguna URL en la base.
- **FR-006**: La portada DEBE resolver la barbería por el subdominio (Host) en el servidor y solo mostrar datos de esa barbería; nunca acepta un identificador de barbería del navegador.
- **FR-007**: La portada DEBE ser indexable (título y metadescripción con el nombre y, si hay, la descripción de la barbería); la reserva, la cancelación y el panel siguen con `noindex`.

**Estilo**
- **FR-008**: Todas las páginas DEBEN usar los tokens de color, radio y tipografía de `DESIGN.md` 0.2.0. No queda ninguna página con el estilo claro anterior.
- **FR-009**: Todas las páginas públicas y del panel DEBEN pasar el escaneo de accesibilidad automático sin violaciones.

**Datos de la barbería ("Mi barbería")**
- **FR-010**: La barbería DEBE poder tener una descripción opcional (máximo 160 caracteres) y una dirección opcional (máximo 200 caracteres), en texto plano de una línea.
- **FR-011**: El admin DEBE poder ver y editar la descripción y la dirección de su propia barbería desde la sección "Mi barbería" del panel.
- **FR-012**: El admin NO DEBE poder modificar ningún otro dato de su barbería (nombre, subdominio, zona horaria, estado) ni ningún dato de otra barbería. La base de datos DEBE impedirlo aunque falle el código.
- **FR-013**: El super admin NO DEBE ganar ningún permiso de escritura sobre las barberías con este cambio.
- **FR-014**: La web pública NO DEBE poder modificar los datos de ninguna barbería.
- **FR-015**: Los valores DEBEN validarse en el servidor con el mismo esquema que en el formulario: se recortan los espacios, un valor vacío se guarda como "sin dato" y un valor demasiado largo se rechaza con un mensaje junto al campo.

**Descripción de los servicios**
- **FR-016**: Cada servicio DEBE poder tener una descripción opcional (máximo 200 caracteres), en texto plano, editable en el formulario de servicios del panel con las mismas reglas de FR-015.

**Datos de demostración**
- **FR-017**: Los datos de demostración locales DEBEN incluir descripción y dirección para al menos una barbería y descripción para sus servicios, para enseñar la portada completa.

### Entidades clave

- **Barbería**: gana dos datos opcionales visibles para el público: descripción corta y dirección. El resto (nombre, subdominio, zona horaria, estado) no cambia y sigue sin poder editarse desde el panel.
- **Servicio**: gana una descripción corta opcional.
- **Horario semanal de los barberos** (ya existe): se reutiliza para calcular el horario de la barbería; no se guarda un horario de la barbería aparte.

## Criterios de éxito

### Resultados medibles

- **SC-001**: Desde la portada, el cliente llega a elegir barbero con un solo toque (antes, dos: entrar a la reserva y elegir servicio).
- **SC-002**: El 100 % de las páginas públicas y del panel pasan el escaneo de accesibilidad automático sin violaciones, también en ancho de celular.
- **SC-003**: Un admin cambia la descripción y la dirección de su barbería en menos de un minuto, y el cambio se ve al recargar la portada.
- **SC-004**: Ningún intento de modificar datos de otra barbería, o datos de la propia que no sean descripción y dirección, tiene efecto (comprobado por tests de aislamiento con la conexión real de la app).
- **SC-005**: La portada se muestra completa sin esperas apreciables: su tiempo de respuesta en local no supera en más de un 10 % al de la página de reserva actual.
- **SC-006**: El horario y el estado de apertura coinciden con los horarios de los barberos en todos los casos probados, incluidos los cambios de día en la zona horaria de la barbería.

## Supuestos

- Un solo tema oscuro para toda la app, sin selector claro/oscuro (decisión del usuario, `DESIGN.md` 0.2.0).
- Sin fotos, logo, reseñas, estrellas, "lo más pedido" ni primera hora libre en la portada: quedan fuera de esta spec (Roadmap). La portada usa la textura de `DESIGN.md` en lugar de foto.
- El horario de la barbería se deriva de los horarios de los barberos; los bloqueos puntuales no lo cambian. Si en el futuro una barbería necesita un horario propio distinto, será otra spec.
- El estado de apertura se calcula al cargar la página; no se actualiza solo si el cliente la deja abierta.
- La dirección es un dato público del negocio, no un dato personal; se puede mostrar sin consentimiento.
- La ruta de la reserva no cambia; "Reservar" en un servicio usa el mismo mecanismo que hoy permite entrar con el servicio ya elegido.
- Los límites de longitud (160, 200 y 200 caracteres) son razonables para una línea en el celular; se pueden ajustar en el plan si el diseño lo pide.
- El cambio de permisos (el admin puede modificar dos campos de su barbería) es el único cambio de seguridad; pasa por tests de aislamiento y por la revisión de los tres agentes (hito de modelo de datos y RLS).
