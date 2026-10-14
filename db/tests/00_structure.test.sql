-- Comprobaciones de estructura sobre el catálogo (MAINT-003, SEC-003; spec 005, FR-003).
-- Recorre TODAS las tablas de public (relkind 'r'), así una tabla nueva queda cubierta sin tocar
-- el recorrido: RLS activo y privilegios EXACTOS por rol y tabla (data-model.md §Privilegios).
-- Sustituye a los asserts de `anon` (que ya no existe) por la tabla de privilegios exactos.
-- Se ejecuta como superusuario (pg_prove con -U postgres por peer); los roles se simulan en el resto de archivos.
begin;
create schema tap;
create extension pgtap with schema tap;
set search_path = tap, public;

select no_plan();

-- Salvaguarda: el recorrido del catálogo no está vacío (las siete tablas de la fase 1 como mínimo).
select ok(
  (select count(*) >= 7 from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'),
  'el catálogo de public tiene al menos las 7 tablas de la fase 1'
);

-- RLS activado en todas las tablas de public
select ok(c.relrowsecurity, format('RLS activo en %s', c.relname))
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

-- anon ya no existe (sustituye a "anon sin privilegios": no hay rol al que dar privilegios)
select hasnt_role('anon', 'el rol anon no existe');

-- Matriz de privilegios esperada. privs = privilegios de TABLA; upd_cols = columnas con UPDATE.
create temp table expected_privs (tbl text, role text, privs text[], upd_cols text[]);
insert into expected_privs values
  ('barbershops',      'authenticated', array['SELECT'], array[]::text[]),
  ('barbershops',      'service_role',  array['SELECT'], array[]::text[]),
  ('profiles',         'authenticated', array['SELECT'], array[]::text[]),
  ('profiles',         'service_role',  array[]::text[], array[]::text[]),
  ('barbers',          'authenticated', array['DELETE', 'INSERT', 'SELECT'], array['is_active', 'name']),
  ('barbers',          'service_role',  array['SELECT'], array[]::text[]),
  ('services',         'authenticated', array['DELETE', 'INSERT', 'SELECT'],
                                        array['duration_minutes', 'is_active', 'name', 'price']),
  ('services',         'service_role',  array['SELECT'], array[]::text[]),
  ('barber_schedules', 'authenticated', array['DELETE', 'INSERT', 'SELECT'], array[]::text[]),
  ('barber_schedules', 'service_role',  array['SELECT'], array[]::text[]),
  ('barber_blocks',    'authenticated', array['DELETE', 'INSERT', 'SELECT'], array[]::text[]),
  ('barber_blocks',    'service_role',  array['SELECT'], array[]::text[]),
  ('appointments',     'authenticated', array['SELECT'], array['cancelled_at', 'status']),
  ('appointments',     'service_role',  array['INSERT', 'SELECT'], array['cancelled_at', 'status']);

-- La matriz cubre todas las tablas de public y viceversa (una tabla nueva obliga a actualizarla)
select is(
  (select array_agg(distinct tbl collate "C" order by tbl collate "C") from expected_privs),
  (select array_agg(c.relname::text collate "C" order by c.relname::text collate "C")
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'),
  'la matriz de privilegios esperada cubre exactamente las tablas de public'
);

-- Privilegios de tabla exactos (también demuestra que no hay TRUNCATE, TRIGGER ni REFERENCES)
select table_privs_are('public', e.tbl, e.role, e.privs,
  format('%s: privilegios de tabla exactos en %s', e.role, e.tbl))
from expected_privs e
order by e.tbl, e.role;

-- Columnas actualizables exactas (SEC-001 y UPDATE por columna)
select is(
  coalesce((select array_agg(a.attname::text order by a.attname::text)
            from pg_attribute a
            where a.attrelid = format('public.%I', e.tbl)::regclass and a.attnum > 0 and not a.attisdropped
              and has_column_privilege(e.role, a.attrelid, a.attnum, 'UPDATE')), array[]::text[]),
  e.upd_cols,
  format('%s: columnas actualizables exactas en %s', e.role, e.tbl)
)
from expected_privs e
order by e.tbl, e.role;

-- authenticated y service_role sin TRUNCATE, TRIGGER ni REFERENCES (RLS no cubre TRUNCATE)
select ok(
  not has_table_privilege('authenticated', c.oid, 'TRUNCATE')
  and not has_table_privilege('authenticated', c.oid, 'TRIGGER')
  and not has_table_privilege('authenticated', c.oid, 'REFERENCES')
  and not has_table_privilege('service_role', c.oid, 'TRUNCATE')
  and not has_table_privilege('service_role', c.oid, 'TRIGGER')
  and not has_table_privilege('service_role', c.oid, 'REFERENCES'),
  format('authenticated y service_role sin TRUNCATE, TRIGGER ni REFERENCES en %s', c.relname)
)
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

-- Ningún privilegio de columna que no sea un UPDATE esperado (p. ej. INSERT o REFERENCES por columna)
select is_empty(
  $$ select c.relname, a.attname, x.privilege_type
     from pg_attribute a
     join pg_class c on c.oid = a.attrelid
     join pg_namespace n on n.oid = c.relnamespace,
     lateral aclexplode(a.attacl) x
     where n.nspname in ('public', 'identity', 'private') and a.attacl is not null
       and x.privilege_type <> 'UPDATE' $$,
  'no hay privilegios de columna distintos de UPDATE'
);

-- appointments: con sesión solo se actualizan status y cancelled_at (SEC-001)
select ok(
  not has_table_privilege('authenticated', 'public.appointments', 'UPDATE'),
  'authenticated sin UPDATE de tabla completa en appointments'
);
select ok(
  not has_table_privilege('service_role', 'public.appointments', 'UPDATE'),
  'service_role sin UPDATE de tabla completa en appointments'
);

-- Funciones auxiliares: EXECUTE exacto (lo que cambiaba para anon). Se excluyen los constructores
-- del tipo timerange, que genera Postgres.
create temp table private_functions as
select p.oid::regprocedure::text as sig, p.proname::text as name
from pg_proc p
where p.pronamespace = 'private'::regnamespace and p.proname !~ '^time(multi)?range$';

select is(
  (select array_agg(name order by name) from private_functions
   where has_function_privilege('authenticated', sig, 'execute')),
  array['current_barbershop_id', 'current_user_id', 'is_super_admin'],
  'authenticated solo ejecuta current_user_id, current_barbershop_id e is_super_admin'
);
select is(
  (select coalesce(array_agg(name order by name), array[]::text[]) from private_functions
   where has_function_privilege('service_role', sig, 'execute')),
  array[]::text[],
  'service_role no ejecuta ninguna función de private'
);
select is(
  (select coalesce(array_agg(name order by name), array[]::text[]) from private_functions
   where has_function_privilege('app_login', sig, 'execute')),
  array[]::text[],
  'app_login (sin rol de trabajo) no ejecuta ninguna función de private'
);
select ok(
  not has_function_privilege('public', 'private.is_valid_timezone(text)', 'execute'),
  'PUBLIC no ejecuta private.is_valid_timezone(text)'
);

-- Las funciones security definer fijan search_path
select ok(
  (select bool_and(p.prosecdef and p.proconfig @> array['search_path=""'])
   from pg_proc p
   where p.oid in ('private.current_barbershop_id()'::regprocedure, 'private.is_super_admin()'::regprocedure)),
  'funciones security definer con search_path vacío'
);
select ok(
  (select not p.prosecdef and p.proconfig @> array['search_path=""']
   from pg_proc p where p.oid = 'private.appointments_prevent_reactivation()'::regprocedure),
  'función del trigger de citas: security invoker y search_path vacío'
);
select ok(
  (select not p.prosecdef and p.proconfig @> array['search_path=""']
   from pg_proc p where p.oid = 'private.current_user_id()'::regprocedure),
  'private.current_user_id(): security invoker y search_path vacío'
);

-- Propiedad: db_owner es dueño de la base, los esquemas, las tablas y las funciones
select is(
  (select pg_get_userbyid(datdba) from pg_database where datname = current_database()),
  'db_owner'::name, 'db_owner es dueño de la base barberias'
);
select is(
  (select array_agg(nspname::text order by nspname::text) from pg_namespace
   where nspname in ('public', 'private', 'identity', 'extensions', 'dbmate')
     and pg_get_userbyid(nspowner) = 'db_owner'),
  array['dbmate', 'extensions', 'identity', 'private', 'public'],
  'db_owner es dueño de los esquemas public, private, identity, extensions y dbmate'
);
select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname in ('public', 'private', 'identity', 'dbmate') and c.relkind in ('r', 'p', 'v', 'm', 'S')
       and pg_get_userbyid(c.relowner) <> 'db_owner' $$,
  'todas las tablas y secuencias de la aplicación son de db_owner'
);
select is_empty(
  $$ select p.oid::regprocedure from pg_proc p
     where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace, 'identity'::regnamespace)
       and p.proname !~ '^time(multi)?range$' -- constructores del tipo: los crea Postgres con dueño postgres
       and pg_get_userbyid(p.proowner) <> 'db_owner' $$,
  'todas las funciones de la aplicación son de db_owner'
);

select * from finish();
rollback;
