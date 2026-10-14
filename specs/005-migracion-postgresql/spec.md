# Spec: migración de Supabase a PostgreSQL propio

**Rama**: `005-migracion-postgresql` | **Fecha**: 2026-10-13 | **Estado**: borrador, pendiente de aprobación del usuario

**Entrada**: `Decisiones/ADR-017-postgresql-propio-sin-supabase.md` del vault (vigente desde 2026-10-13) y constitución 1.2.0. La fase 7 (despliegue de pruebas) espera a que esta migración termine.

**Naturaleza**: es una migración de infraestructura. El "qué" lo fija el ADR-017 (base propia, roles, permisos mínimos e identidad por transacción), y por eso esta spec nombra roles y mecanismos de seguridad: son requisitos, no detalles de implementación. Versiones, librerías concretas y estructura de archivos van al plan.

## Historias de usuario

### Historia 1 - Nada cambia para el cliente final (Prioridad: P1)

El cliente entra en `<barberia>.dominio/reservar`, elige servicio, barbero, fecha y hora, deja sus datos, recibe el correo de confirmación y puede cancelar con el enlace. Todo funciona igual que antes de la migración: mismos pasos, mismos textos y mismos mensajes de error ("esa hora ya no está disponible", "ya tienes 2 citas activas", "este enlace no es válido").

**Por qué esta prioridad**: la reserva pública es el producto. Una migración que la rompa no aporta nada.

**Prueba independiente**: ejecutar los tests E2E de reserva y cancelación, y los de integración de reserva, doble reserva, tope por teléfono y cancelación, contra la base nueva sin cambiar sus expectativas.

**Escenarios**:
1. **Dado** una barbería activa con barberos, servicios y horario, **cuando** el cliente reserva una hora libre, **entonces** la cita queda confirmada, se envía el correo y la hora deja de estar disponible.
2. **Dado** dos reservas simultáneas de la misma hora con el mismo barbero, **cuando** ambas se envían, **entonces** solo una se confirma y la otra ve el mensaje de hora ocupada.
3. **Dado** un número con 2 citas activas, **cuando** intenta una tercera, **entonces** ve el mensaje del tope, igual que hoy.
4. **Dado** un enlace de cancelación válido, **cuando** abre el enlace y pulsa "Cancelar cita", **entonces** la cita se cancela una sola vez y la hora vuelve a estar libre.
5. **Dado** un subdominio inexistente o una barbería desactivada, **cuando** se visita, **entonces** se ve "Barbería no encontrada" (404).

### Historia 2 - El admin entra y gestiona su barbería igual que hoy (Prioridad: P1)

El admin abre `<barberia>.dominio/admin/login`, entra con su correo y contraseña, ve la agenda, gestiona barberos, servicios, horarios y bloqueos, cancela citas y cierra sesión. La experiencia es la misma; lo que cambia es el sistema de login que hay detrás.

**Por qué esta prioridad**: sin login no hay panel, y el login es lo que más cambia en la migración.

**Prueba independiente**: test E2E de la agenda e integración del panel con un admin creado con el script de alta.

**Escenarios**:
1. **Dado** un admin con perfil en la barbería A, **cuando** entra con credenciales correctas en el subdominio de A, **entonces** llega a la agenda de A.
2. **Dado** credenciales incorrectas, **cuando** intenta entrar, **entonces** ve un mensaje genérico que no revela si el correo existe.
3. **Dado** un admin de A, **cuando** intenta entrar en el subdominio de B, **entonces** no accede al panel de B.
4. **Dado** muchos intentos fallidos seguidos desde la misma IP, **cuando** sigue intentando, **entonces** el sistema rechaza temporalmente los intentos, aunque la app tenga varias instancias o se reinicie.
5. **Dado** un admin con sesión, **cuando** cierra sesión, **entonces** la sesión deja de valer también en el servidor.
6. **Dado** una sesión caducada, borrada en el servidor o de una barbería desactivada, **cuando** pide una página del panel, **entonces** se le manda al login.
7. **Dado** cualquier persona, **cuando** intenta registrarse por la API de login, **entonces** recibe un error 4xx: no hay registro abierto.

### Historia 3 - Una barbería nunca ve datos de otra (Prioridad: P1)

