# Equivalencia de asserts pgTAP (spec 005, FR-003 y test obligatorio 6)

Origen: `npx supabase test db` el 2026-10-13 (commit `372d84a`): **224 asserts**, todos en verde.

| Archivo | Asserts |
|---|---|
| 00_helpers.test.sql | 29 |
| 01_isolation.test.sql | 131 |
| 02_overlap.test.sql | 7 |
| 03_timezone.test.sql | 7 |
| 04_constraints.test.sql | 34 |
| 05_phone_limit.test.sql | 8 |
| 06_cancel_token.test.sql | 8 |

## Asserts de origen

La columna **Destino** se completa en T012 (agente `database`): archivo y descripción del assert nuevo, o la justificación si cambia de significado.

### 00_helpers.test.sql

| # | Descripción | Destino |
|---|---|---|
| 1 | el catálogo de public tiene al menos las 7 tablas de la fase 1 | 00_structure.test.sql: idéntico (mismo texto y significado) |
| 2 | RLS activo en appointments | 00_structure.test.sql: idéntico (mismo texto y significado) |
| 3 | RLS activo en barber_blocks | 00_structure.test.sql: idéntico (mismo texto y significado) |
| 4 | RLS activo en barber_schedules | 00_structure.test.sql: idéntico (mismo texto y significado) |
| 5 | RLS activo en barbers | 00_structure.test.sql: idéntico (mismo texto y significado) |
| 6 | RLS activo en barbershops | 00_structure.test.sql: idéntico (mismo texto y significado) |
| 7 | RLS activo en profiles | 00_structure.test.sql: idéntico (mismo texto y significado) |
| 8 | RLS activo en services | 00_structure.test.sql: idéntico (mismo texto y significado) |
| 9 | anon sin privilegios en appointments | 00_structure.test.sql: **cambia**: `anon` ya no existe; se sustituye por `hasnt_role('anon')` y por `table_privs_are` exacto de `authenticated` y `service_role` en la tabla ("<rol>: privilegios de tabla exactos en <tabla>") |
| 10 | anon sin privilegios en barber_blocks | 00_structure.test.sql: **cambia**: `anon` ya no existe; se sustituye por `hasnt_role('anon')` y por `table_privs_are` exacto de `authenticated` y `service_role` en la tabla ("<rol>: privilegios de tabla exactos en <tabla>") |
| 11 | anon sin privilegios en barber_schedules | 00_structure.test.sql: **cambia**: `anon` ya no existe; se sustituye por `hasnt_role('anon')` y por `table_privs_are` exacto de `authenticated` y `service_role` en la tabla ("<rol>: privilegios de tabla exactos en <tabla>") |
| 12 | anon sin privilegios en barbers | 00_structure.test.sql: **cambia**: `anon` ya no existe; se sustituye por `hasnt_role('anon')` y por `table_privs_are` exacto de `authenticated` y `service_role` en la tabla ("<rol>: privilegios de tabla exactos en <tabla>") |
| 13 | anon sin privilegios en barbershops | 00_structure.test.sql: **cambia**: `anon` ya no existe; se sustituye por `hasnt_role('anon')` y por `table_privs_are` exacto de `authenticated` y `service_role` en la tabla ("<rol>: privilegios de tabla exactos en <tabla>") |
| 14 | anon sin privilegios en profiles | 00_structure.test.sql: **cambia**: `anon` ya no existe; se sustituye por `hasnt_role('anon')` y por `table_privs_are` exacto de `authenticated` y `service_role` en la tabla ("<rol>: privilegios de tabla exactos en <tabla>") |
| 15 | anon sin privilegios en services | 00_structure.test.sql: **cambia**: `anon` ya no existe; se sustituye por `hasnt_role('anon')` y por `table_privs_are` exacto de `authenticated` y `service_role` en la tabla ("<rol>: privilegios de tabla exactos en <tabla>") |
| 16 | authenticated sin TRUNCATE, TRIGGER ni REFERENCES en appointments | 00_structure.test.sql: "authenticated y service_role sin TRUNCATE, TRIGGER ni REFERENCES en <tabla>" (mismo assert, ampliado a service_role) |
| 17 | authenticated sin TRUNCATE, TRIGGER ni REFERENCES en barber_blocks | 00_structure.test.sql: "authenticated y service_role sin TRUNCATE, TRIGGER ni REFERENCES en <tabla>" (mismo assert, ampliado a service_role) |
| 18 | authenticated sin TRUNCATE, TRIGGER ni REFERENCES en barber_schedules | 00_structure.test.sql: "authenticated y service_role sin TRUNCATE, TRIGGER ni REFERENCES en <tabla>" (mismo assert, ampliado a service_role) |
| 19 | authenticated sin TRUNCATE, TRIGGER ni REFERENCES en barbers | 00_structure.test.sql: "authenticated y service_role sin TRUNCATE, TRIGGER ni REFERENCES en <tabla>" (mismo assert, ampliado a service_role) |
| 20 | authenticated sin TRUNCATE, TRIGGER ni REFERENCES en barbershops | 00_structure.test.sql: "authenticated y service_role sin TRUNCATE, TRIGGER ni REFERENCES en <tabla>" (mismo assert, ampliado a service_role) |
| 21 | authenticated sin TRUNCATE, TRIGGER ni REFERENCES en profiles | 00_structure.test.sql: "authenticated y service_role sin TRUNCATE, TRIGGER ni REFERENCES en <tabla>" (mismo assert, ampliado a service_role) |
| 22 | authenticated sin TRUNCATE, TRIGGER ni REFERENCES en services | 00_structure.test.sql: "authenticated y service_role sin TRUNCATE, TRIGGER ni REFERENCES en <tabla>" (mismo assert, ampliado a service_role) |
| 23 | authenticated sin UPDATE de tabla completa en appointments | 00_structure.test.sql: "authenticated sin UPDATE de tabla completa en appointments" (idéntico; y el equivalente para service_role) |
| 24 | authenticated solo puede actualizar appointments.status y appointments.cancelled_at | 00_structure.test.sql: "authenticated: columnas actualizables exactas en appointments" (mismo significado, ahora en la matriz de columnas por rol y tabla) |
| 25 | anon no ejecuta private.current_barbershop_id() | 00_structure.test.sql: **cambia**: sin `anon`, se comprueba el EXECUTE exacto: "authenticated solo ejecuta current_user_id, current_barbershop_id e is_super_admin", "service_role no ejecuta ninguna función de private" y "app_login ... no ejecuta ninguna función de private" |
| 26 | anon no ejecuta private.is_super_admin() | 00_structure.test.sql: **cambia**: sin `anon`, se comprueba el EXECUTE exacto: "authenticated solo ejecuta current_user_id, current_barbershop_id e is_super_admin", "service_role no ejecuta ninguna función de private" y "app_login ... no ejecuta ninguna función de private" |
| 27 | anon no ejecuta private.is_valid_timezone(text) | 00_structure.test.sql: **cambia**: "PUBLIC no ejecuta private.is_valid_timezone(text)" (y authenticated tampoco, por el assert de EXECUTE exacto) |
| 28 | funciones security definer con search_path vacío | 00_structure.test.sql: idéntico (mismo texto y significado) |
| 29 | función del trigger de citas: security invoker y search_path vacío | 00_structure.test.sql: idéntico (mismo texto y significado) |

