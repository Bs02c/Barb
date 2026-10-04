# Modelo de datos: fase 1

Todas las fechas y horas absolutas son `timestamptz` (UTC). Los horarios semanales son `time` en hora local de la barbería. Todas las tablas tienen `created_at timestamptz not null default now()`.

## Tipos

- `public.user_role`: `'super_admin' | 'admin'`
- `public.appointment_status`: `'active' | 'cancelled'`
- `private.timerange`: rango sobre `time`

## barbershops

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `name` | text | 1–100 caracteres |
| `subdomain` | text | único; `^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$`; no `www`, `app`, `api`, `admin` |
| `timezone` | text | zona IANA válida; por defecto `America/Bogota` |
| `is_active` | boolean | por defecto `true` |

## profiles

| Columna | Tipo | Reglas |
|---|---|---|
| `user_id` | uuid PK | FK `auth.users(id)` `on delete cascade` |
| `role` | `user_role` | |
| `barbershop_id` | uuid null | FK `barbershops(id)` `on delete cascade`. Nulo si y solo si `role = 'super_admin'` |

## barbers

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | uuid PK | |
| `barbershop_id` | uuid | FK `barbershops` `on delete cascade`; `unique (id, barbershop_id)` |
| `name` | text | 1–100 caracteres |
| `is_active` | boolean | por defecto `true` |

## services

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | uuid PK | |
| `barbershop_id` | uuid | FK `barbershops` `on delete cascade`; `unique (id, barbershop_id)` |
| `name` | text | 1–100 caracteres |
| `duration_minutes` | integer | entre 1 y 480 |
| `price` | numeric(12,2) | ≥ 0 |
| `is_active` | boolean | por defecto `true` |

## barber_schedules (tramos del horario semanal)

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | uuid PK | |
| `barbershop_id` | uuid | FK `barbershops` `on delete cascade` |
| `barber_id` | uuid | FK `(barber_id, barbershop_id)` → `barbers(id, barbershop_id)` `on delete cascade` |
| `weekday` | smallint | 1 (lunes) … 7 (domingo) |
| `start_time` | time | hora local |
| `end_time` | time | `> start_time` |
| | | sin tramos solapados del mismo barbero y día (exclusión con `timerange`) |

## barber_blocks (ausencias puntuales)

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | uuid PK | |
| `barbershop_id` | uuid | FK `barbershops` `on delete cascade` |
| `barber_id` | uuid | FK compuesta a `barbers` `on delete cascade` |
| `starts_at` | timestamptz | |
| `ends_at` | timestamptz | `> starts_at` |
| `reason` | text null | hasta 200 caracteres |

## appointments

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | uuid PK | |
| `barbershop_id` | uuid | FK `barbershops` `on delete cascade` |
| `barber_id` | uuid | FK compuesta a `barbers` `on delete no action` |
| `service_id` | uuid | FK compuesta a `services` `on delete no action` |
| `starts_at` | timestamptz | |
| `ends_at` | timestamptz | `= starts_at + service_duration_minutes` |
| `service_duration_minutes` | integer | copia del servicio al reservar; 1–480 |
| `service_price` | numeric(12,2) | copia del servicio al reservar; ≥ 0 |
| `status` | `appointment_status` | por defecto `'active'` |
| `cancelled_at` | timestamptz null | no nulo si y solo si `status = 'cancelled'` |
| `customer_name` | text | 1–100 caracteres |
| `customer_phone` | text | E.164 |
| `customer_email` | text | formato de correo; hasta 254 caracteres |
| `data_consent_at` | timestamptz | obligatorio |
| | | exclusión: `(barber_id =, tstzrange(starts_at, ends_at, '[)') &&) where status = 'active'` |

**Índices** además de PK, únicos y exclusiones:
- `appointments`: `(barbershop_id, starts_at)`, `(barber_id, starts_at)` (cubre la FK a barbers y la agenda por barbero; el índice de la exclusión es parcial y no sirve para la FK), `(barbershop_id, customer_phone)`, `(barbershop_id, customer_email)`, `(service_id)`.
- `barbers`, `services`, `barber_schedules`: `(barbershop_id)`.
- `barber_blocks`: `(barbershop_id, starts_at)`, `(barber_id)`.
- `profiles`: `(barbershop_id)`.

**Transiciones de estado de una cita**: `active → cancelled`. No hay vuelta atrás: un trigger lo impide para cualquier rol. Reagendar está fuera del MVP.

**Barbería desactivada**: con `is_active = false`, `private.current_barbershop_id()` devuelve null para sus admins y pierden todo acceso.

## Funciones auxiliares (schema `private`)

| Función | Devuelve | Uso |
|---|---|---|
| `private.current_barbershop_id()` | uuid o null | barbería del usuario con sesión |
| `private.is_super_admin()` | boolean | si el usuario con sesión es super admin |
| `private.is_valid_timezone(text)` | boolean | `check` de `barbershops.timezone` |

Las políticas RLS por tabla y operación están en [contracts/acceso-por-rol.md](contracts/acceso-por-rol.md).