Ninguna operación del panel ni de la web pública permite leer o modificar datos de otra barbería, aunque se cambie un id, un parámetro o el subdominio. El aislamiento lo sigue garantizando la base de datos y no depende de que cada consulta del código filtre bien.

**Por qué esta prioridad**: es el peor error posible del producto (constitución, principio I), y la migración cambia justo el mecanismo que lo protege.

**Prueba independiente**: los tests obligatorios del ADR-017 (lista en FR-020).

**Escenarios**:
1. **Dado** un admin de A, **cuando** cualquiera de las 15 operaciones del panel recibe un id de B, **entonces** obtiene 0 filas o 0 filas afectadas.
2. **Dado** una conexión del pool usada por el admin de A, **cuando** la reutiliza la siguiente petición, **entonces** no hereda la identidad de A.
3. **Dado** la conexión de la app, **cuando** consulta una tabla sin pasar por la capa de identidad, **entonces** no ve filas o recibe un error de permisos.
4. **Dado** un usuario sin perfil, **cuando** entra, **entonces** no ve datos de ninguna barbería.

### Historia 4 - El dueño de la plataforma opera la base (Prioridad: P2)

El dueño de la plataforma levanta la base en local con un comando, aplica migraciones, carga los datos de demostración, ejecuta los tests y da de alta barberías con el script. En el VPS, cada entorno (pruebas y, más adelante, producción) tiene su propia base aislada.

**Por qué esta prioridad**: hace falta para desarrollar y para la fase 7, pero no lo ve ningún cliente.

**Prueba independiente**: desde una base vacía, levantar, migrar, cargar el seed y pasar todos los tests; luego crear una barbería con el script y entrar con el admin creado.

**Escenarios**:
1. **Dado** Docker en marcha, **cuando** ejecuta el comando de arranque y el de recrear la base, **entonces** obtiene una base con todas las migraciones y los datos de demostración.
2. **Dado** el script de alta, **cuando** crea una barbería con su admin, **entonces** muestra la contraseña una sola vez y el admin puede entrar.
3. **Dado** un entorno que no es local, **cuando** se intenta cargar el seed de demostración o ejecutar los tests, **entonces** el comando se niega.
4. **Dado** un rol de conexión de la app con permisos de más (superusuario, BYPASSRLS, dueño de tablas o membresía con herencia), **cuando** arranca la app, **entonces** se niega a arrancar y explica el motivo sin mostrar secretos.

### Casos límite

- **Pérdida de los datos actuales**: solo hay datos de demostración (riesgo R27). No se migran datos ni usuarios. Las bases nuevas parten del esquema base y, en local, del seed.
- **Bloqueo prolongado**: si una transacción retiene el candado del tope por teléfono, la segunda reserva falla en un tiempo acotado con el mensaje de error del servidor, no se queda colgada.
- **Interbloqueo (40P01)**: se reintenta una vez, como hoy.
- **Error de la base con datos personales en el detalle**: nunca llega a los logs ni al usuario. Se registra solo el código y la restricción.
- **Base caída o pool agotado**: el cliente ve el mensaje genérico de error del servidor y la app no se queda colgada más allá del tiempo máximo.
- **Formatos**: fechas, precios, horas del horario y hash del token se leen igual que hoy (riesgo R7). La agenda ordena bien, los precios se muestran bien y la búsqueda por token funciona.
- **Sesiones caducadas acumuladas**: se limpian para que la tabla no crezca sin límite.
- **Cambio de contraseña de un rol**: se puede rotar sin recrear la base.

## Requisitos

### Funcionales

**Paridad**
- **FR-001**: Todas las funcionalidades del MVP terminadas en las fases 0–6 DEBEN comportarse igual tras la migración: reserva pública, correo de confirmación, cancelación con enlace, login y panel del admin, agenda y script de alta. Mismos textos, mismas reglas y mismos mensajes de error.
- **FR-002**: Las restricciones de integridad actuales DEBEN mantenerse en la base: no solapar citas por barbero (las canceladas no bloquean), tope de 2 citas activas por número y barbería con candado, zona horaria válida, claves foráneas y comprobaciones de valores. Las citas canceladas no bloquean el horario.
- **FR-003**: Los tests de base de datos DEBEN conservar como mínimo la cobertura actual (224 asserts). Se comprueba con el recuento antes y después, asignando cada assert antiguo a uno nuevo o justificando por qué desaparece.