### 01_isolation.test.sql

| # | Descripción | Destino |
|---|---|---|
| 1 | admin A: solo ve su barbería | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 2 | admin A: no crea barberías | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 3 | admin A: no modifica la barbería B | 01_isolation.test.sql: **cambia a 42501 por privilegio** (barbershops sin UPDATE para authenticated); antes 0 filas por RLS |
| 4 | admin A: no modifica su propia barbería (solo super admin) | 01_isolation.test.sql: **cambia a 42501 por privilegio** (barbershops sin UPDATE; texto: "solo db_owner por script"); antes 0 filas por RLS |
| 5 | admin A: no borra la barbería B | 01_isolation.test.sql: **cambia a 42501 por privilegio** (barbershops sin DELETE); antes 0 filas por RLS |
| 6 | admin A: solo ve su propio perfil | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 7 | admin A: no puede subirse a super admin | 01_isolation.test.sql: **cambia a 42501 por privilegio** (profiles sin UPDATE); antes 0 filas por RLS |
| 8 | admin A: no puede cambiarse de barbería | 01_isolation.test.sql: **cambia a 42501 por privilegio** (profiles sin UPDATE); antes 0 filas por RLS |
| 9 | admin A: no crea perfiles | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 10 | admin A: no borra perfiles | 01_isolation.test.sql: **cambia a 42501 por privilegio** (profiles sin DELETE); antes 0 filas por RLS |
| 11 | admin A: solo ve sus barberos | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 12 | admin A: crea barberos en su barbería | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 13 | admin A: no crea barberos en B | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 14 | admin A: no modifica barberos de B (con su id) | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 15 | admin A: no mueve un barbero a B | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 16 | admin A: no borra barberos de B | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 17 | admin A: solo ve sus servicios | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 18 | admin A: no crea servicios en B | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 19 | admin A: no modifica servicios de B | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 20 | admin A: no mueve un servicio a B | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 21 | admin A: no borra servicios de B | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 22 | admin A: solo ve sus horarios | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 23 | admin A: no crea horarios en B | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 24 | admin A: no crea un horario en A para un barbero de B (FK compuesta) | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 25 | admin A: no modifica horarios de B | 01_isolation.test.sql: **cambia a 42501 por privilegio** (barber_schedules sin UPDATE); antes 0 filas por RLS |
| 26 | admin A: no mueve un horario a B | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 27 | admin A: no borra horarios de B | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 28 | admin A: solo ve sus bloqueos | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 29 | admin A: no crea bloqueos en B | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 30 | admin A: no crea un bloqueo en A para un barbero de B (FK compuesta) | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 31 | admin A: no modifica bloqueos de B | 01_isolation.test.sql: **cambia a 42501 por privilegio** (barber_blocks sin UPDATE); antes 0 filas por RLS |
| 32 | admin A: no mueve un bloqueo a B | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 33 | admin A: no borra bloqueos de B | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 34 | admin A: solo ve sus citas | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 35 | admin A: no crea citas (las crea el servidor) | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 36 | admin A: no cancela citas de B | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 37 | admin A: no modifica appointments.data_consent_at de su cita | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 38 | admin A: no modifica appointments.customer_phone de su cita | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 39 | admin A: no modifica appointments.customer_name de su cita | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 40 | admin A: no modifica appointments.customer_email de su cita | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 41 | admin A: no modifica appointments.service_price de su cita | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 42 | admin A: no modifica appointments.service_duration_minutes de su cita | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 43 | admin A: no modifica appointments.starts_at de su cita | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 44 | admin A: no modifica appointments.ends_at de su cita | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 45 | admin A: no modifica appointments.barber_id de su cita | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 46 | admin A: no modifica appointments.service_id de su cita | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 47 | admin A: no mueve una cita a B | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 48 | admin A: no borra citas, ni las propias | 01_isolation.test.sql: **cambia a 42501 por privilegio** (appointments sin DELETE); antes 0 filas por RLS |
| 49 | admin A: no borra citas de B | 01_isolation.test.sql: **cambia a 42501 por privilegio** (appointments sin DELETE); antes 0 filas por RLS |
| 50 | admin A: cancela citas de su barbería | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 51 | admin A: no reactiva una cita cancelada | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 52 | sin perfil: no ve barberías | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 53 | sin perfil: no ve perfiles | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 54 | sin perfil: no lee appointments | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 55 | sin perfil: no lee barber_blocks | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 56 | sin perfil: no lee barber_schedules | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 57 | sin perfil: no lee barbers | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 58 | sin perfil: no lee services | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 59 | sin perfil: no inserta en appointments | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 60 | sin perfil: no inserta en barber_blocks | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 61 | sin perfil: no inserta en barber_schedules | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 62 | sin perfil: no inserta en barbers | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 63 | sin perfil: no inserta en services | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 64 | sin perfil: UPDATE en appointments afecta 0 filas | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 65 | sin perfil: UPDATE en barber_blocks afecta 0 filas | 01_isolation.test.sql: **cambia a 42501 por privilegio** (barber_blocks sin UPDATE; assert "sin perfil: UPDATE en barber_blocks denegado por privilegio"); antes 0 filas por RLS |
| 66 | sin perfil: UPDATE en barber_schedules afecta 0 filas | 01_isolation.test.sql: **cambia a 42501 por privilegio** (barber_schedules sin UPDATE; assert "sin perfil: UPDATE en barber_schedules denegado por privilegio"); antes 0 filas por RLS |
| 67 | sin perfil: UPDATE en barbers afecta 0 filas | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 68 | sin perfil: UPDATE en services afecta 0 filas | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 69 | sin perfil: DELETE en appointments afecta 0 filas | 01_isolation.test.sql: **cambia a 42501 por privilegio** (appointments sin DELETE; assert "sin perfil: DELETE en appointments denegado por privilegio"); antes 0 filas por RLS |
| 70 | sin perfil: DELETE en barber_blocks afecta 0 filas | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 71 | sin perfil: DELETE en barber_schedules afecta 0 filas | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 72 | sin perfil: DELETE en barbers afecta 0 filas | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 73 | sin perfil: DELETE en services afecta 0 filas | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 74 | anon: no lee barbershops | 01_isolation.test.sql: **cambia**: `anon` no existe; el mismo assert con `app_login` sin rol de trabajo ("app_login sin rol de trabajo: ...", 42501) |
| 75 | anon: no lee profiles | 01_isolation.test.sql: **cambia**: `anon` no existe; el mismo assert con `app_login` sin rol de trabajo ("app_login sin rol de trabajo: ...", 42501) |
| 76 | anon: no lee barbers | 01_isolation.test.sql: **cambia**: `anon` no existe; el mismo assert con `app_login` sin rol de trabajo ("app_login sin rol de trabajo: ...", 42501) |
| 77 | anon: no lee services | 01_isolation.test.sql: **cambia**: `anon` no existe; el mismo assert con `app_login` sin rol de trabajo ("app_login sin rol de trabajo: ...", 42501) |
| 78 | anon: no lee barber_schedules | 01_isolation.test.sql: **cambia**: `anon` no existe; el mismo assert con `app_login` sin rol de trabajo ("app_login sin rol de trabajo: ...", 42501) |
| 79 | anon: no lee barber_blocks | 01_isolation.test.sql: **cambia**: `anon` no existe; el mismo assert con `app_login` sin rol de trabajo ("app_login sin rol de trabajo: ...", 42501) |
| 80 | anon: no lee appointments | 01_isolation.test.sql: **cambia**: `anon` no existe; el mismo assert con `app_login` sin rol de trabajo ("app_login sin rol de trabajo: ...", 42501) |
| 81 | anon: no modifica appointments | 01_isolation.test.sql: **cambia**: `anon` no existe; el mismo assert con `app_login` sin rol de trabajo ("app_login sin rol de trabajo: ...", 42501) |
| 82 | super admin: ve todas las barberías | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 83 | super admin: da de alta barberías | 01_isolation.test.sql: **cambia de significado**: el super admin ya no escribe barberías con sesión (las escribe db_owner por script); espera 42501 ("super admin: no da de alta / no modifica / no borra barberías con sesión") |
| 84 | super admin: modifica barberías | 01_isolation.test.sql: **cambia de significado**: el super admin ya no escribe barberías con sesión (las escribe db_owner por script); espera 42501 ("super admin: no da de alta / no modifica / no borra barberías con sesión") |
| 85 | super admin: borra barberías | 01_isolation.test.sql: **cambia de significado**: el super admin ya no escribe barberías con sesión (las escribe db_owner por script); espera 42501 ("super admin: no da de alta / no modifica / no borra barberías con sesión") |
| 86 | super admin: ve todos los perfiles | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 87 | super admin: tampoco modifica perfiles con sesión | 01_isolation.test.sql: **cambia a 42501 por privilegio** (profiles sin UPDATE); antes 0 filas por RLS |
| 88 | super admin: no lee appointments | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 89 | super admin: no lee barber_blocks | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 90 | super admin: no lee barber_schedules | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 91 | super admin: no lee barbers | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 92 | super admin: no lee services | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 93 | super admin: no inserta en appointments | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 94 | super admin: no inserta en barber_blocks | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 95 | super admin: no inserta en barber_schedules | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 96 | super admin: no inserta en barbers | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 97 | super admin: no inserta en services | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 98 | super admin: UPDATE en appointments afecta 0 filas | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 99 | super admin: UPDATE en barber_blocks afecta 0 filas | 01_isolation.test.sql: **cambia a 42501 por privilegio** (barber_blocks sin UPDATE; assert "super admin: UPDATE en barber_blocks denegado por privilegio"); antes 0 filas por RLS |
| 100 | super admin: UPDATE en barber_schedules afecta 0 filas | 01_isolation.test.sql: **cambia a 42501 por privilegio** (barber_schedules sin UPDATE; assert "super admin: UPDATE en barber_schedules denegado por privilegio"); antes 0 filas por RLS |
| 101 | super admin: UPDATE en barbers afecta 0 filas | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 102 | super admin: UPDATE en services afecta 0 filas | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 103 | super admin: DELETE en appointments afecta 0 filas | 01_isolation.test.sql: **cambia a 42501 por privilegio** (appointments sin DELETE; assert "super admin: DELETE en appointments denegado por privilegio"); antes 0 filas por RLS |
| 104 | super admin: DELETE en barber_blocks afecta 0 filas | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 105 | super admin: DELETE en barber_schedules afecta 0 filas | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 106 | super admin: DELETE en barbers afecta 0 filas | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 107 | super admin: DELETE en services afecta 0 filas | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 108 | postgres: tampoco reactiva una cita cancelada | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 109 | admin de barbería desactivada: no ve su barbería | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 110 | admin de barbería desactivada: no lee appointments | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 111 | admin de barbería desactivada: no lee barber_blocks | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 112 | admin de barbería desactivada: no lee barber_schedules | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 113 | admin de barbería desactivada: no lee barbers | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 114 | admin de barbería desactivada: no lee services | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 115 | admin de barbería desactivada: no inserta en appointments | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 116 | admin de barbería desactivada: no inserta en barber_blocks | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 117 | admin de barbería desactivada: no inserta en barber_schedules | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 118 | admin de barbería desactivada: no inserta en barbers | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 119 | admin de barbería desactivada: no inserta en services | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 120 | admin de barbería desactivada: UPDATE en appointments afecta 0 filas | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 121 | admin de barbería desactivada: UPDATE en barber_blocks afecta 0 filas | 01_isolation.test.sql: **cambia a 42501 por privilegio** (barber_blocks sin UPDATE; assert "admin de barbería desactivada: UPDATE en barber_blocks denegado por privilegio"); antes 0 filas por RLS |
| 122 | admin de barbería desactivada: UPDATE en barber_schedules afecta 0 filas | 01_isolation.test.sql: **cambia a 42501 por privilegio** (barber_schedules sin UPDATE; assert "admin de barbería desactivada: UPDATE en barber_schedules denegado por privilegio"); antes 0 filas por RLS |
| 123 | admin de barbería desactivada: UPDATE en barbers afecta 0 filas | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 124 | admin de barbería desactivada: UPDATE en services afecta 0 filas | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 125 | admin de barbería desactivada: DELETE en appointments afecta 0 filas | 01_isolation.test.sql: **cambia a 42501 por privilegio** (appointments sin DELETE; assert "admin de barbería desactivada: DELETE en appointments denegado por privilegio"); antes 0 filas por RLS |
| 126 | admin de barbería desactivada: DELETE en barber_blocks afecta 0 filas | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 127 | admin de barbería desactivada: DELETE en barber_schedules afecta 0 filas | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 128 | admin de barbería desactivada: DELETE en barbers afecta 0 filas | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 129 | admin de barbería desactivada: DELETE en services afecta 0 filas | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 130 | super admin: sigue viendo la barbería desactivada | 01_isolation.test.sql: idéntico (mismo texto y significado) |
| 131 | los datos de B, el perfil de A y la cita cancelada de A no cambiaron | 01_isolation.test.sql: idéntico (mismo texto y significado) |

