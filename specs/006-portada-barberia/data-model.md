# Modelo de datos: spec 006

Migración nueva `db/migrations/0002_portada_barberia.sql` (dbmate, con `-- migrate:up` y `-- migrate:down`). No se edita `0001_baseline.sql` (constitución, "Nunca").

## Columnas nuevas

| Tabla | Columna | Tipo | Restricción |
|---|---|---|---|
| `public.barbershops` | `description` | `text null` | `barbershops_description_check`: `description is null or (char_length(description) between 1 and 160 and description = btrim(description) and description !~ '[\r\n]')` |
| `public.barbershops` | `address` | `text null` | `barbershops_address_check`: igual, con 1–200 |
| `public.services` | `description` | `text null` | `services_description_check`: igual, con 1–200 |

- Sin `default`: las filas existentes quedan en null.
- `comment on column` en las tres: qué son, que son públicas y que "vacío" es null.

## Privilegios (cambios respecto a la spec 005)

| Rol | Tabla | Antes | Después |
|---|---|---|---|
| `authenticated` | `barbershops` | `select` | `select`, `update (description, address)` |
| `authenticated` | `services` | `update (name, duration_minutes, price, is_active)` | `update (name, duration_minutes, price, is_active, description)` |
| `authenticated` | función `private.is_valid_timezone(text)` | sin `execute` | `execute` (hallazgo de la implementación: Postgres evalúa todos los `check` de la fila en cada UPDATE, también el de `timezone`, que llama a esta función; sin el permiso, cualquier UPDATE de la barbería daría `42501`. Es pura: solo valida un nombre de zona, sin acceso a datos ni `SECURITY DEFINER`) |
| `service_role` | `barbershops`, `services` | `select` | sin cambios (el `select` de tabla incluye las columnas nuevas) |
| `app_login`, `auth_login`, `db_backup` | — | — | sin cambios |

## Políticas RLS

| Tabla | Política | Operación | Rol | Condición |
|---|---|---|---|---|
| `barbershops` | `barbershops_update` (nueva) | UPDATE | `authenticated` | `using (id = (select private.current_barbershop_id()))` `with check (id = (select private.current_barbershop_id()))` |

Sin cambios en el resto. `services_update` ya limita a la barbería del admin.

**Resultado por actor** (lo que deben probar los pgTAP y la integración):

| Actor | Modifica `description`/`address` de su barbería | De otra barbería | `name`, `subdomain`, `timezone`, `is_active` |
|---|---|---|---|
| Admin de A | sí | 0 filas | `42501` |
| Admin de A con su barbería desactivada | 0 filas | 0 filas | `42501` |
| Usuario sin perfil | 0 filas | 0 filas | `42501` |
| Super admin | 0 filas | 0 filas | `42501` |
| `service_role` | `42501` | `42501` | `42501` |
| `app_login` sin cambiar de rol | `42501` | `42501` | `42501` |

## Esquema TypeScript

`src/lib/db/schema.ts` (escrito a mano; lo vigila `schema-drift.test.ts`):
- `barbershops.description` y `barbershops.address`: `text(...)` sin `notNull`.
- `services.description`: igual.

## Datos de demostración (`db/seed.sql`)

- **La Barbería:**
  - descripción "Cortes clásicos y barba con navaja, sin afanes.";
  - dirección "Calle 45 # 12-30, Bogotá";
  - descripción en sus tres servicios.
- **El Corte:** sin descripción ni dirección, para enseñar y probar la portada sin esas líneas.

## Datos derivados (no se guardan)

- **Horario semanal de la barbería:** se deriva de `barber_schedules` ⋈ `barbers` (`is_active`) de la barbería. Ver `research.md` R3–R4.
