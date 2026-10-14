#!/usr/bin/env bash
# Roles del cluster (spec 005, ADR-017, data-model.md §Roles).
# Lo ejecuta docker-entrypoint-initdb.d como `postgres` la primera vez; también se puede volver
# a ejecutar a mano (idempotente) para rotar contraseñas o tras recrear la base:
#   docker compose -f compose.dev.yml exec -u postgres db bash /docker-entrypoint-initdb.d/10-roles.sh
# Las contraseñas se leen de archivos (/run/secrets/<rol>_password o <ROL>_PASSWORD_FILE). Nunca
# se escriben en este archivo ni se interpolan en el texto del SQL: psql las lee con \set ... `cat`
# y las usa como literal con :'variable'.
set -euo pipefail

DB="${POSTGRES_DB:-barberias}"

secret_file() { # secret_file db_owner -> ruta del archivo de la contraseña
  local role="$1" var
  var="$(printf '%s' "${role}" | tr '[:lower:]' '[:upper:]')_PASSWORD_FILE"
  printf '%s' "${!var:-/run/secrets/${role}_password}"
}

for r in db_owner app_login auth_login db_backup; do
  f="$(secret_file "$r")"
  [ -s "$f" ] || { echo "roles.sh: falta el secreto de ${r} (${f})" >&2; exit 1; }
done

psql -v ON_ERROR_STOP=1 --no-psqlrc -U postgres -d "$DB" \
  -v f_owner="$(secret_file db_owner)" \
  -v f_app="$(secret_file app_login)" \
  -v f_auth="$(secret_file auth_login)" \
  -v f_backup="$(secret_file db_backup)" <<'SQL'
-- pg_stat_statements está precargado: sin esto, los ALTER ROLE … PASSWORD de abajo podrían quedar
-- registrados con la contraseña en sus estadísticas (revisión spec 005, SEC-006).
set pg_stat_statements.track_utility = off;
-- Contraseñas: leídas del archivo, nunca visibles en este texto.
\set pw_owner `cat :f_owner`
\set pw_app `cat :f_app`
\set pw_auth `cat :f_auth`
\set pw_backup `cat :f_backup`

-- 1. Crear los roles que falten (sin contraseña; se fija más abajo).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'db_owner') then
    create role db_owner login;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'db_backup') then
    create role db_backup login;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'app_login') then
    create role app_login login;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'auth_login') then
    create role auth_login login;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end
$$;

-- 2. Atributos exactos (se reaplican siempre) y contraseñas.
alter role db_owner      login nosuperuser nobypassrls nocreatedb nocreaterole inherit password :'pw_owner';
alter role db_backup     login nosuperuser bypassrls nocreatedb nocreaterole inherit password :'pw_backup';
alter role app_login     login nosuperuser nobypassrls nocreatedb nocreaterole noinherit password :'pw_app';
alter role auth_login    login nosuperuser nobypassrls nocreatedb nocreaterole inherit password :'pw_auth';
alter role authenticated nologin nosuperuser nobypassrls nocreatedb nocreaterole inherit;
alter role service_role  nologin nosuperuser bypassrls nocreatedb nocreaterole inherit;

-- 3. Membresías. app_login no hereda nada: solo puede cambiar de rol por transacción (SET ROLE).
grant authenticated, service_role to app_login with inherit false, set true;
grant pg_read_all_data to db_backup;

-- 4. Límites de las conexiones de la app y de la autenticación.
alter role app_login  set statement_timeout = '8s';
alter role app_login  set lock_timeout = '5s';
alter role app_login  set idle_in_transaction_session_timeout = '10s';
alter role app_login  set timezone = 'UTC';
alter role auth_login set statement_timeout = '8s';
alter role auth_login set lock_timeout = '5s';
alter role auth_login set idle_in_transaction_session_timeout = '10s';
alter role auth_login set timezone = 'UTC';
alter role auth_login set search_path = identity;

-- 5. La base es de db_owner.
select format('alter database %I owner to db_owner', current_database()) \gexec

-- 6. pg_stat_statements (requiere superusuario) en un esquema que nadie más usa.
create schema if not exists extensions authorization db_owner;
create extension if not exists pg_stat_statements with schema extensions;
SQL

# 7. Marca de base LOCAL (revisión spec 005, SEC-004). Solo compose.dev.yml pone BARBERIAS_ENV=local.
# Los tests, el seed y los scripts comprueban app.env = 'local' en su propia conexión, no la IP: un
# túnel SSH a la base del VPS también es 127.0.0.1. En el VPS esta variable NO se define.
if [ "${BARBERIAS_ENV:-}" = "local" ]; then
  psql -v ON_ERROR_STOP=1 --no-psqlrc -U postgres -d "$DB" -c "alter database \"$DB\" set app.env = 'local'"
fi