### 02_overlap.test.sql

| # | Descripción | Destino |
|---|---|---|
| 1 | cita base 10:00–10:30 con X | 02_overlap.test.sql: idéntico (cabecera pgTAP en el esquema tap) |
| 2 | solapada 10:15–10:45 con X: rechazada (23P01) | 02_overlap.test.sql: idéntico (cabecera pgTAP en el esquema tap) |
| 3 | idéntica 10:00–10:30 con X: rechazada (23P01) | 02_overlap.test.sql: idéntico (cabecera pgTAP en el esquema tap) |
| 4 | contigua 10:30–11:00 con X: aceptada | 02_overlap.test.sql: idéntico (cabecera pgTAP en el esquema tap) |
| 5 | misma hora con otro barbero (Y): aceptada | 02_overlap.test.sql: idéntico (cabecera pgTAP en el esquema tap) |
| 6 | tras cancelar, 10:00–10:30 con X: aceptada | 02_overlap.test.sql: idéntico (cabecera pgTAP en el esquema tap) |
| 7 | una sola cita activa de X a las 10:00 | 02_overlap.test.sql: idéntico (cabecera pgTAP en el esquema tap) |

### 03_timezone.test.sql

| # | Descripción | Destino |
|---|---|---|
| 1 | 10:00 hora de Bogotá se guarda como 15:00 UTC | 03_timezone.test.sql: idéntico (cabecera pgTAP en el esquema tap) |
| 2 | en UTC la cita es a las 15:00 | 03_timezone.test.sql: idéntico (cabecera pgTAP en el esquema tap) |
| 3 | se recupera como 10:00 hora local de la barbería | 03_timezone.test.sql: idéntico (cabecera pgTAP en el esquema tap) |
| 4 | zona horaria inexistente: rechazada | 03_timezone.test.sql: idéntico (cabecera pgTAP en el esquema tap) |
| 5 | zona horaria vacía: rechazada | 03_timezone.test.sql: idéntico (cabecera pgTAP en el esquema tap) |
| 6 | la barbería guarda su zona IANA | 03_timezone.test.sql: idéntico (cabecera pgTAP en el esquema tap) |
| 7 | el horario 09:00–18:00 se conserva en hora local | 03_timezone.test.sql: idéntico (cabecera pgTAP en el esquema tap) |

