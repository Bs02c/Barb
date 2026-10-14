---
description: "Tareas de la spec 006: portada de la barbería y estilo oscuro"
---

# Tareas: portada de la barbería y estilo oscuro

**Entrada**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/data-access.md](contracts/data-access.md), [contracts/ui.md](contracts/ui.md), [quickstart.md](quickstart.md), `DESIGN.md` 0.2.0.

**Tests**: obligatorios.
- Constitución I: toda política nueva lleva test de aislamiento, también con `app_login`.
- SC-002: `axe` sin violaciones.
- SC-006: horario y estado de apertura.

**Formato**: `- [ ] Tnnn [P?] [Historia?] Descripción [responsable]`.
- `[P]`: paralelizable.
- Responsables:
  - `[principal]`;
  - `[database]`: solo `db/`;
  - `[frontend]`: solo `src/app/`, `src/components/` y `tests/e2e/`.

**Reglas para todo agente**:
- Leer `AGENTS.md`: Next.js 16, así que consultar `node_modules/next/dist/docs/` antes de usar APIs de páginas, metadatos o server actions.
- Nombres de código en inglés; textos y comentarios en español.
- Ningún dato personal en logs.
- Terminar con `npm run lint` y `npm run typecheck` en verde y un reporte breve: qué se hizo, qué no y qué falló.

---

## Fase 1: preparación

- [ ] T001 [principal] Medir el TTFB de la portada actual: añadir la ruta `/` a `scripts/measure-ttfb.mjs` (junto a `/reservar` y `/admin`) y anotar en `specs/006-portada-barberia/ttfb.md` la sección "Antes" (`npm run build && npm run start`, `npm run perf:ttfb`).

---

## Fase 2: fundamentos (bloquea las historias)

### 2a. Base de datos (agente `database`)

- [ ] T002 [database] Crear `db/migrations/0002_portada_barberia.sql` (dbmate: `-- migrate:up` / `-- migrate:down`) según [data-model.md](data-model.md):
  - Columnas `public.barbershops.description text null`, `public.barbershops.address text null` y `public.services.description text null`, sin `default`.
  - Restricciones con nombre, literales:
    - `barbershops_description_check`: `description is null or (char_length(description) between 1 and 160 and description = btrim(description) and description !~ '[\r\n]')`;
    - `barbershops_address_check`: igual con `address` y 1–200;
    - `services_description_check`: igual con `description` de servicios y 1–200.
  - `grant update (description, address) on public.barbershops to authenticated;`
  - `grant update (description) on public.services to authenticated;` (se suma al privilegio de columna que ya existe).
  - Política `barbershops_update` `for update to authenticated using (id = (select private.current_barbershop_id())) with check (id = (select private.current_barbershop_id()));`.
  - Comentario en la migración con la tabla "Resultado por actor": INSERT y DELETE siguen denegados; `service_role` sin UPDATE.
  - `comment on column` en las tres columnas.
  - `migrate:down`: quitar la política, los privilegios y las columnas, en orden inverso.
- [ ] T003 [database] `db/tests/00_structure.test.sql`: actualizar la matriz exacta de privilegios para incluir `update (description, address)` en `barbershops` y `description` en el UPDATE de `services` para `authenticated`; `service_role` sin cambios.
- [ ] T004 [P] [database] `db/tests/01_isolation.test.sql`: nuevos asserts del UPDATE de `barbershops`, uno por fila de la tabla "Resultado por actor" de `data-model.md`:
  - admin A modifica `description` y `address` de A;
  - 0 filas sobre B;
  - `42501` al tocar `name`, `subdomain`, `timezone` o `is_active`;
  - admin con barbería desactivada: 0 filas;
  - usuario sin perfil: 0 filas;
  - super admin: 0 filas;
  - `service_role`: `42501`;
  - `app_login` sin rol: `42501`;
  - UPDATE de `services.description` de B por admin A: 0 filas.
