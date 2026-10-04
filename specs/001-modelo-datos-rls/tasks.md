---
description: "Tareas de la fase 1: modelo de datos y aislamiento por barbería"
---

# Tareas: modelo de datos y aislamiento por barbería

**Entrada**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/acceso-por-rol.md](contracts/acceso-por-rol.md)

**Tests**: obligatorios (spec FR-016 y constitución, principio I).

**Formato**: `[ID] [P?] [Historia] Descripción`. `[P]` = paralelizable (archivos distintos, sin dependencias). Responsable entre corchetes al final: `[database]` o `[principal]`.

## Fase 1: preparación

- [x] T001 Añadir scripts `test:integration` (Vitest con `tests/integration`) y `db:types` (`supabase gen types typescript --local > src/lib/database.types.ts`) a `package.json`, con su configuración de Vitest [principal]

## Fase 2: base (bloquea todo lo demás)

- [x] T002 Migración `extensions_and_helpers`: extensión `btree_gist`, schema `private`, tipos `user_role`, `appointment_status` y `private.timerange`; función `private.is_valid_timezone` [database]
- [x] T003 Migración `tenancy`: tablas `barbershops` y `profiles` con sus `check`; funciones `private.current_barbershop_id()` y `private.is_super_admin()`; RLS, políticas según el contrato y `revoke all from anon` [database]

## Fase 3: historia 1 — aislamiento por barbería (P1)

- [x] T004 [US1] Migración `catalog`: `barbers`, `services`, `barber_schedules`, `barber_blocks` con FK compuestas, `check`, exclusión de tramos solapados, índices, RLS y políticas [database]
- [x] T005 [US1] Migración `appointments`: tabla con FK compuestas, `check` de coherencia (fin = inicio + duración, estado y `cancelled_at`), formatos E.164 y correo, consentimiento obligatorio, exclusión de solapamiento, índices, RLS y políticas [database]
- [x] T006 [US1] `supabase/tests/00_helpers.test.sql`: RLS activo en las siete tablas y `anon` sin privilegios [database]
- [x] T007 [US1] `supabase/tests/01_isolation.test.sql`: por cada tabla y operación, el admin de A no lee, crea, modifica ni borra datos de B (ni con su id, ni asignando `barbershop_id` de B, ni referenciando un barbero de B); sin sesión no hay acceso; el super admin gestiona barberías; un admin no puede modificar perfiles [database]

## Fase 4: historia 2 — sin solapamientos (P1)

- [x] T008 [P] [US2] `supabase/tests/02_overlap.test.sql`: los cinco escenarios de aceptación salvo la simultaneidad (solapado rechazado, contiguo aceptado, otro barbero aceptado, cancelada libera el hueco) [database]
- [x] T009 [P] [US2] `tests/integration/appointments-concurrency.test.ts`: dos inserciones simultáneas del mismo hueco contra la base local con la clave secreta; exactamente una aceptada (código `23P01` en la otra); borra lo que creó [principal]

## Fase 5: historia 3 — zona horaria (P1)

- [x] T010 [P] [US3] `supabase/tests/03_timezone.test.sql`: 10:00 en Bogotá se guarda como 15:00 UTC y se recupera como 10:00; zona inválida rechazada [database]

## Fase 6: historia 4 — consentimiento y formatos (P2)

- [x] T011 [P] [US4] `supabase/tests/04_constraints.test.sql`: cita sin consentimiento, teléfono no E.164, correo inválido, fin ≤ inicio, duración o precio inválidos, tramo y bloqueo invertidos, tramos solapados, subdominio inválido o reservado o repetido, `profiles` incoherente; borrar barbero con citas rechazado; borrar barbería borra en cascada [database]

## Fase 7: historia 5 — datos de prueba solo en local (P1)

- [x] T012 [US5] `supabase/seed.sql`: super admin; barberías `labarberia` y `elcorte` (`America/Bogota`) con un admin cada una (usuarios en `auth.users` y `auth.identities` con contraseña de demostración), 2 barberos, 3 servicios, horario de lunes a sábado en dos tramos, un bloqueo y 3 citas (una cancelada) [database]
- [x] T013 [US5] Verificar `npm run db:reset` desde cero (menos de 2 minutos), luego `npm run test:db` dos veces seguidas con el mismo resultado (sin residuos) [database]

## Fase 8: cierre

- [x] T014 Generar `src/lib/database.types.ts` con `npm run db:types`; `npm run lint`, `typecheck`, `test`, `test:db` y `test:integration` en verde [principal]
- [x] T015 Revisión de los tres agentes revisores; corregir hallazgos; informe consolidado en `Revisiones/` del vault [principal]
- [ ] T016 Actualizar `Arquitectura/modelo-de-datos.md` del vault con el modelo real; explicación breve al usuario; fusionar en `main` y commit [principal]

## Dependencias

- T002 → T003 → T004 → T005 → (T006, T007, T008, T010, T011, T012) → T013.
- T001 → T009 (también requiere T005).
- T013 y T009 → T014 → T015 → T016.
- Las tareas `[P]` de tests son archivos distintos; las hace el mismo agente `database`, así que no se lanzan agentes en paralelo en esta fase (plan, "Ejecución").