### 04_constraints.test.sql

| # | Descripción | Destino |
|---|---|---|
| 1 | cita válida con consentimiento: aceptada | 04_constraints.test.sql: idéntico (usuario de prueba en identity."user" en vez de auth.users) |
| 2 | cita sin consentimiento de datos: rechazada | 04_constraints.test.sql: idéntico (usuario de prueba en identity."user" en vez de auth.users) |
| 3 | teléfono sin prefijo internacional: rechazado | 04_constraints.test.sql: idéntico (usuario de prueba en identity."user" en vez de auth.users) |
| 4 | teléfono con espacios (no E.164): rechazado | 04_constraints.test.sql: idéntico (usuario de prueba en identity."user" en vez de auth.users) |
| 5 | correo inválido (formato): rechazado | 04_constraints.test.sql: idéntico (usuario de prueba en identity."user" en vez de auth.users) |
| 6 | nombre vacío: rechazado | 04_constraints.test.sql: idéntico (usuario de prueba en identity."user" en vez de auth.users) |
| 7 | cita con fin anterior al inicio: rechazada (duration_check / time_order_check) | 04_constraints.test.sql: idéntico (usuario de prueba en identity."user" en vez de auth.users) |
| 8 | cita con fin igual al inicio: rechazada (duration_check / time_order_check) | 04_constraints.test.sql: idéntico (usuario de prueba en identity."user" en vez de auth.users) |
| 9 | cita con duración 0: rechazada (service_duration_minutes_check / time_order_check) | 04_constraints.test.sql: idéntico (usuario de prueba en identity."user" en vez de auth.users) |
| 10 | fin distinto de inicio + duración (y posterior al inicio): rechazada | 04_constraints.test.sql: idéntico (usuario de prueba en identity."user" en vez de auth.users) |
| 11 | cita de más de 480 minutos (fin coherente): rechazada | 04_constraints.test.sql: idéntico (usuario de prueba en identity."user" en vez de auth.users) |
| 12 | cita con precio negativo: rechazada | 04_constraints.test.sql: idéntico (usuario de prueba en identity."user" en vez de auth.users) |
| 13 | cancelada sin cancelled_at: rechazada | 04_constraints.test.sql: idéntico (usuario de prueba en identity."user" en vez de auth.users) |
| 14 | activa con cancelled_at: rechazada | 04_constraints.test.sql: idéntico (usuario de prueba en identity."user" en vez de auth.users) |
| 15 | cita de A con un servicio de B: rechazada (FK compuesta) | 04_constraints.test.sql: idéntico (usuario de prueba en identity."user" en vez de auth.users) |
| 16 | se localizan las citas por teléfono o correo en la barbería | 04_constraints.test.sql: idéntico (usuario de prueba en identity."user" en vez de auth.users) |
| 17 | servicio de 0 minutos: rechazado | 04_constraints.test.sql: idéntico (usuario de prueba en identity."user" en vez de auth.users) |
| 18 | servicio de duración negativa: rechazado | 04_constraints.test.sql: idéntico (usuario de prueba en identity."user" en vez de auth.users) |
| 19 | servicio con precio negativo: rechazado | 04_constraints.test.sql: idéntico (usuario de prueba en identity."user" en vez de auth.users) |
| 20 | tramo con fin anterior al inicio: rechazado | 04_constraints.test.sql: idéntico (usuario de prueba en identity."user" en vez de auth.users) |
| 21 | día de la semana fuera de 1–7: rechazado | 04_constraints.test.sql: idéntico (usuario de prueba en identity."user" en vez de auth.users) |
| 22 | tramo solapado del mismo barbero y día: rechazado | 04_constraints.test.sql: idéntico (usuario de prueba en identity."user" en vez de auth.users) |
| 23 | segundo tramo el mismo día (mañana y tarde): aceptado | 04_constraints.test.sql: idéntico (usuario de prueba en identity."user" en vez de auth.users) |
| 24 | bloqueo con fin anterior al inicio: rechazado | 04_constraints.test.sql: idéntico (usuario de prueba en identity."user" en vez de auth.users) |
| 25 | subdominio con mayúsculas: rechazado (formato) | 04_constraints.test.sql: idéntico (usuario de prueba en identity."user" en vez de auth.users) |
| 26 | subdominio que empieza por guion: rechazado (formato) | 04_constraints.test.sql: idéntico (usuario de prueba en identity."user" en vez de auth.users) |
| 27 | subdominio reservado (www): rechazado (lista de reservados) | 04_constraints.test.sql: idéntico (usuario de prueba en identity."user" en vez de auth.users) |
| 28 | subdominio repetido: rechazado | 04_constraints.test.sql: idéntico (usuario de prueba en identity."user" en vez de auth.users) |
| 29 | admin sin barbería: rechazado | 04_constraints.test.sql: idéntico (usuario de prueba en identity."user" en vez de auth.users) |
| 30 | super admin con barbería: rechazado | 04_constraints.test.sql: idéntico (usuario de prueba en identity."user" en vez de auth.users) |
| 31 | borrar un barbero con citas: rechazado | 04_constraints.test.sql: idéntico (usuario de prueba en identity."user" en vez de auth.users) |
| 32 | borrar un servicio con citas: rechazado | 04_constraints.test.sql: idéntico (usuario de prueba en identity."user" en vez de auth.users) |
| 33 | borrar una barbería con barberos, servicios y citas: aceptado (cascada) | 04_constraints.test.sql: idéntico (usuario de prueba en identity."user" en vez de auth.users) |
| 34 | la cascada no deja huérfanos de A y no toca B | 04_constraints.test.sql: idéntico (usuario de prueba en identity."user" en vez de auth.users) |