- [ ] T005 [P] [database] `db/tests/04_constraints.test.sql`: asserts de las tres restricciones:
  - `''` rechazado;
  - solo espacios rechazado;
  - espacio inicial o final rechazado;
  - salto de línea rechazado;
  - 160/161 y 200/201 en el límite;
  - null aceptado.
- [ ] T006 [database] `db/seed.sql`:
  - "La Barbería": descripción "Cortes clásicos y barba con navaja, sin afanes." y dirección "Calle 45 # 12-30, Bogotá"; descripción breve en sus tres servicios.
  - "El Corte" sin descripción ni dirección.
  - Comprobar con `npm run db:reset` y `npm run test:db`.

### 2b. Capa de servidor compartida (principal; puede empezar en paralelo con 2a usando data-model.md)

- [ ] T007 [P] [principal] `src/lib/time.ts`: función `toLocalTimeOfDay(instant, timeZone)` → `"HH:MM"`, si no existe un equivalente; test en `src/lib/time.test.ts`, incluida una zona con horario de verano.
- [ ] T008 [P] [principal] `src/lib/storefront/hours.ts` + `hours.test.ts`: `weeklyHours`, `openingStatus`, `todayWeekday` y `mapsSearchUrl` según `contracts/data-access.md` y research R3–R5. Tests:
  - días sin tramos;
  - varios barberos y tramos el mismo día (apertura mínima, cierre máximo);
  - `[open, close)`: a la hora de cierre, cerrado;
  - antes de abrir;
  - después de cerrar con "mañana" y con el nombre de otro día;
  - ningún horario ("Cerrado ahora" sin próximo);
  - cambio de día en `America/Bogota`, con un `now` en UTC del día siguiente;
  - `mapsSearchUrl("Calle 45 # 12-30, Bogotá")` codifica `#`, la tilde y los espacios.
- [ ] T009 [principal] `src/lib/db/schema.ts`: columnas `description` y `address` en `barbershops` y `description` en `services` (nullable). `tests/integration/schema-drift.test.ts` en verde tras T002.

**Punto de control**: `npm run db:reset`, `test:db` y `test` en verde.

---

## Fase 3: Historia 2, estilo oscuro en toda la app (P1)

**Objetivo**: toda la app con `DESIGN.md` 0.2.0. **Prueba independiente**: los E2E existentes con `axe` en verde.

- [ ] T010 [P] [US2] [frontend] `src/app/globals.css` con los valores de `DESIGN.md` 0.2.0 (research R6):
  - `--primary` y `--selection` en `#d9822b`, con `--primary-foreground` y `--selection-foreground` en `#1a1410`;
  - `--accent` (hover de shadcn) en `#24201d`;
  - nuevos `--link: #e9a15a` y `--destructive-text: #f87171`, con sus `--color-*` en `@theme`;
  - radios `--radius-md: 10px` y `--radius-lg: 14px`;
  - `color-scheme: dark` en `html`;
  - actualizar el comentario de cabecera ("Tema oscuro único").
- [ ] T011 [US2] [frontend] Revisar todos los componentes y páginas (`src/components/**`, `src/app/**`):
  - sustituir colores literales (`bg-white`, `text-white`, `text-black`, colores fijos de Tailwind) por tokens;
  - enlaces y texto cobre con `text-link`;
  - mensajes de error con `text-destructive-text`;
  - el botón principal pasa a cobre con texto oscuro (DESIGN.md "Botón principal").
  - Probar la reserva, la cancelación, la política y el panel en 375 px y 1024 px.
- [ ] T012 [US2] [frontend] `npm run test:e2e` con `axe` en verde tras el cambio de tema. Corregir los contrastes que detecte.

---

## Fase 4: Historia 1, portada de la barbería (P1) 🎯 MVP

**Objetivo**: la portada de FR-001 a FR-007. **Prueba independiente**: `storefront.spec.ts` y la validación manual 1–4 de `quickstart.md`.