**Base de datos y entornos**
- **FR-004**: Cada entorno (local, pruebas y, en el futuro, producción) DEBE tener su propia base PostgreSQL 17 en un contenedor, con su volumen, su red interna y sus credenciales. Nunca se comparte una base entre pruebas y producción.
- **FR-005**: La base NO DEBE ser accesible desde fuera del servidor: sin puerto publicado, sin autenticación `trust` y con la conexión restringida a los roles autorizados.
- **FR-006**: Los logs del servidor de base de datos NO DEBEN contener valores de filas ni parámetros.
- **FR-007**: El esquema DEBE definirse solo con migraciones SQL versionadas, empezando por una migración base única que sustituye a las seis de Supabase (la excepción única de la constitución). El esquema tipado que usa el código se genera desde la base y no se edita a mano.
- **FR-008**: Los datos de demostración DEBEN cargarse solo en local. El seed y los tests se niegan a correr contra otro entorno.

**Roles, permisos e identidad**
- **FR-009**: Los roles DEBEN seguir la matriz del ADR-017: `postgres` (solo inicialización), `db_owner` (dueño del esquema, migraciones y script de alta), `db_backup` (solo lectura para respaldos), `app_login` (conexión de la app), `authenticated`, `service_role` y `auth_login` (login). Su creación es repetible e idempotente, y las contraseñas llegan por archivo, nunca escritas en el repositorio ni visibles en el entorno de los contenedores.
- **FR-010**: La conexión de la app NO DEBE ser superusuario, ni tener BYPASSRLS, ni ser dueña de objetos, ni tener privilegios propios. Solo puede pasar a `authenticated` o a `service_role` dentro de una transacción.
- **FR-011**: Cada rol DEBE tener exactamente los privilegios que usa el código, por tabla, operación y, donde aplique, columna. `service_role` no tiene ningún privilegio sobre `profiles` ni escritura en `barbershops`. Ningún rol de la app tiene `TRUNCATE`, `TRIGGER` ni `REFERENCES`.
- **FR-012**: La identidad del admin DEBE fijarse solo dentro de una transacción, a partir de la sesión verificada en el servidor y por una única función de la capa de datos. Las políticas de aislamiento la leen con una función propia que sustituye a `auth.uid()`.
- **FR-013**: El código del panel NO DEBE poder usar el acceso que se salta RLS. El acceso que se salta RLS (rutas públicas) DEBE filtrar siempre por la barbería resuelta del Host.
- **FR-014**: Al arrancar, la app DEBE comprobar sus roles y negarse a arrancar si la conexión de la app o la del login incumplen FR-009/FR-010, o si la propia comprobación falla.
- **FR-015**: Las transacciones de la capa de datos DEBEN contener solo SQL: el correo y cualquier otra E/S externa quedan fuera. Las consultas y los bloqueos tienen un tiempo máximo.

**Login del admin**
- **FR-016**: El login DEBE ser con correo y contraseña, sin registro abierto (ni por la interfaz ni por la API). Los usuarios solo los crea el script de alta ejecutado por el dueño de la plataforma.
- **FR-017**: Las tablas del login DEBEN vivir en un esquema propio, inaccesible para `authenticated` y `service_role`, y el perfil del admin DEBE seguir enlazado a su usuario con borrado en cascada.
- **FR-018**: La cookie de sesión DEBE ser solo del subdominio (no compartida entre barberías), `HttpOnly`, `Secure` (salvo en local) y `SameSite=Lax`. La sesión se verifica contra la base en cada petición del panel.
- **FR-019**: El login DEBE limitar los intentos fallidos guardando el contador en la base y usando la IP que fija el proxy de confianza, nunca una cabecera que pueda enviar el cliente.

**Pruebas obligatorias (ADR-017)**
- **FR-020**: DEBEN existir y pasar estos tests:
  1. Estructural: matriz de roles completa y privilegios exactos por rol y tabla, `CONNECT` revocado a PUBLIC y `db_backup` sin escritura.
  2. Aislamiento con la conexión real de la app en las 15 operaciones del panel.
  3. Pool: no se comparte identidad entre transacciones ni peticiones.
  4. Consulta sin la capa de identidad: 0 filas o error de permisos.
  5. Sin perfil o con barbería desactivada: no ve nada.
  6. Equivalencia de asserts (FR-003).
  7. Tiempo máximo con el candado del tope por teléfono retenido.
  8. Registro cerrado (4xx).
  9. Formatos de fecha, número, hora y hash del token.
  10. Traducción de errores de la base por nombre de restricción.