### 05_phone_limit.test.sql

| # | Descripción | Destino |
|---|---|---|
| 1 | primera cita activa futura: aceptada | 05_phone_limit.test.sql: idéntico (cabecera pgTAP en el esquema tap) |
| 2 | segunda cita activa futura: aceptada | 05_phone_limit.test.sql: idéntico (cabecera pgTAP en el esquema tap) |
| 3 | tercera cita activa futura del mismo número: rechazada | 05_phone_limit.test.sql: idéntico (cabecera pgTAP en el esquema tap) |
| 4 | (f) insertar una cita ya cancelada: no se limita | 05_phone_limit.test.sql: idéntico (cabecera pgTAP en el esquema tap) |
| 5 | (b) las canceladas no cuentan: 2 canceladas + 2 activas, aceptadas | 05_phone_limit.test.sql: idéntico (cabecera pgTAP en el esquema tap) |
| 6 | (c) las citas pasadas no cuentan: 2 pasadas + 2 futuras, aceptadas | 05_phone_limit.test.sql: idéntico (cabecera pgTAP en el esquema tap) |
| 7 | (d) el mismo número en otra barbería no cuenta | 05_phone_limit.test.sql: idéntico (cabecera pgTAP en el esquema tap) |
| 8 | (e) otro número en la misma barbería no cuenta | 05_phone_limit.test.sql: idéntico (cabecera pgTAP en el esquema tap) |

