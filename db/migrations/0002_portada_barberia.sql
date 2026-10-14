-- migrate:up
-- Spec 006: portada de la barbería. Descripción y dirección de la barbería, y descripción de cada
-- servicio. Son datos PÚBLICOS (los lee la web pública como service_role con el select de tabla ya
-- concedido). "Vacío" se guarda como null: el check rechaza '' y los textos con espacios en los
-- extremos o saltos de línea (una sola línea, sin relleno).

alter table public.barbershops
  add column description text,
  add column address text;
alter table public.services
  add column description text;

alter table public.barbershops
  add constraint barbershops_description_check
    check (description is null or (char_length(description) between 1 and 160
      and description = btrim(description) and description !~ '[\r\n]')),
  add constraint barbershops_address_check
    check (address is null or (char_length(address) between 1 and 200
      and address = btrim(address) and address !~ '[\r\n]'));
alter table public.services
  add constraint services_description_check
    check (description is null or (char_length(description) between 1 and 200
      and description = btrim(description) and description !~ '[\r\n]'));

comment on column public.barbershops.description is
  'Frase corta pública de la portada (1–160 caracteres, una línea, sin espacios en los extremos). Vacío = null.';
comment on column public.barbershops.address is
  'Dirección pública de la portada (1–200 caracteres, una línea, sin espacios en los extremos). Vacío = null.';
comment on column public.services.description is
  'Descripción pública del servicio (1–200 caracteres, una línea, sin espacios en los extremos). Vacío = null.';

-- Privilegios: solo las columnas nuevas (name, subdomain, timezone e is_active siguen sin UPDATE).
grant update (description, address) on public.barbershops to authenticated;
grant update (description) on public.services to authenticated;

-- Postgres evalúa TODOS los check de la fila en cada UPDATE, también el de timezone, que llama a
-- private.is_valid_timezone (baseline: nadie con sesión escribía barberías, así que no hacía falta
-- EXECUTE). Ahora authenticated actualiza barberías, así que necesita ejecutarla. Es una función
-- pura (solo valida un nombre de zona horaria), sin acceso a datos; no ejecutarla daría 42501 en
-- cualquier UPDATE de la barbería.
grant execute on function private.is_valid_timezone(text) to authenticated;

-- RLS de barbershops: UPDATE solo de la barbería propia del admin. Resultado por actor
-- (description/address; name, subdomain, timezone e is_active dan 42501 por privilegio de columna):
--   admin de A            : su barbería sí; la de B 0 filas
--   admin con A desactivada, usuario sin perfil, super admin: 0 filas (current_barbershop_id() es null)
--   service_role, app_login sin rol de trabajo: 42501 (sin privilegio de UPDATE)
-- INSERT y DELETE siguen denegados (sin privilegio ni política). service_role no tiene UPDATE.
create policy barbershops_update on public.barbershops
  for update to authenticated
  using (id = (select private.current_barbershop_id()))
  with check (id = (select private.current_barbershop_id()));

-- migrate:down
drop policy barbershops_update on public.barbershops;
revoke execute on function private.is_valid_timezone(text) from authenticated;
revoke update (description) on public.services from authenticated;
revoke update (description, address) on public.barbershops from authenticated;
alter table public.services drop constraint services_description_check;
alter table public.barbershops
  drop constraint barbershops_address_check,
  drop constraint barbershops_description_check;
alter table public.services drop column description;
alter table public.barbershops
  drop column address,
  drop column description;