- **FR-021**: Los errores de la base DEBEN traducirse en un único lugar a un código y una restricción, sin pasar el error crudo a los logs.

**Operación**
- **FR-022**: Los comandos del proyecto (arrancar la base, recrearla, generar tipos, tests de base de datos e integración, alta de barbería) DEBEN seguir existiendo con la base nueva y documentarse en `CLAUDE.md`. Desaparecen las dependencias de Supabase (CLI, clientes y variables).
- **FR-023**: Antes de migrar DEBE medirse el TTFB de `/reservar` y `/admin` en local, y otra vez después, para compararlos.
- **FR-024**: La documentación (`CLAUDE.md`, ADR afectados marcados como "modificado por ADR-017", `Arquitectura/`, `Roadmap.md`, `Plan-de-ejecucion.md`) DEBE reflejar el sistema nuevo al cerrar la migración.

### Fuera de alcance
- Respaldos automáticos cifrados y su prueba de restauración: se definen en el ADR-017 y se implementan en la fase 7 o antes del primer cliente (RPO/RTO por decidir).
- Despliegue en el VPS (fase 7).
- Funcionalidades nuevas: reagendar, recordatorios, tareas programadas, login de barberos y Turnstile siguen en `Roadmap.md`.
- Migrar datos o usuarios existentes (solo hay demostración).

### Entidades clave
- **Rol de base de datos**: identidad con la que se conecta o actúa un proceso. Tiene atributos (login, salto de RLS, propiedad) y privilegios por tabla.
- **Usuario de login**: credenciales del admin y sus sesiones, en un esquema separado del negocio.
- **Perfil**: une un usuario de login con una barbería y un rol de negocio (`admin`, `super_admin`). No cambia.
- **Tablas de negocio** (`barbershops`, `barbers`, `services`, `barber_schedules`, `barber_blocks`, `appointments`): mismo esquema y mismas políticas, con la identidad leída del nuevo mecanismo.

## Criterios de éxito

- **SC-001**: El 100 % de los tests E2E, unitarios y de integración que hoy pasan siguen pasando sin cambiar lo que comprueban (solo cómo preparan los datos).
- **SC-002**: Los tests de base de datos tienen al menos los 224 asserts actuales, más los nuevos de FR-020, y todos pasan.
- **SC-003**: Ninguna de las 15 operaciones del panel devuelve ni modifica datos de otra barbería en las pruebas de aislamiento con la conexión real de la app (0 fugas).
- **SC-004**: Una cliente completa una reserva en el mismo número de pasos y con los mismos textos que antes de la migración.
- **SC-005**: El TTFB de `/reservar` y `/admin` en local no empeora más de un 10 % respecto a la medición previa. En el VPS se espera que mejore (estimación del ADR: 15–75 ms).
- **SC-006**: Con un rol de conexión mal configurado, la app no arranca en el 100 % de los casos probados.
- **SC-007**: El repositorio no contiene ninguna dependencia, variable ni carpeta de Supabase al cerrar la migración.

## Supuestos

- **VPS de 4 GB de RAM** (confirmado por el usuario el 2026-10-13): `shared_buffers` 512 MB, `effective_cache_size` ≈ 2 GB, `max_connections` 40 y `mem_limit` para `app`.
- Solo hay datos de demostración; las contraseñas de demostración del seed local pueden cambiar.
- El nombre de los roles `authenticated` y `service_role` se conserva a propósito para que las políticas cambien lo mínimo.
- Los riesgos aceptados del ADR-017 (las 15 operaciones del panel sin filtro por barbería en el código) siguen aceptados, cubiertos por FR-010–FR-014 y FR-020.
- Las versiones exactas, los avisos de seguridad y los puntos marcados POR VERIFICAR en el ADR-017 se resuelven en el plan antes de instalar nada:
  - cómo se crean usuarios sin abrir el registro;
  - ids `uuid`;
  - si el token de sesión se guarda en claro;
  - límite de intentos en la base;
  - formato de dbmate;
  - soporte de `drizzle-kit pull` para exclusiones, permisos y políticas.
- Las specs 001–004 quedan como históricas y no se actualizan.