### 06_cancel_token.test.sql

| # | Descripción | Destino |
|---|---|---|
| 1 | acepta hash de 32 bytes | 06_cancel_token.test.sql: idéntico (cabecera pgTAP en el esquema tap) |
| 2 | acepta hash null | 06_cancel_token.test.sql: idéntico (cabecera pgTAP en el esquema tap) |
| 3 | acepta varios hashes null (índice parcial) | 06_cancel_token.test.sql: idéntico (cabecera pgTAP en el esquema tap) |
| 4 | rechaza hash de 31 bytes | 06_cancel_token.test.sql: idéntico (cabecera pgTAP en el esquema tap) |
| 5 | rechaza hash de 33 bytes | 06_cancel_token.test.sql: idéntico (cabecera pgTAP en el esquema tap) |
| 6 | rechaza hash duplicado | 06_cancel_token.test.sql: idéntico (cabecera pgTAP en el esquema tap) |
| 7 | admin autenticado: no puede actualizar cancel_token_hash | 06_cancel_token.test.sql: idéntico en significado; la sesión se simula con `set local app.user_id` en lugar de `request.jwt.claims` |
| 8 | admin autenticado: sí puede cancelar (status y cancelled_at) | 06_cancel_token.test.sql: idéntico en significado; la sesión se simula con `set local app.user_id` en lugar de `request.jwt.claims` |