- [ ] T013 [US1] [principal] `src/lib/barbershops.ts`: `PublicBarbershop` gana `description` y `address`, en la misma consulta.
- [ ] T014 [US1] [principal] `src/lib/booking/queries.ts`, `getBookingCatalog`:
  - `CatalogService.description`;
  - sustituir el `EXISTS` por la lectura de tramos (`weekday`, `startTime`, `endTime`) de barberos **activos** de la barbería, en la misma transacción (con `LIMIT` defensivo);
  - devolver `weeklyHours` (con `weeklyHours()` de T008) y calcular `bookable` a partir de esos tramos.
  - El uso actual de la reserva no cambia.
- [ ] T015 [P] [US1] [principal] `tests/integration/booking.test.ts`, o un archivo nuevo `storefront.test.ts`:
  - `weeklyHours` con barberos activos e inactivos y tramos de varios días;
  - la descripción de los servicios;
  - un barbero de otra barbería no aparece;
  - la descripción y la dirección de `getPublicBarbershop`.
- [ ] T016 [US1] [frontend] Portada `src/app/s/[subdomain]/page.tsx` y componentes en `src/components/storefront/` según `contracts/ui.md`:
  - textura;
  - estado de apertura;
  - "Ver mapa" (`mapsSearchUrl`, pestaña nueva, `rel="noopener noreferrer"`);
  - "Reservar lo más pronto" → `/reservar`;
  - tarjetas de servicio con `aria-label="Reservar <servicio>"` → `/reservar?servicio=<id>`;
  - horario con `aria-current="date"` y "(hoy)";
  - mensaje sin servicios;
  - pie con la política;
  - `generateMetadata` con la descripción (FR-007).
  - `now` se pasa una vez desde la página.
- [ ] T017 [US1] [frontend] E2E:
  - `tests/e2e/booking.spec.ts`: el botón de la portada es "Reservar lo más pronto".
  - Nuevo `tests/e2e/storefront.spec.ts`:
    - la portada de labarberia muestra descripción, dirección, 3 servicios con descripción y 7 filas de horario con una `aria-current="date"`;
    - "Reservar Corte clásico" lleva al paso 2 con ese servicio;
    - la portada de elcorte no tiene líneas de descripción ni dirección;
    - `axe` en móvil y escritorio.

---

## Fase 5: Historia 3, "Mi barbería" en el panel (P2)

**Objetivo**: FR-010 a FR-015. **Prueba independiente**: E2E del admin y aislamiento con `app_login`.

- [ ] T018 [US3] [principal] `src/lib/admin/schemas.ts`:
  - `DESCRIPTION_MAX = 160`, `ADDRESS_MAX = 200` y `SERVICE_DESCRIPTION_MAX = 200`;
  - `barbershopInfoSchema` (`description`, `address`: `trim`, `''` → `null`, sin `\r`/`\n`, máximo; mensajes "Máximo 160 caracteres." / "Máximo 200 caracteres." / "Escríbelo en una sola línea.");
  - tests en `schemas.test.ts`.
- [ ] T019 [US3] [principal] `src/lib/admin/queries.ts`: `getBarbershopInfo()` con `withAdmin` (`name`, `description`, `address` de la barbería del contexto).
  - `src/lib/admin/actions.ts`: `updateBarbershopInfo(subdomain, prev, formData)`:
    - `requireAdmin` → Zod → `withAdmin` `update barbershops set description, address where id = barbershop.id` `returning id`;
    - 0 filas o `42501`: "No tienes permiso para hacer esto.";
    - éxito: "Datos guardados.";
    - revalidar `/admin/mi-barberia` y la portada.
- [ ] T020 [US3] [principal] `tests/integration/isolation-app-login.test.ts`:
  - admin A con `updateBarbershopInfo` en su subdominio modifica A;
  - admin A en el subdominio de B → redirige o no modifica B (comprobado como `db_owner`);
  - un UPDATE directo con `withAdmin(A)` sobre B → 0 filas;
  - un UPDATE de `name` con `withAdmin(A)` → `42501`.
