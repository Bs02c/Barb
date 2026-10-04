-- Fase 1 (T002): extensiones, schema privado, tipos y validación de zona horaria.
-- Spec: specs/001-modelo-datos-rls (data-model.md, research.md §1, §6 y §7).

-- btree_gist permite combinar igualdad (barber_id) y solapamiento de rangos en una
-- misma restricción de exclusión (citas y tramos de horario).
create extension if not exists btree_gist with schema extensions;

-- Schema no expuesto por la API de Supabase (no está en config.toml [api].schemas).
-- Aquí viven las funciones auxiliares que usan las políticas RLS.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- Roles con sesión en el MVP. El cliente final no tiene cuenta.
create type public.user_role as enum ('super_admin', 'admin');

-- Estados de una cita. Única transición: active -> cancelled.
create type public.appointment_status as enum ('active', 'cancelled');

-- Rango sobre "time" para impedir tramos de horario semanal solapados.
-- Uso: private.timerange(start_time, end_time, '[)').
create type private.timerange as range (subtype = time);

-- Devuelve true si "tz" es una zona horaria que Postgres reconoce (p. ej. 'America/Bogota').
-- Se declara immutable para poder usarla en un check; la lista de zonas solo cambia al
-- actualizar Postgres (research §6).
create function private.is_valid_timezone(tz text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  perform now() at time zone tz;
  return true;
exception
  when invalid_parameter_value then
    return false;
end;
$$;

-- La usa el check de barbershops: la necesita quien inserta o actualiza barberías
-- (super admin con sesión y el servidor con la clave secreta).
revoke execute on function private.is_valid_timezone(text) from public, anon;
grant execute on function private.is_valid_timezone(text) to authenticated, service_role;