## Resultado en PostgreSQL propio (T012 / T013)

Los 224 asserts de origen tienen destino en `db/tests/`. Recuento actual (`pg_prove --ext .sql /tests/`):

| Archivo nuevo | Asserts | Origen |
|---|---|---|
| 00_structure.test.sql | 59 | 29 de 00_helpers, reescritos y ampliados (matriz de privilegios exactos por rol y tabla, EXECUTE exacto, propiedad de db_owner) |
| 01_isolation.test.sql | 131 | 131 de 01 (mismo número) |
| 02_overlap.test.sql | 7 | 7 |
| 03_timezone.test.sql | 7 | 7 |
| 04_constraints.test.sql | 34 | 34 |
| 05_phone_limit.test.sql | 8 | 8 |
| 06_cancel_token.test.sql | 8 | 8 |
| 07_roles.test.sql | 130 | nuevo: matriz de roles (test obligatorio 1), test obligatorio 5, identity, db_backup, CONNECT, pg_hba, membresías de los roles de trabajo (revisión, SEC-013) |
| **Total** | **384** | 224 de origen conservados + 160 nuevos |

## Cambios de significado y justificación

1. **`anon` desaparece** (ADR-017). Los 8 asserts de 01 (#74–#81) pasan a `app_login` sin rol de trabajo (una conexión que no cambió a `authenticated` ni `service_role`; `app_login` es NOINHERIT y no tiene privilegios propios): el significado "sin sesión no hay acceso a nada" se conserva. Los 7 asserts de 00 sobre privilegios de `anon` y los 3 de EXECUTE se sustituyen por la comprobación de privilegios **exactos** por rol y tabla/función, que es más fuerte.
2. **El super admin ya no escribe barberías con sesión** (data-model.md §Privilegios; las políticas `barbershops_insert/update/delete` se eliminan). Los asserts 01 #83–#85 esperan 42501. Se conserva que el super admin ve todas las barberías (#82), todos los perfiles (#86) y que no lee ni escribe datos internos de ninguna barbería (#88–#107).
3. **Rechazo por privilegio en vez de 0 filas por RLS** donde ahora falta el GRANT (UPDATE y DELETE de `barbershops` y `profiles`; UPDATE de `barber_schedules` y `barber_blocks`; DELETE de `appointments`): el assert pasa de `is_empty` a `throws_ok(…, '42501')`. Es un rechazo más fuerte (ni siquiera llega a RLS), así que ninguna garantía se pierde. Donde el rol sí tiene el privilegio, RLS sigue demostrándose con `is_empty`.
4. **Identidad**: `request.jwt.claims` → `set local app.user_id = '<uuid>'` (equivalente a `set_config('app.user_id', …, true)`); `auth.users` → `identity."user"`.