- [ ] T021 [P] [US3] [frontend] `src/components/admin/admin-nav.tsx`: ítem "Mi barbería" (`/admin/mi-barberia`, icono `Store`).
  - `src/app/s/[subdomain]/admin/(panel)/mi-barberia/page.tsx` y `src/components/admin/barbershop-form.tsx` según `contracts/ui.md`: nombre en solo lectura, "Descripción" con contador n/160, "Dirección" (`maxLength` 200), texto de ayuda, "Guardar" y errores por campo.
- [ ] T022 [US3] [frontend] E2E `tests/e2e/admin-barbershop.spec.ts`:
  - login del admin de labarberia;
  - guardar una dirección nueva → "Datos guardados." → la portada la muestra;
  - restaurar el valor original al final;
  - `axe` en `/admin/mi-barberia`.

---

## Fase 6: Historia 4, descripción de los servicios (P3)

- [ ] T023 [US4] [principal] `serviceSchema` gana `description` (opcional, `trim`, `''` → `null`, sin saltos de línea, máximo `SERVICE_DESCRIPTION_MAX`).
  - `createService` y `updateService` la guardan; `listServices` y el tipo `Service` la devuelven (`description: string | null`).
  - Test de esquema.
- [ ] T024 [US4] [frontend] `src/components/admin/services-manager.tsx`: campo opcional "Descripción" (`maxLength` 200) en crear y editar, con su error por campo.
- [ ] T025 [US4] [principal] Test de integración: un servicio creado con descripción la devuelve `getBookingCatalog`; vaciarla la deja en null.

---

## Fase 7: cierre

- [ ] T026 [principal] Verificación completa: `lint`, `typecheck`, `test`, `db:reset`, `test:db`, `test:integration`, `PLAYWRIGHT_CHANNEL=msedge npm run test:e2e` y `build`. Anotar los recuentos.
- [ ] T027 [principal] TTFB "Después" en `ttfb.md`: `/` no supera en más de un 10 % al `/reservar` de la misma medición (SC-005).
- [ ] T028 [principal] Revisión de los **tres agentes** en paralelo sobre `main...006-portada-barberia` (hito de modelo de datos y RLS). Consolidar en `Revisiones/` del vault y corregir los Critical y High.
- [ ] T029 [principal] Documentación:
  - `CLAUDE.md`: estructura con `src/lib/storefront/`, portada y "Mi barbería";
  - vault: `Arquitectura/modelo-de-datos.md` (columnas, política y privilegios), `Estado-actual.md`, `Pendientes.md`, `Roadmap.md` (fotos, logo y reseñas siguen fuera) y bitácora.
- [ ] T030 [principal] Commit de cierre (`feat: portada de la barbería y estilo oscuro (spec 006)`), añadiendo archivos por nombre. Fusionar en `main` y `git push`.

---

## Dependencias y orden

- **T001** antes de cambiar la portada.
- **T002** → T003, T004 y T005 (paralelos) → T006. **T009** necesita T002.
- **T007** → T008 → T014.
- **US2 (T010–T012)** puede empezar al principio: solo toca estilos.
- **US1:** T013 y T014 necesitan T009; T016 necesita T013, T014 y T008; T017 necesita T016.
- **US3:** T018 → T019 → T020; T021 necesita T019 (contrato); T022 necesita T021.
- **US4:** T023 necesita T009; T024 necesita T023; T025 necesita T023.
- **Cierre:** después de todas las historias.

## Paralelismo sugerido

- **Ronda 1:**
  - `database`: T002–T006;
  - `frontend`: T010–T012 (tema);
  - principal: T001, T007 y T008.
- **Ronda 2:**
  - principal: T009, T013, T014, T018, T019 y T023;
  - después, `frontend`: T016, T021 y T024, con los contratos ya implementados.
- **Ronda 3:**
  - principal: T015, T020 y T025;
  - `frontend`: T017 y T022.

## Estrategia

- **MVP:** US2 + US1. La portada oscura con servicios y horario ya se puede enseñar con los datos del seed.
- US3 y US4 completan la gestión desde el panel.
- Un solo commit de cierre al final, como en las specs anteriores.
